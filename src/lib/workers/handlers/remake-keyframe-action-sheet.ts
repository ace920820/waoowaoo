import type { Job } from 'bullmq'
import sharp from 'sharp'
import { actionSheetTaskPayloadSchema } from '@/lib/remake-projects/keyframes/action-sheet-task-contract'
import { persistActionSheet, renderActionSheet, type ActionSheetSlot, type ActionSheetSource } from '@/lib/remake-projects/keyframes/action-sheet'
import { processMediaResult } from '@/lib/media-process'
import { ensureMediaObjectFromStorageKey, getMediaObjectById } from '@/lib/media/service'
import { getObjectBuffer } from '@/lib/storage'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive } from '../utils'

async function resolveSourceBuffer(mediaId: string): Promise<Buffer> {
  const media = await getMediaObjectById(mediaId)
  const storageKey = media?.storageKey ?? mediaId
  if (!storageKey) throw new Error('REMAKE_ACTION_SHEET_SOURCE_UNAVAILABLE')
  return await getObjectBuffer(storageKey)
}

export async function handleRemakeKeyframeActionSheetTask(job: Job<TaskJobData>) {
  const payload = actionSheetTaskPayloadSchema.parse(job.data.payload)
  if (payload.projectId !== job.data.projectId) throw new Error('REMAKE_KEYFRAME_PROJECT_MISMATCH')
  await assertTaskActive(job, 'remake_action_sheet_preflight')
  await reportTaskProgress(job, 20, { stage: 'resolve_action_sheet_sources' })

  const sources: ActionSheetSource[] = []
  for (const source of payload.sources) {
    sources.push({
      slot: source.slot as ActionSheetSlot,
      mediaId: source.mediaId,
      timestamp: source.timestamp,
      buffer: await resolveSourceBuffer(source.mediaId),
    })
  }

  await reportTaskProgress(job, 55, { stage: 'render_action_sheet' })
  const rendered = await renderActionSheet(sources)
  const meta = await sharp(rendered).metadata()

  await reportTaskProgress(job, 75, { stage: 'upload_action_sheet' })
  const storageKey = await processMediaResult({
    source: rendered,
    type: 'image',
    keyPrefix: `remake/${payload.projectId}/action-sheets`,
    targetId: payload.revisionId,
  })
  // Register as a MediaObject so its id (slash-free) can be served by the media route.
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: 'image/jpeg',
    width: meta.width ?? undefined,
    height: meta.height ?? undefined,
    sizeBytes: rendered.byteLength,
  })

  await reportTaskProgress(job, 85, { stage: 'persist_remake_action_sheet' })
  const result = await persistActionSheet({
    projectId: payload.projectId,
    shotId: payload.shotId,
    revisionId: payload.revisionId,
    confirmed: payload.confirmed,
    sources: sources.map((source) => ({ slot: source.slot, mediaId: source.mediaId, timestamp: source.timestamp })),
    mediaId: media.id,
    taskId: job.data.taskId,
  })
  await reportTaskProgress(job, 95, { stage: 'persist_remake_action_sheet' })
  return result
}
