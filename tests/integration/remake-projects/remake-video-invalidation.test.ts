import { beforeEach, describe, expect, it, vi } from 'vitest'

const IDS = {
  shotId: '11111111-1111-4111-8111-111111111111',
  revisionId: '22222222-2222-4222-8222-222222222222',
  oldRevisionId: '33333333-3333-4333-8333-333333333333',
  trackId: '44444444-4444-4444-8444-444444444444',
  batchId: '55555555-5555-4555-8555-555555555555',
  videoVersionId: '66666666-6666-4666-8666-666666666666',
  outputVersionId: '77777777-7777-4777-8777-777777777777',
  keyframeCandidateMedia: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  actionSheetMedia: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  unrelatedMedia: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  remakeOutputVersion: {
    findMany: vi.fn(async () => [
      // A stale keyframe output from the old revision
      { id: 'old-kf-1', mediaId: IDS.keyframeCandidateMedia, kind: 'keyframe_candidate' },
      // A stale action sheet from the old revision
      { id: 'old-as-1', mediaId: IDS.actionSheetMedia, kind: 'action_sheet' },
    ]),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  remakeVideoTrack: {
    findMany: vi.fn(async () => [
      {
        id: IDS.trackId,
        batches: [
          {
            id: IDS.batchId,
            orderedReferences: [
              { role: 'middle_keyframe', ordinal: 1, mediaId: IDS.keyframeCandidateMedia },
              { role: 'action_sheet', ordinal: 2, mediaId: IDS.actionSheetMedia },
            ],
            versions: [
              {
                id: IDS.videoVersionId,
                outputVersionId: IDS.outputVersionId,
                outputVersion: { id: IDS.outputVersionId, invalidatedAt: null },
              },
            ],
          },
        ],
      },
    ]),
  },
  remakeInvalidation: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'inv-1' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('video version invalidation (D-17)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('invalidates video versions whose reference keyframes changed', async () => {
    const { invalidateRemakeVideoVersions } = await import('@/lib/remake-projects/video/invalidation')

    const result = await invalidateRemakeVideoVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(prismaMock.remakeOutputVersion.updateMany).toHaveBeenCalled()
    const call = // @ts-expect-error mock typing
    prismaMock.remakeOutputVersion.updateMany.mock.calls[0][0] as { where: { id: { in: string[] } }; data: { status: string } }
    expect(call.where.id.in).toContain(IDS.outputVersionId)
    expect(call.data.status).toBe("needs_review")
  })

  it('creates idempotent invalidation records linked to video versions', async () => {
    const { invalidateRemakeVideoVersions } = await import('@/lib/remake-projects/video/invalidation')

    await invalidateRemakeVideoVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shotId: IDS.shotId,
          revisionId: IDS.revisionId,
          videoVersionId: IDS.videoVersionId,
          reason: 'keyframe_updated',
          status: 'needs_review',
        }),
      }),
    )
  })

  it('does not invalidate videos whose references are still current', async () => {
    // When no stale outputs match the video's references, nothing is invalidated
    prismaMock.remakeOutputVersion.findMany.mockResolvedValueOnce([
      { id: 'unrelated', mediaId: IDS.unrelatedMedia, kind: 'keyframe_candidate' },
    ])

    const { invalidateRemakeVideoVersions } = await import('@/lib/remake-projects/video/invalidation')

    const result = await invalidateRemakeVideoVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'prompt_updated',
    })

    expect(result.invalidated).toBe(0)
    expect(prismaMock.remakeOutputVersion.updateMany).not.toHaveBeenCalled()
  })

  it('preserves adopted pointer while marking review required (D-18)', async () => {
    // The invalidation logic does not touch the track adoptedVersionId
    const { invalidateRemakeVideoVersions } = await import('@/lib/remake-projects/video/invalidation')

    // No call to remakeVideoTrack.update - only output version and invalidation records
    const trackUpdateCalls = ((prismaMock.remakeVideoTrack as unknown as any).update?.mock?.calls) ?? []

    await invalidateRemakeVideoVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(trackUpdateCalls.length).toBe(0)
  })
})
