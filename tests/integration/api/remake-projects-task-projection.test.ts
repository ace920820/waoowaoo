import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn(async () => ({ userId: 'user-1', type: 'remake' })) },
}))
const queryTasksMock = vi.hoisted(() => vi.fn(async () => [{
  id: 'task-1', userId: 'user-1', type: 'scenedetect_analyze', status: 'completed', attempt: 1,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', errorCode: null, errorMessage: null,
  payload: { capability: 'scenedetect.analyze', runId: 'run-1', workflowVersion: 'v1', provenance: { schema: 'scenedetect.v2', executor: 'scenedetect' }, secret: 'hidden' },
}]))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/service', () => ({ queryTasks: queryTasksMock }))
vi.mock('@/lib/api-auth', () => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

describe('remake task projection API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns safe task status and provenance projection without raw payload', async () => {
    const { GET } = await import('@/app/api/remake-projects/[projectId]/tasks/route')
    const { buildMockRequest } = await import('../../helpers/request')
    const response = await GET(buildMockRequest({ path: '/api/remake-projects/p1/tasks', method: 'GET' }), { params: Promise.resolve({ projectId: 'p1' }) })
    const body = await response.json() as { tasks: Array<Record<string, unknown>> }
    expect(response.status).toBe(200)
    expect(body.tasks[0]).toMatchObject({ taskId: 'task-1', displayStatus: 'completed', capability: 'scenedetect.analyze', reviewStatus: 'independent' })
    expect(body.tasks[0]).not.toHaveProperty('payload')
    expect(body.tasks[0]?.provenance).toEqual({ schema: 'scenedetect.v2', executor: 'scenedetect' })
  })

  it('does not enumerate another user or non-remake project tasks', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'other-user', type: 'remake' })
    const { GET } = await import('@/app/api/remake-projects/[projectId]/tasks/route')
    const { buildMockRequest } = await import('../../helpers/request')
    const response = await GET(buildMockRequest({ path: '/api/remake-projects/p1/tasks', method: 'GET' }), { params: Promise.resolve({ projectId: 'p1' }) })
    expect(response.status).toBe(404)
    expect(queryTasksMock).not.toHaveBeenCalled()
  })
})
