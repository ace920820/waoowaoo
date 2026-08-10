import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRemakeKeyframeTaskDescriptor } from '@/lib/remake-projects/keyframes/task-contract'
import { getQueueTypeByTaskType } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const generation = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async (refs: string[]) => refs.map((ref) => `signed:${ref}`)),
  resolveImageSourceFromGeneration: vi.fn(async () => ['data:image/png;base64,AA==']),
  uploadImageSourceToCos: vi.fn(async (_source: unknown, _prefix: string, id: string) => `generated/${id}.png`),
  assertTaskActive: vi.fn(async () => undefined),
}))
const service = vi.hoisted(() => ({
  assertKeyframeSubmissionCurrent: vi.fn(async () => undefined),
  appendKeyframeGenerationBatch: vi.fn(async () => ({ batchId: 'batch-1', candidateIds: ['candidate-1'] })),
  resolveKeyframeReferenceStorageKeys: vi.fn(async () => ['refs/start.png']),
}))
const progress = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/media/outbound-image', () => ({ normalizeReferenceImagesForGeneration: generation.normalizeReferenceImagesForGeneration }))
vi.mock('@/lib/workers/utils', () => ({
  resolveImageSourceFromGeneration: generation.resolveImageSourceFromGeneration,
  uploadImageSourceToCos: generation.uploadImageSourceToCos,
  assertTaskActive: generation.assertTaskActive,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: progress }))
vi.mock('@/lib/remake-projects/keyframes/service', () => service)

const snapshot = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  stableKey: 'shot-1',
  sourceRevision: 1,
  shotRevision: 2,
  shotRevisionId: '44444444-4444-4444-8444-444444444444',
  slot: 'start' as const,
  promptVersionId: '55555555-5555-4555-8555-555555555555',
  promptText: 'Rainy city street at dusk.',
  model: { id: 'provider::image-v1', provider: 'provider' },
  options: { resolution: '1024x1024' },
  referenceMediaIds: ['66666666-6666-4666-8666-666666666666'],
  requestedCandidateCount: 1,
}

function job(payload: Record<string, unknown>): Job<TaskJobData> {
  return { data: { taskId: 'task-1', type: TASK_TYPE.REMAKE_KEYFRAME_IMAGE_GENERATE, locale: 'zh', projectId: snapshot.projectId, targetType: 'remake_shot', targetId: snapshot.shotId, payload, userId: 'user-1' } } as Job<TaskJobData>
}

describe('remake keyframe image task', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the existing image queue and freezes a strict server descriptor', () => {
    const descriptor = buildRemakeKeyframeTaskDescriptor({ projectId: snapshot.projectId, operationKey: 'generate-1', inputSnapshot: snapshot })
    expect(descriptor.taskType).toBe(TASK_TYPE.REMAKE_KEYFRAME_IMAGE_GENERATE)
    expect(getQueueTypeByTaskType(descriptor.taskType)).toBe('image')
    expect(descriptor.payload.inputFingerprint).toHaveLength(64)
  })

  it('generates, uploads, and appends one candidate without adopting it', async () => {
    const descriptor = buildRemakeKeyframeTaskDescriptor({ projectId: snapshot.projectId, operationKey: 'generate-1', inputSnapshot: snapshot })
    const { handleRemakeKeyframeImageTask } = await import('@/lib/workers/handlers/remake-keyframe-image')

    await expect(handleRemakeKeyframeImageTask(job(descriptor.payload))).resolves.toEqual({ batchId: 'batch-1', candidateIds: ['candidate-1'] })
    expect(service.assertKeyframeSubmissionCurrent).toHaveBeenCalledWith(snapshot)
    expect(generation.resolveImageSourceFromGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ modelId: snapshot.model.id, prompt: snapshot.promptText }))
    expect(service.appendKeyframeGenerationBatch).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', storageKeys: ['generated/task-1-1.png'] }))
    expect(service.appendKeyframeGenerationBatch).not.toHaveBeenCalledWith(expect.objectContaining({ adopted: true }))
  })

  it('does not append a complete batch when upload fails', async () => {
    generation.uploadImageSourceToCos.mockRejectedValueOnce(new Error('upload failed'))
    const descriptor = buildRemakeKeyframeTaskDescriptor({ projectId: snapshot.projectId, operationKey: 'generate-fail', inputSnapshot: snapshot })
    const { handleRemakeKeyframeImageTask } = await import('@/lib/workers/handlers/remake-keyframe-image')

    await expect(handleRemakeKeyframeImageTask(job(descriptor.payload))).rejects.toThrow('upload failed')
    expect(service.appendKeyframeGenerationBatch).not.toHaveBeenCalled()
  })
})
