/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const shot = {
    id: 'shot-1', stableKey: 'stable-1', sequence: 1, currentRevision: 1, version: 1,
    revisions: [{ id: 'rev-1', revision: 1, lifecycleState: 'active', payload: null }], outputs: [{ id: 'output-1' }],
  }
  const project = { id: 'p1', userId: 'u1', type: 'remake', name: 'Demo', remakeProject: { id: 'rp1', currentSource: { sourceRevision: 1 }, shots: [shot] } }
  const prisma: any = {
    project: { findUnique: vi.fn(async () => ({ userId: 'u1', type: 'remake' })) },
    remakeProject: { findUnique: vi.fn(async () => structuredClone(project.remakeProject)) },
    remakeShot: { create: vi.fn(async ({ data }: any) => ({ id: 'shot-new', ...data, currentRevision: null, version: 0, revisions: [], outputs: [] })), update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })) },
    remakeShotRevision: { create: vi.fn(async ({ data }: any) => ({ id: `rev-${data.revision}`, ...data })), update: vi.fn(async () => ({})) },
    remakePromptTrack: { findMany: vi.fn(async () => [{ adoptedVersionId: 'prompt-version-1' }]) },
    remakeInvalidation: { createMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(async (callback: any) => callback(prisma)),
  }
  return { prisma, project }
})

vi.mock('@/lib/prisma', () => ({ prisma: state.prisma }))

const native = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2, type: 'scenedetect-project',
  project: { id: 'p1', name: 'Demo', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  source: { fileName: 'input.mp4', size: 10, duration: 2, fps: 30, width: 10, height: 10, totalFrames: 60 },
  analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: 27, analyzedAt: '2026-01-01', status: 'analyzed_review' },
  view: { currentFrame: 0, activeShotId: 'shot-1' },
  shots: [{ id: 'shot-1', shotNumber: 1, rawStartFrame: 0, rawEndFrame: 59, startFrame: 0, endFrame: 59, startTimecode: '', endTimecode: '', duration: 2, durationFrames: 60, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', status: 'pending', modifiedSource: 'AI', tags: [], notes: '' }],
  ...overrides,
})

describe('native SceneDetect mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(state.project.remakeProject.shots[0].revisions[0] as any).payload = JSON.stringify(native().shots[0])
  })

  it('does not append a revision for a no-op', async () => {
    const { commitNativeProjectMutation, projectConcurrencyToken } = await import('@/lib/remake-projects/scenedetect/mutations')
    const token = projectConcurrencyToken({ sourceRevision: 1, shots: [{ id: 'shot-1', currentRevision: 1, version: 1 }] })
    const result = await commitNativeProjectMutation({ projectId: 'p1', userId: 'u1', project: native(), ifMatch: token })
    expect(result.changed).toBe(false)
    expect(state.prisma.remakeShotRevision.create).not.toHaveBeenCalled()
  })

  it('appends a revision and invalidates outputs for an approved/editable shot', async () => {
    const { commitNativeProjectMutation, projectConcurrencyToken } = await import('@/lib/remake-projects/scenedetect/mutations')
    const token = projectConcurrencyToken({ sourceRevision: 1, shots: [{ id: 'shot-1', currentRevision: 1, version: 1 }] })
    const result = await commitNativeProjectMutation({ projectId: 'p1', userId: 'u1', project: native({ shots: [{ ...native().shots[0], endFrame: 50, durationFrames: 51, rawEndFrame: 50 }] }), ifMatch: token, operationKey: 'adjust' })
    expect(result.changed).toBe(true)
    expect(state.prisma.remakeShotRevision.create).toHaveBeenCalledTimes(1)
    expect(state.prisma.remakeInvalidation.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ outputVersionId: 'output-1' })] }))
    expect(state.prisma.remakeInvalidation.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ promptVersionId: 'prompt-version-1' })] }))
  })

  it('rejects stale tokens atomically', async () => {
    const { commitNativeProjectMutation } = await import('@/lib/remake-projects/scenedetect/mutations')
    await expect(commitNativeProjectMutation({ projectId: 'p1', userId: 'u1', project: native(), ifMatch: 'stale' })).rejects.toMatchObject({ code: 'SCENEDETECT_CONFLICT' })
    expect(state.prisma.remakeShotRevision.create).not.toHaveBeenCalled()
  })
})
