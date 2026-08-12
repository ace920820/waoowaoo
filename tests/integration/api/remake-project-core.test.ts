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

  it('derives an image Prompt slot from its immutable creation event without exposing task payload', async () => {
    prismaMock.task.findMany.mockResolvedValueOnce([{
      id: 'task-middle', type: 'remake_image_prompt_analyze', targetType: 'remake_shot', targetId: 'shot-1', status: 'failed',
      errorCode: 'CODEX_PROCESS_FAILED', errorMessage: 'failed', createdAt: new Date(), updatedAt: new Date(),
      events: [{ payload: { slot: 'middle', inputSnapshot: { storageKey: 'private/key' }, secret: 'must-not-leak' } }],
    }] as unknown as never[])
    const { getRemakeProjectSnapshot } = await import('@/lib/remake-projects/service')

    const snapshot = await getRemakeProjectSnapshot({ projectId: 'remake-project-1', userId: 'user-1' })
    const task = snapshot?.tasks[0] as Record<string, unknown>
    expect(task).toMatchObject({ id: 'task-middle', promptSlot: 'middle' })
    expect(task).not.toHaveProperty('events')
    expect(task).not.toHaveProperty('payload')
    expect(JSON.stringify(task)).not.toContain('private/key')
    expect(JSON.stringify(task)).not.toContain('must-not-leak')
  })

  it('projects keyframe candidate media IDs and opaque media URLs', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: 'remake-project-1', name: 'Remake project', description: null, userId: 'user-1', type: 'remake',
      remakeProject: {
        importStatus: 'analyzed', currentSource: { sourceRevision: 1 },
        shots: [{
          id: 'shot-1', stableKey: 'shot-04', sequence: 4, reviewStatus: 'approved', needsReview: false, currentRevision: 1,
          outputs: [], provenance: [], promptTracks: [],
          revisions: [{
            id: 'revision-1', revision: 1, lifecycleState: 'active', sourceRevision: 1,
            payload: JSON.stringify({ status: 'keep' }), keyframeMediaRefs: JSON.stringify({ first: 'first', middle: 'middle', last: 'last' }),
            keyframeTracks: [{
              id: 'track-middle', slot: 'middle', selectedForGeneration: true, adoptedCandidateId: null, invalidations: [], adoptionEvents: [],
              batches: [{
                id: 'batch-middle', operationKey: 'generate-middle', inputFingerprint: 'fingerprint', createdAt: new Date('2026-08-12T00:00:00Z'),
                candidates: [{ id: 'candidate-middle', ordinal: 1, outputVersionId: 'output-middle', outputVersion: { mediaId: 'media-middle', status: 'completed', invalidatedAt: null } }],
              }],
            }],
          }],
        }],
      },
    } as never)
    const { getRemakeProjectSnapshot } = await import('@/lib/remake-projects/service')

    const snapshot = await getRemakeProjectSnapshot({ projectId: 'remake-project-1', userId: 'user-1' })

    expect(snapshot?.shots[0]?.keyframeGeneration?.tracks[0]?.batches[0]?.candidates[0]).toMatchObject({
      mediaId: 'media-middle',
      mediaUrl: '/api/remake-projects/remake-project-1/scenedetect/media/media-middle',
      status: 'completed',
    })
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
