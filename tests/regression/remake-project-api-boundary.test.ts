import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../helpers/request'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'remake-project-1' })),
  },
  remakeProject: {
    create: vi.fn(async () => ({ id: 'remake-meta-1' })),
  },
  task: {
    create: vi.fn(async () => ({ id: 'task-1' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-auth', () => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

describe('remake project API boundary', () => {
  it('creates a remake project only when the request explicitly selects remake type', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const response = await POST(buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: { name: 'Remake project', type: 'remake', creationRequestId: 'regression-request-1' },
    }), { params: Promise.resolve({}) })

    expect(response.status).toBe(201)
    expect(prismaMock.remakeProject.create).toHaveBeenCalledTimes(1)
  })
})
