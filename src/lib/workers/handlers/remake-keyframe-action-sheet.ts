import type { Job } from 'bullmq'
import { actionSheetTaskPayloadSchema } from '@/lib/remake-projects/keyframes/action-sheet-task-contract'
import { persistActionSheet, type ActionSheetSlot } from '@/lib/remake-projects/keyframes/action-sheet'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive } from '../utils'

export async function handleRemakeKeyframeActionSheetTask(job: Job<TaskJobData>) {
  const payload = actionSheetTaskPayloadSchema.parse(job.data.payload)
  if (payload.projectId !== job.data.projectId) throw new Error('REMAKE_KEYFRAME_PROJECT_MISMATCH')
  await assertTaskActive(job, 'remake_action_sheet_preflight')
  await reportTaskProgress(job, 35, { stage: 'persist_remake_action_sheet' })
  const result = await persistActionSheet({
    projectId: payload.projectId,
    shotId: payload.shotId,
    revisionId: payload.revisionId,
    confirmed: payload.confirmed,
    sources: payload.sources.map((source) => ({ slot: source.slot as ActionSheetSlot, mediaId: source.mediaId, timestamp: source.timestamp })),
    taskId: job.data.taskId,
  })
  await reportTaskProgress(job, 95, { stage: 'persist_remake_action_sheet' })
  return result
}
