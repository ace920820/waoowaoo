import type { Job } from 'bullmq'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { parseRemakeVideoTaskPayload } from '@/lib/remake-projects/video/task-contract'
import type { OrderedVideoReference } from '@/lib/remake-projects/video/contracts'
import {
  appendVideoGenerationBatch,
  assertVideoSubmissionCurrent,
  resolveVideoReferenceStorageKeys,
} from '@/lib/remake-projects/video/service'
import { supportsShotGroupMultiReferenceModes } from '@/lib/shot-group/video-config'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive, resolveVideoSourceFromGeneration, uploadVideoSourceToCos } from '../utils'

type SignedReference = OrderedVideoReference & { signedUrl: string }

function isImageReference(ref: OrderedVideoReference): boolean {
  if (ref.mediaType) return ref.mediaType === 'image'
  return ref.role !== 'character_audio_reference'
}

/**
 * Build Ark content[] items from the frozen reference plan:
 *   - images become `image_url` with `role: 'reference_image'` (base64 data URLs);
 *   - audio becomes `audio_url` with `role: 'reference_audio'` (signed URLs).
 * Order matches the snapshot ordinals exactly.
 */
async function buildArkContentItems(referenceRefs: SignedReference[]) {
  const contentItems: Array<Record<string, unknown>> = []
  for (const ref of referenceRefs) {
    if (isImageReference(ref)) {
      const base64 = await normalizeToBase64ForGeneration(ref.signedUrl)
      contentItems.push({
        type: 'image_url',
        image_url: { url: base64 },
        role: 'reference_image',
      })
    } else {
      contentItems.push({
        type: 'audio_url',
        audio_url: { url: ref.signedUrl },
        role: 'reference_audio',
      })
    }
  }
  return contentItems
}

export async function handleRemakeVideoTask(job: Job<TaskJobData>) {
  const payload = parseRemakeVideoTaskPayload(job.data.payload)
  const snapshot = payload.inputSnapshot

  await assertVideoSubmissionCurrent(snapshot)
  await assertTaskActive(job, 'remake_video_preflight')

  await reportTaskProgress(job, 10, { stage: 'preparing_references' })

  // Resolve references and normalize for the video gateway
  const referenceRefs = await resolveVideoReferenceStorageKeys(snapshot)
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

  await reportTaskProgress(job, 20, { stage: 'submitting_to_provider' })

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
      generationMode: snapshot.options.generationMode === 'firstlastframe' ? 'firstlastframe' : 'normal',
    },
    pollProgress: { start: 25, end: 85 },
  })

  await reportTaskProgress(job, 88, { stage: 'uploading_result' })

  const cosKey = await uploadVideoSourceToCos(
    generated.url,
    `remake/${snapshot.remakeProjectId}/videos`,
    job.data.taskId,
    generated.downloadHeaders,
  )

  const mediaObj = await ensureMediaObjectFromStorageKey(cosKey, { mimeType: 'video/mp4' })

  await assertTaskActive(job, 'remake_video_persist')
  await reportTaskProgress(job, 92, { stage: 'persisting_result' })

  return await appendVideoGenerationBatch({
    taskId: job.data.taskId,
    operationKey: payload.operationKey,
    inputSnapshot: snapshot,
    inputFingerprint: payload.inputFingerprint,
    mediaId: mediaObj.id,
  })
}
