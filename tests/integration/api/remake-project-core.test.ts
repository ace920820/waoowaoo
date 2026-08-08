import { describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'remake-project-1',
      ...data,
    })),
    findUnique: vi.fn(async () => ({
      id: 'remake-project-1',
      name: 'Remake project',
      description: null,
      userId: 'user-1',
      type: 'remake',
      remakeProject: {
        id: 'remake-meta-1',
        importStatus: 'not_imported',
        currentSource: null,
      },
    })),
  },
  remakeProject: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'remake-meta-1', ...data })),
  },
  remakeShot: {
    findUnique: vi.fn(async () => ({
      id: 'shot-1',
      reviewStatus: 'pending',
      revisions: [],
      outputs: [],
      remakeProject: { project: { userId: 'user-1' } },
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'shot-1', ...data })),
  },
  remakeShotRevision: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'revision-2', ...data })),
  },
  remakeInvalidation: {
    createMany: vi.fn(async () => ({ count: 0 })),
  },
  task: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'task-1', ...data })),
    findMany: vi.fn(async () => []),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/api-auth', () => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

describe('remake project core', () => {
  it('routes explicit remake creation without creating novel promotion data', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const { buildMockRequest } = await import('../../helpers/request')

    const response = await POST(buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: { name: 'Remake project', type: 'remake', creationRequestId: 'request-api-1' },
    }), { params: Promise.resolve({}) })

    expect(response.status).toBe(201)
    expect(prismaMock.remakeProject.create).toHaveBeenCalled()
  })

  it('creates one explicit remake project with an empty shot collection and initialization task', async () => {
    const { createRemakeProject } = await import('@/lib/remake-projects/service')

    const result = await createRemakeProject({
      userId: 'user-1',
      name: 'Remake project',
      description: null,
      creationRequestId: 'request-1',
    })

    expect(result.created).toBe(true)
    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'remake', userId: 'user-1' }),
    })
    expect(prismaMock.remakeProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'remake-project-1', importStatus: 'not_imported' }),
    })
    expect(prismaMock.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'remake-project-1', type: 'remake_project_initialize' }),
    })
  })

  it('restores only allowlisted remake snapshot fields without inventing shots', async () => {
    const { getRemakeProjectSnapshot } = await import('@/lib/remake-projects/service')

    await expect(getRemakeProjectSnapshot({ projectId: 'remake-project-1', userId: 'user-1' })).resolves.toEqual({
      project: expect.objectContaining({ id: 'remake-project-1', type: 'remake' }),
      source: { status: 'not_imported', mediaId: null, mediaUrl: null },
      shots: [],
      tasks: [],
    })
    expect(prismaMock.project.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        remakeProject: expect.objectContaining({
          include: expect.objectContaining({ currentSource: true }),
        }),
      }),
    }))
  })

  it('records a new revision and marks affected outputs for review without auto-approval', async () => {
    const { createRemakeShotRevision } = await import('@/lib/remake-projects/service')

    await expect(createRemakeShotRevision({
      shotId: 'shot-1',
      changeReason: 'boundary_adjusted',
      userId: 'user-1',
    })).resolves.toMatchObject({ reviewStatus: 'needs_review' })
    expect(prismaMock.remakeShotRevision.create).toHaveBeenCalled()
  })
})
