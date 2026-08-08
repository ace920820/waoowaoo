import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const authMock = vi.hoisted(() => ({ requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } }, project: { id: 'p1', userId: 'user-1', type: 'remake' } })), isErrorResponse: vi.fn((value: unknown) => value instanceof Response) }))
const prismaMock = vi.hoisted(() => ({ project: { findUnique: vi.fn(async () => ({ type: 'remake', remakeProject: { currentSource: { sourceRevision: 3, status: 'uploaded_pending' } } })) }, remakeProject: { findUnique: vi.fn() } }))
const executorMock = vi.hoisted(() => ({ submitAnalyze: vi.fn(async () => ({ task: { id: 'task-1' } })) }))
const serviceMock = vi.hoisted(() => ({ getRemakeProjectSnapshot: vi.fn(async () => ({ project: { id: 'p1', name: 'Demo' }, source: { status: 'not_imported', mediaId: null, sourceRevision: null, metadata: null }, shots: [], tasks: [] })) }))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/remake-projects/scenedetect/executor', () => ({ createSceneDetectExecutor: vi.fn(() => executorMock) }))
vi.mock('@/lib/remake-projects/service', () => serviceMock)

describe('SceneDetect runtime APIs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds analyze submission to the current source revision and operation key', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/scenedetect/analyze/route')
    const request = new NextRequest('http://localhost/api/remake-projects/p1/scenedetect/analyze', { method: 'POST', body: JSON.stringify({ operationKey: 'double-click', threshold: 27 }), headers: { 'content-type': 'application/json' } })
    const response = await POST(request, { params: Promise.resolve({ projectId: 'p1' }) })
    expect(response.status).toBe(202)
    expect(executorMock.submitAnalyze).toHaveBeenCalledWith(expect.objectContaining({ sourceRevision: 3, operationKey: 'double-click', threshold: 27 }))
  })

  it('returns an explicit empty native project without local/blob URLs', async () => {
    const { GET } = await import('@/app/api/remake-projects/[projectId]/scenedetect/project/route')
    const response = await GET(new NextRequest('http://localhost/api/remake-projects/p1/scenedetect/project'), { params: Promise.resolve({ projectId: 'p1' }) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.empty).toBe(true)
    expect(body.project.source.videoUrl).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('storageKey')
  })
})
