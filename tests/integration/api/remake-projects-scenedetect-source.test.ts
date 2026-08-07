import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  remakeProject: {
    findUnique: vi.fn(async () => ({ id: 'remake-1', currentSourceId: null })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'remake-1', ...data })),
  },
  remakeSource: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'source-1', ...data })),
  },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
}))

const storageMock = vi.hoisted(() => ({
  uploadObject: vi.fn(async () => 'remake/project-1/source.mp4'),
  deleteObject: vi.fn(async () => undefined),
  generateUniqueKey: vi.fn(() => 'remake/project-1/source.mp4'),
}))

const probeMock = vi.hoisted(() => ({ probeVideo: vi.fn(async () => ({ duration: 2, fps: 30, width: 1920, height: 1080, totalFrames: 60 })) }))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/remake-projects/scenedetect/video-probe', () => probeMock)
vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

function sourceRequest(file: File, operationKey = 'upload-1') {
  const form = new FormData()
  form.set('file', file)
  form.set('operationKey', operationKey)
  return new NextRequest('http://localhost/api/remake-projects/project-1/source', { method: 'POST', body: form })
}

describe('POST /api/remake-projects/[projectId]/source', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists a server-probed source revision and replays the same operation without another upload', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/source/route')
    const file = new File([new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])], 'source.mp4', { type: 'video/mp4' })
    const first = await POST(sourceRequest(file), { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(first.status).toBe(201)
    await expect(first.json()).resolves.toMatchObject({ sourceRevision: 1, metadata: { duration: 2, totalFrames: 60 } })
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(1)
    prismaMock.remakeSource.findFirst.mockResolvedValueOnce({ id: 'source-1', sourceRevision: 1, operationKey: 'upload-1', probeMetadata: JSON.stringify({ duration: 2, totalFrames: 60 }) } as never)
    const replay = await POST(sourceRequest(file), { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(replay.status).toBe(200)
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid video input without uploading or changing a source revision', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/source/route')
    const invalid = new File([new Uint8Array([1, 2, 3])], 'source.mp4', { type: 'video/mp4' })
    const response = await POST(sourceRequest(invalid, 'upload-invalid'), { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(response.status).toBe(400)
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    expect(prismaMock.remakeSource.create).not.toHaveBeenCalled()
  })
})
