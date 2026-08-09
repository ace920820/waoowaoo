import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(async () => ({
    id: 'project-1', userId: 'user-1', type: 'remake',
    remakeProject: { currentSource: { sourceRevision: 1, storageKey: 'sources/input.mp4', fileName: 'input.mp4' } },
  })),
  execute: vi.fn(async () => ({
    analysisId: 'analysis-1', metadata: { fps: 30, totalFrames: 30 },
    shots: [{ id: 'scene-1', shotNumber: 1, startFrame: 0, endFrame: 29, rawStartFrame: 0, rawEndFrame: 29, startTimecode: '', endTimecode: '', duration: 1, durationFrames: 30, firstFrameUrl: '/media/analysis-1/first.jpg', middleFrameUrl: '/media/analysis-1/middle.jpg', lastFrameUrl: '/media/analysis-1/last.jpg' }],
  })),
  commit: vi.fn(async () => ({ committed: true, shotCount: 1 })),
  download: vi.fn(async () => { throw new Error('storage unavailable') }),
  ensure: vi.fn(async () => ({ id: 'media-1' })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { project: { findUnique: mocks.findUnique } } }))
vi.mock('@/lib/storage', () => ({
  getObjectBuffer: vi.fn(async () => Buffer.from('video')),
  downloadAndUploadImage: mocks.download,
  generateUniqueKey: vi.fn(() => 'frames/key.jpg'),
}))
vi.mock('@/lib/media/service', () => ({ ensureMediaObjectFromStorageKey: mocks.ensure }))
vi.mock('@/lib/remake-projects/scenedetect/adapter', () => ({ commitSceneDetectImport: mocks.commit }))
vi.mock('@/lib/remake-projects/scenedetect/executor-client', () => ({
  createSceneDetectExecutorClient: () => ({ execute: mocks.execute }),
  sceneDetectExecutorMediaUrl: (path: string) => `http://executor.test${path}`,
}))
vi.mock('@/lib/remake-projects/scenedetect/task-contract', () => ({
  parseSceneDetectTaskPayload: vi.fn(() => ({ operation: 'analyze', sourceRevision: 1, operationKey: 'analyze-1', threshold: 27 })),
}))
vi.mock('@/lib/remake-projects/scenedetect/keyframes', () => ({ persistSceneDetectKeyframeResult: vi.fn() }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn() }))

describe('SceneDetect analysis keyframe persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.download.mockRejectedValue(new Error('storage unavailable'))
    mocks.ensure.mockResolvedValue({ id: 'media-1' })
  })

  it('fails instead of committing an analysis with empty keyframe media IDs', async () => {
    const { handleSceneDetectTask } = await import('@/lib/workers/handlers/scenedetect')
    await expect(handleSceneDetectTask({
      id: 'task-1',
      data: { projectId: 'project-1', userId: 'user-1', payload: {} },
    } as never)).rejects.toThrow('SCENEDETECT_KEYFRAME_STORAGE_FAILED')
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('keeps executor-assigned fallback shot IDs unique across transfer batches', async () => {
    mocks.download.mockResolvedValue('frames/key.jpg')
    mocks.execute.mockResolvedValueOnce({
      analysisId: 'analysis-1', metadata: { fps: 30, totalFrames: 150 },
      shots: Array.from({ length: 5 }, (_, index) => ({ shotNumber: index + 1, startFrame: index * 30, endFrame: index * 30 + 29, rawStartFrame: index * 30, rawEndFrame: index * 30 + 29, startTimecode: '', endTimecode: '', duration: 1, durationFrames: 30, firstFrameUrl: `/media/analysis-1/${index}-first.jpg`, middleFrameUrl: `/media/analysis-1/${index}-middle.jpg`, lastFrameUrl: `/media/analysis-1/${index}-last.jpg` })),
    })
    const { handleSceneDetectTask } = await import('@/lib/workers/handlers/scenedetect')
    await handleSceneDetectTask({ id: 'task-2', data: { projectId: 'project-1', userId: 'user-1', payload: {} } } as never)
    const input = mocks.commit.mock.calls[0]?.[0] as { payload: { payload: { shots: Array<{ id: string }> } } }
    expect(input.payload.payload.shots.map((shot) => shot.id)).toEqual(['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5'])
  })
})
