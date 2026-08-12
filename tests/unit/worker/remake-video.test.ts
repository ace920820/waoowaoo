import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRemakeVideoTaskDescriptor } from '@/lib/remake-projects/video/task-contract'
import { getQueueTypeByTaskType } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  shotRevisionId: '44444444-4444-4444-8444-444444444444',
  promptVersionId: '55555555-5555-4555-8555-555555555555',
  mediaRef1: '66666666-6666-4666-8666-666666666666',
  mediaRef2: '76666666-6666-4666-8666-666666666666',
  taskId: '88888888-8888-4888-8888-888888888888',
  userId: '99999999-9999-4999-8999-999999999999',
}

const baseSnapshot = {
  projectId: IDS.projectId,
  remakeProjectId: IDS.remakeProjectId,
  shotId: IDS.shotId,
  stableKey: 'shot-004',
  sourceRevision: 1,
  shotRevision: 2,
  shotRevisionId: IDS.shotRevisionId,
  promptVersionId: IDS.promptVersionId,
  promptText: 'A character dashes through misty woods.',
  model: { id: 'video-model-v1', provider: 'ark' },
  options: { resolution: '720p', generateAudio: false },
  orderedReferences: [
    { role: 'middle_keyframe' as const, ordinal: 1, mediaId: IDS.mediaRef1 },
    { role: 'action_sheet' as const, ordinal: 2, mediaId: IDS.mediaRef2 },
  ],
  durationSeconds: 5,
}

const generation = vi.hoisted(() => ({
  resolveVideoSourceFromGeneration: vi.fn(async () => ({
    url: 'https://provider.example.com/video.mp4',
    actualVideoTokens: 1200,
  })),
  uploadVideoSourceToCos: vi.fn(async () => 'remake/generated/video-1.mp4'),
  assertTaskActive: vi.fn(async () => undefined),
}))
const service = vi.hoisted(() => ({
  assertVideoSubmissionCurrent: vi.fn(async () => undefined),
  appendVideoGenerationBatch: vi.fn(async () => ({
    batchId: 'batch-video-1',
    versionIds: ['version-1'],
  })),
  resolveVideoReferenceStorageKeys: vi.fn(async () => [
    { role: 'middle_keyframe', ordinal: 1, mediaId: IDS.mediaRef1, signedUrl: 'https://cdn/mid.png' },
    { role: 'action_sheet', ordinal: 2, mediaId: IDS.mediaRef2, signedUrl: 'https://cdn/action.gif' },
  ]),
}))
const media = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: `media-${storageKey}`,
    storageKey,
    mimeType: 'video/mp4',
  })),
}))
const progress = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (url: string) => `base64:${url}`),
}))
vi.mock('@/lib/workers/utils', () => ({
  resolveVideoSourceFromGeneration: generation.resolveVideoSourceFromGeneration,
  uploadVideoSourceToCos: generation.uploadVideoSourceToCos,
  assertTaskActive: generation.assertTaskActive,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: progress }))
vi.mock('@/lib/remake-projects/video/service', () => service)
vi.mock('@/lib/media/service', () => media)

function buildJob(overrides: Partial<TaskJobData> = {}): Job<TaskJobData> {
  const descriptor = buildRemakeVideoTaskDescriptor({
    projectId: IDS.projectId,
    operationKey: 'gen-001',
    inputSnapshot: baseSnapshot,
  })
  return {
    id: IDS.taskId,
    data: {
      taskId: IDS.taskId,
      userId: IDS.userId,
      type: TASK_TYPE.REMAKE_VIDEO_GENERATE,
      targetType: 'remake_shot',
      targetId: IDS.shotId,
      projectId: IDS.projectId,
      locale: 'zh',
      payload: descriptor.payload,
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as TaskJobData,
  } as Job<TaskJobData>
}

describe('remake video worker task type registration', () => {
  it('routes the REMAKE_VIDEO_GENERATE task type through the video queue', () => {
    expect(getQueueTypeByTaskType(TASK_TYPE.REMAKE_VIDEO_GENERATE)).toBe('video')
  })
})

describe('handleRemakeVideoTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs preflight check before provider work (D-06/D-17 currentness)', async () => {
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job = buildJob()

    await handleRemakeVideoTask(job)

    expect(service.assertVideoSubmissionCurrent).toHaveBeenCalled()
    expect(generation.assertTaskActive).toHaveBeenNthCalledWith(1, job, 'remake_video_preflight')
  })

  it('resolves ordered references and calls the video gateway with prompt and duration', async () => {
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job = buildJob()

    await handleRemakeVideoTask(job)

    expect(service.resolveVideoReferenceStorageKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        orderedReferences: expect.arrayContaining([
          expect.objectContaining({ role: 'middle_keyframe' }),
          expect.objectContaining({ role: 'action_sheet' }),
        ]),
      }),
    )
    expect(generation.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      job,
      expect.objectContaining({
        modelId: 'video-model-v1',
        userId: IDS.userId,
        options: expect.objectContaining({
          prompt: baseSnapshot.promptText,
          duration: 5,
        }),
      }),
    )
  })

  it('uploads the generated video and creates a managed media object', async () => {
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job = buildJob()

    await handleRemakeVideoTask(job)

    expect(generation.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example.com/video.mp4',
      expect.stringContaining('remake/'),
      IDS.taskId,
      undefined,
    )
    expect(media.ensureMediaObjectFromStorageKey).toHaveBeenCalledWith(
      'remake/generated/video-1.mp4',
      expect.objectContaining({ mimeType: 'video/mp4' }),
    )
  })

  it('persists one immutable version transactionally after preflight', async () => {
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job = buildJob()

    const result = await handleRemakeVideoTask(job)

    expect(generation.assertTaskActive).toHaveBeenLastCalledWith(job, 'remake_video_persist')
    expect(service.appendVideoGenerationBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: IDS.taskId,
        operationKey: 'gen-001',
        inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        mediaId: expect.stringContaining('media-remake/generated/video-1.mp4'),
      }),
    )
    expect(result).toMatchObject({ batchId: 'batch-video-1', versionIds: ['version-1'] })
  })

  it('fails preflight when inputs are stale and does not call the provider', async () => {
    service.assertVideoSubmissionCurrent.mockRejectedValueOnce(new Error('REMAKE_VIDEO_INPUT_STALE'))
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job = buildJob()

    await expect(handleRemakeVideoTask(job)).rejects.toThrow('REMAKE_VIDEO_INPUT_STALE')
    expect(generation.resolveVideoSourceFromGeneration).not.toHaveBeenCalled()
    expect(service.appendVideoGenerationBatch).not.toHaveBeenCalled()
  })

  it('deduplicates repeated calls with the same operation key and fingerprint', async () => {
    const { handleRemakeVideoTask } = await import('@/lib/workers/handlers/remake-video')
    const job1 = buildJob()
    const job2 = buildJob()

    service.appendVideoGenerationBatch
      .mockResolvedValueOnce({ batchId: 'batch-video-1', versionIds: ['version-1'] })
      .mockResolvedValueOnce({ batchId: 'batch-video-1', versionIds: ['version-1'] })

    const r1 = await handleRemakeVideoTask(job1)
    const r2 = await handleRemakeVideoTask(job2)

    expect(r1.batchId).toBe(r2.batchId)
    expect(generation.resolveVideoSourceFromGeneration).toHaveBeenCalledTimes(2)
  })
})
