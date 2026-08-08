import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn(async () => ({ userId: 'user-1', type: 'remake' })) },
  remakeProject: {
    findUnique: vi.fn(async () => ({ id: 'remake-meta-1' })),
    update: vi.fn(async () => ({ id: 'remake-meta-1' })),
  },
  remakeSource: { upsert: vi.fn(async () => ({ id: 'source-1' })) },
  remakeShot: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'shot-1', ...create })) },
  remakeShotRevision: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'revision-1', ...data })) },
  remakeProvenanceRecord: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'provenance-1', ...data })),
  },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-auth', () => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const payload = {
  schemaVersion: 2,
  type: 'scenedetect-project',
  project: { id: 'analysis-1', name: 'Input', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  source: { fileName: 'input.mp4', size: 100, duration: 2, fps: 30, width: 1920, height: 1080, totalFrames: 60 },
  analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: 27, analyzedAt: '2026-01-01', status: 'analyzed_review' },
  view: { currentFrame: 0, activeShotId: null },
  shots: [{ id: 'external-shot-1', shotNumber: 1, rawStartFrame: 0, rawEndFrame: 29, startFrame: 0, endFrame: 29, startTimecode: '', endTimecode: '', duration: 1, durationFrames: 30, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', status: 'pending', modifiedSource: 'AI', tags: [], notes: '' }],
}

describe('SceneDetect import boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preview validates and maps without writing database state', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/scenedetect/import/route')
    const request = buildMockRequest({
      path: '/api/remake-projects/project-1/scenedetect/import', method: 'POST', body: { mode: 'preview', analysisId: 'analysis-1', payload },
    })
    const response = await POST(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(response.status).toBe(200)
    expect(prismaMock.remakeSource.upsert).not.toHaveBeenCalled()
  })

  it('commit is idempotent by operation key and does not depend on runtime URLs', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/scenedetect/import/route')
    const request = buildMockRequest({
      path: '/api/remake-projects/project-1/scenedetect/import', method: 'POST', body: { mode: 'commit', analysisId: 'analysis-1', operationKey: 'op-1', payload },
    })
    const first = await POST(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(first.status).toBe(201)
    expect(prismaMock.remakeShotRevision.create).toHaveBeenCalledTimes(1)
    prismaMock.remakeProvenanceRecord.findFirst.mockResolvedValueOnce({ id: 'provenance-1' } as never)
    const second = await POST(buildMockRequest({
      path: '/api/remake-projects/project-1/scenedetect/import', method: 'POST', body: { mode: 'commit', analysisId: 'analysis-1', operationKey: 'op-1', payload },
    }), { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(second.status).toBe(200)
    expect(prismaMock.remakeShotRevision.create).toHaveBeenCalledTimes(1)
  })

  it('rejects private DNS results, URL credentials, and oversized media before ingestion', async () => {
    const { validateExternalMediaUrl, normalizeMediaInput } = await import('@/lib/remake-projects/scenedetect/media')
    await expect(validateExternalMediaUrl('https://media.example/frame.jpg', { allowlistedHosts: new Set(['media.example']), resolveHost: async () => ['192.168.1.10'] })).rejects.toThrow(/private/i)
    await expect(validateExternalMediaUrl('https://user:pass@media.example/frame.jpg', { allowlistedHosts: new Set(['media.example']) })).rejects.toThrow(/credential/i)
    expect(() => normalizeMediaInput({ kind: 'executor_bytes', bytes: new Uint8Array(11), contentType: 'image/jpeg', fileName: 'frame.jpg' }, 10)).toThrow(/byte/i)
  })

  it('rejects client/runtime media URLs before any database write', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/scenedetect/import/route')
    const response = await POST(buildMockRequest({
      path: '/api/remake-projects/project-1/scenedetect/import', method: 'POST',
      body: { mode: 'commit', analysisId: 'analysis-1', operationKey: 'op-runtime', payload: { ...payload, source: { ...payload.source, videoUrl: 'blob:runtime-source' } } },
    }), { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(response.status).toBe(400)
    expect(prismaMock.remakeSource.upsert).not.toHaveBeenCalled()
  })
})
