import type { Job } from 'bullmq'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { renderAndPersistUnitActionSheet } from '@/lib/remake-projects/unit/action-sheet'
import {
  appendVideoUnitBatch,
  assertVideoUnitSubmissionCurrent,
} from '@/lib/remake-projects/unit/service'
import { parseVideoUnitTaskPayload } from '@/lib/remake-projects/unit/task-contract'
import { resolveVideoUnitReferenceStorageKeys } from '@/lib/remake-projects/video/service'
import { supportsShotGroupMultiReferenceModes } from '@/lib/shot-group/video-config'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive, resolveVideoSourceFromGeneration, uploadVideoSourceToCos } from '../utils'
import { buildArkContentItems, isImageReference } from '../ark-content-items'

/**
 * D-07/D-09/D-22 unit video generation worker handler (Plan 09.1-05).
 *
 * Mirrors `handleRemakeVideoTask` for the merged unit: parse the frozen unit
 * task payload (fingerprint re-verified), re-check submission currentness,
 * render + persist the merged action sheet INSIDE the task flow (W5 — the
 * ONLY persist call for the sheet; deduped by unitActionSheetFingerprint),
 * resolve the unit snapshot's references (the deferred action-sheet marker
 * resolves through the persisted sheet's MediaObject), run the frozen input
 * through the existing video gateway with generationMode forced to normal
 * (D-09), upload to COS, and append an immutable, playable unit version
 * idempotently (trackId_operationKey).
 */

export async function handleRemakeVideoUnitTask(job: Job<TaskJobData>) {
  const payload = parseVideoUnitTaskPayload(job.data.payload)
  const snapshot = payload.inputSnapshot

  // D-22: re-verify fingerprint + submission currentness BEFORE any provider
  // work (member set, active revisions, adopted-keyframe media equality).
  await assertVideoUnitSubmissionCurrent(snapshot)
  await assertTaskActive(job, 'remake_video_unit_preflight')

  await reportTaskProgress(job, 10, { stage: 'preparing_references' })

  // W5/D-07: render + persist the merged N-grid action sheet from the frozen
  // member sources. This is the only place the merged sheet is persisted; the
  // submission path and the preview endpoint never call the persist helper,
  // and the fingerprint dedup makes re-renders idempotent.
  await reportTaskProgress(job, 15, { stage: 'rendering_action_sheet' })
  // Phase 09.3: render from the frozen action-sheet grid when present;
  // legacy snapshots (no grid) fall back to one cell per member.
  const grid = snapshot.actionSheetGrid
  const sheetSources = grid
    ? grid.cells.map((cell, index) => ({
        ordinal: index + 1,
        mediaId: cell.mediaId,
        timestamp: index * 1000,
        label: `镜头${cell.shotNumber}·${cell.slot === 'start' ? '首' : cell.slot === 'end' ? '尾' : '中'}`,
      }))
    : snapshot.members.map((member) => ({
        ordinal: member.ordinal,
        mediaId: member.selectedKeyframe.mediaId,
        timestamp: member.ordinal * 1000,
      }))
  const sheet = await renderAndPersistUnitActionSheet({
    projectId: snapshot.remakeProjectId,
    unitId: snapshot.unitId,
    sources: sheetSources,
    ...(grid ? { columns: grid.columns } : {}),
  })

  // Resolve references and normalize for the video gateway. The frozen
  // snapshot is not mutated, so the D-22 fingerprint stays valid for append.
  if (!sheet.mediaId) throw new Error('REMAKE_VIDEO_REFERENCE_UNAVAILABLE')
  const referenceRefs = await resolveVideoUnitReferenceStorageKeys(snapshot, sheet.mediaId)
  const firstImageRef = referenceRefs.find((ref) => isImageReference(ref)) || referenceRefs[0]
  if (!firstImageRef) throw new Error('REMAKE_VIDEO_NO_REFERENCES')

  const imageBase64 = await normalizeToBase64ForGeneration(firstImageRef.signedUrl)

  // Omni-reference parity: Ark models receive the full content[] plan
  // (reference_image + reference_audio). Non-Ark models degrade to a single
  // main image (composite_image_mvp) without contentItems.
  const isMultiReference = (snapshot.referenceMode ?? undefined) === 'ark_content_multireference'
    || (snapshot.referenceMode === undefined && supportsShotGroupMultiReferenceModes(snapshot.model.id))
  const contentItems = isMultiReference
    ? await buildArkContentItems(referenceRefs)
    : undefined

  await reportTaskProgress(job, 30, { stage: 'submitting_to_provider' })

  const generated = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: snapshot.model.id,
    imageUrl: imageBase64,
    options: {
      prompt: snapshot.promptText,
      duration: snapshot.durationSeconds,
      ...Object.fromEntries(
        Object.entries(snapshot.options).filter(([key]) => key !== 'duration'),
      ),
      ...(contentItems ? { contentItems } : {}),
      // D-09: the merged unit always runs in normal mode — never firstlastframe.
      generationMode: 'normal',
    },
    pollProgress: { start: 35, end: 85 },
  })

  await reportTaskProgress(job, 88, { stage: 'uploading_result' })

  const cosKey = await uploadVideoSourceToCos(
    generated.url,
    `remake/${snapshot.remakeProjectId}/videos`,
    job.data.taskId,
    generated.downloadHeaders,
  )

  const mediaObj = await ensureMediaObjectFromStorageKey(cosKey, { mimeType: 'video/mp4' })

  await assertTaskActive(job, 'remake_video_unit_persist')
  await reportTaskProgress(job, 92, { stage: 'persisting_result' })

  return await appendVideoUnitBatch({
    taskId: job.data.taskId,
    operationKey: payload.operationKey,
    inputSnapshot: snapshot,
    inputFingerprint: payload.inputFingerprint,
    mediaId: mediaObj.id,
  })
}
