import { beforeEach, describe, expect, it, vi } from 'vitest'

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  revisionId: '44444444-4444-4444-8444-444444444444',
  userId: '55555555-5555-4555-8555-555555555555',
  trackId: '66666666-6666-4666-8666-666666666666',
  versionA: '77777777-7777-4777-8777-777777777777',
  versionB: '88888888-8888-4888-8888-888888888888',
  outputA: '99999999-9999-4999-8999-999999999999',
  outputB: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  mediaA: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  mediaB: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
  batchId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  remakeVideoTrack: {
    findFirst: vi.fn(async () => ({
      id: IDS.trackId,
      shotRevisionId: IDS.revisionId,
      adoptedVersionId: null,
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: {
            projectId: IDS.projectId,
            project: { userId: IDS.userId },
          },
        },
      },
      adoptedVersion: null as unknown as { id: string },
      batches: [{
        id: IDS.batchId,
        operationKey: 'gen-001',
        versions: [
          {
            id: IDS.versionA,
            ordinal: 1,
            outputVersionId: IDS.outputA,
            note: null,
            outputVersion: {
              id: IDS.outputA,
              mediaId: IDS.mediaA,
              status: 'completed',
              invalidatedAt: null,
            },
          },
          {
            id: IDS.versionB,
            ordinal: 2,
            outputVersionId: IDS.outputB,
            note: null,
            outputVersion: {
              id: IDS.outputB,
              mediaId: IDS.mediaB,
              status: 'completed',
              invalidatedAt: null,
            },
          },
        ],
      }],
      adoptionEvents: [],
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: IDS.trackId,
      ...data,
    })),
  },
  remakeVideoVersion: {
    findFirst: vi.fn(async ({ where }: { where: { id?: string; batch?: { trackId?: string } } }) => ({
      id: where?.id || IDS.versionA,
      batchId: IDS.batchId,
      outputVersionId: where?.id === IDS.versionB ? IDS.outputB : IDS.outputA,
      outputVersion: {
        id: where?.id === IDS.versionB ? IDS.outputB : IDS.outputA,
        status: 'completed',
        invalidatedAt: null,
      },
    })),
    update: vi.fn(async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => ({ id: IDS.versionA, ...data })),
  },
  remakeVideoAdoptionEvent: {
    create: vi.fn(async () => ({ id: 'event-1' })),
  },
  remakeInvalidation: {
    updateMany: vi.fn(async () => ({ count: 0 })),
    findFirst: vi.fn(async () => null),
  },
  remakeOutputVersion: {
    update: vi.fn(async () => ({ id: IDS.outputA })),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: IDS.userId } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

describe('video track detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns track detail with batches, versions, and adoption events', async () => {
    const { getVideoTrackDetail } = await import('@/lib/remake-projects/video/service')

    const detail = await getVideoTrackDetail({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
    })

    expect(detail?.track.id).toBe(IDS.trackId)
    expect(detail?.history.length).toBe(1)
    expect(detail?.history[0]?.versions.length).toBe(2)
    expect(detail?.history[0]?.versions[0]?.mediaId).toBe(IDS.mediaA)
    expect(detail?.adoptionEvents).toEqual([])
  })
})

describe('video review note', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates a simple text note on a version', async () => {
    const { setVideoReviewNote } = await import('@/lib/remake-projects/video/service')

    const result = await setVideoReviewNote({
      projectId: IDS.projectId,
      userId: IDS.userId,
      versionId: IDS.versionA,
      note: 'Great composition, but lighting feels flat.',
    })

    expect(result.id).toBe(IDS.versionA)
    expect(result.note).toBeDefined()
    expect(prismaMock.remakeVideoVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: expect.stringContaining('composition') }) }),
    )
  })

  it('truncates notes longer than 2000 characters', async () => {
    const { setVideoReviewNote } = await import('@/lib/remake-projects/video/service')

    const longNote = 'a'.repeat(3000)
    await setVideoReviewNote({
      projectId: IDS.projectId,
      userId: IDS.userId,
      versionId: IDS.versionA,
      note: longNote,
    })

    const call = prismaMock.remakeVideoVersion.update.mock.calls[0][0] as { where: unknown; data: { note: string } }
    expect(call.data.note.length).toBe(2000)
  })
})

describe('video version adoption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adopts a version when no prior adoption exists', async () => {
    prismaMock.remakeVideoTrack.findFirst.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: null,
      adoptedVersion: null as unknown as { id: string },
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } },
        },
      },
    } as any)

    const { adoptVideoVersion } = await import('@/lib/remake-projects/video/service')
    const result = await adoptVideoVersion({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
      versionId: IDS.versionA,
    })

    expect(result.adoptedVersionId).toBe(IDS.versionA)
    expect(prismaMock.remakeVideoAdoptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackId: IDS.trackId,
          previousVersionId: null,
          nextVersionId: IDS.versionA,
          reviewerId: IDS.userId,
        }),
      }),
    )
  })

  it('requires explicit confirmation to replace an existing adopted version (D-15)', async () => {
    prismaMock.remakeVideoTrack.findFirst.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: IDS.versionA,
      adoptedVersion: { id: IDS.versionA },
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } },
        },
      },
    } as any)

    const { adoptVideoVersion } = await import('@/lib/remake-projects/video/service')

    await expect(adoptVideoVersion({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
      versionId: IDS.versionB,
    })).rejects.toThrow('REMAKE_VIDEO_REPLACE_CONFIRM_REQUIRED')

    expect(prismaMock.remakeVideoTrack.update).not.toHaveBeenCalled()
  })

  it('allows replacement when confirmReplace is true', async () => {
    prismaMock.remakeVideoTrack.findFirst.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: IDS.versionA,
      adoptedVersion: { id: IDS.versionA },
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } },
        },
      },
    } as any)

    const { adoptVideoVersion } = await import('@/lib/remake-projects/video/service')
    const result = await adoptVideoVersion({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
      versionId: IDS.versionB,
      confirmReplace: true,
    })

    expect(result.adoptedVersionId).toBe(IDS.versionB)
    expect(prismaMock.remakeVideoAdoptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousVersionId: IDS.versionA, nextVersionId: IDS.versionB }) }),
    )
  })
})

describe('video version reconfirmation (D-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconfirms only the currently adopted invalidated version', async () => {
    prismaMock.remakeVideoTrack.findFirst.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: IDS.versionA,
      adoptedVersion: { id: IDS.versionA },
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } },
        },
      },
    } as any)
    prismaMock.remakeVideoVersion.findFirst.mockResolvedValueOnce({
      id: IDS.versionA,
      batchId: IDS.batchId,
      outputVersionId: IDS.outputA,
      outputVersion: { id: IDS.outputA, status: 'needs_review', invalidatedAt: new Date() },
    } as any)

    const { reconfirmVideoVersion } = await import('@/lib/remake-projects/video/service')
    const result = await reconfirmVideoVersion({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
      versionId: IDS.versionA,
    })

    expect(result.reconfirmed).toBe(true)
    expect(result.adoptedVersionId).toBe(IDS.versionA)
    expect(prismaMock.remakeInvalidation.updateMany).toHaveBeenCalled()
    expect(prismaMock.remakeOutputVersion.update).toHaveBeenCalled()
    expect(prismaMock.remakeVideoAdoptionEvent.create).toHaveBeenCalled()
  })

  it('rejects reconfirmation for non-adopted versions', async () => {
    prismaMock.remakeVideoTrack.findFirst.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: IDS.versionA,
      adoptedVersion: { id: IDS.versionA },
      shotRevision: {
        id: IDS.revisionId,
        revision: 1,
        lifecycleState: 'active',
        shot: {
          id: IDS.shotId,
          currentRevision: 1,
          remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } },
        },
      },
    } as any)

    const { reconfirmVideoVersion } = await import('@/lib/remake-projects/video/service')

    await expect(reconfirmVideoVersion({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: IDS.trackId,
      versionId: IDS.versionB,
    })).rejects.toThrow('REMAKE_VIDEO_RECONFIRM_NOT_ADOPTED')
  })
})
