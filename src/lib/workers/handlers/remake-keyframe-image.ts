import type { Job } from 'bullmq'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { parseRemakeKeyframeTaskPayload } from '@/lib/remake-projects/keyframes/task-contract'
import {
  appendKeyframeGenerationBatch,
  assertKeyframeSubmissionCurrent,
  resolveKeyframeReferenceStorageKeys,
} from '@/lib/remake-projects/keyframes/service'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive, resolveImageSourceFromGeneration, uploadImageSourceToCos } from '../utils'

export async function handleRemakeKeyframeImageTask(job: Job<TaskJobData>) {
  const payload = parseRemakeKeyframeTaskPayload(job.data.payload)
  const snapshot = payload.inputSnapshot
  await assertKeyframeSubmissionCurrent(snapshot)
  await assertTaskActive(job, 'remake_keyframe_preflight')

  const references = await resolveKeyframeReferenceStorageKeys(snapshot)
  const normalizedReferences = await normalizeReferenceImagesForGeneration(references)
  const mediaIds: string[] = []
  for (let ordinal = 1; ordinal <= snapshot.requestedCandidateCount; ordinal++) {
    await reportTaskProgress(job, 15 + Math.floor(((ordinal - 1) / snapshot.requestedCandidateCount) * 70), {
      stage: 'generate_remake_keyframe_candidate',
      candidateIndex: ordinal,
    })
    const source = await resolveImageSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: snapshot.model.id,
      prompt: snapshot.promptText,
      options: { ...snapshot.options, referenceImages: normalizedReferences },
    })
    const storageKey = await uploadImageSourceToCos(source, `remake/${snapshot.remakeProjectId}/keyframes`, `${job.data.taskId}-${ordinal}`)
    mediaIds.push((await ensureMediaObjectFromStorageKey(storageKey, { mimeType: 'image/jpeg' })).id)
  }

  await assertTaskActive(job, 'remake_keyframe_persist')
  await reportTaskProgress(job, 90, { stage: 'persist_remake_keyframe_candidates' })
  return await appendKeyframeGenerationBatch({ taskId: job.data.taskId, operationKey: payload.operationKey, inputSnapshot: snapshot, inputFingerprint: payload.inputFingerprint, mediaIds })
}
