import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit-version invalidation propagation tests (D-22).
 *
 * Test 3 exercises `invalidateRemakeVideoUnitVersions` (unit/invalidation.ts)
 * with a mocked prisma; Test 4 proves the keyframe invalidation hook in
 * keyframes/invalidation.ts fires the unit path so a member keyframe change
 * reviews the owning unit's versions. Runs with BILLING_TEST_BOOTSTRAP=0.
 */

const IDS = {
  shotId: '11111111-1111-4111-8111-111111111111',
  revisionId: '22222222-2222-4222-8222-222222222222',
  unitId: '33333333-3333-4333-8333-333333333333',
  member1ShotRevisionId: '44444444-4444-4444-8444-444444444444',
  member2ShotRevisionId: '55555555-5555-4555-8555-555555555555',
  member1PromptVersionId: '66666666-6666-4666-8666-666666666666',
  member2PromptVersionId: '77777777-7777-4777-8777-777777777777',
  keyframeCandidateMedia: '88888888-8888-4888-8888-888888888888',
  actionSheetMedia: '99999999-9999-4999-8999-999999999999',
  unitBatchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  unitVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  outputVersionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
}

const unitSnapshot = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: IDS.unitId,
  members: [
    {
      shotRevisionId: IDS.member1ShotRevisionId,
      ordinal: 1,
      selectedKeyframe: { slot: 'middle', mediaId: IDS.keyframeCandidateMedia },
      promptVersionId: IDS.member1PromptVersionId,
      timeRangeSeconds: { start: 0, end: 1 },
    },
    {
      shotRevisionId: IDS.member2ShotRevisionId,
      ordinal: 2,
      selectedKeyframe: { slot: 'middle', mediaId: IDS.actionSheetMedia },
      promptVersionId: IDS.member2PromptVersionId,
      timeRangeSeconds: { start: 1, end: 4 },
    },
  ],
  orderedReferences: [
    { role: 'shot_keyframe', ordinal: 1, mediaId: IDS.keyframeCandidateMedia },
    { role: 'shot_keyframe', ordinal: 2, mediaId: IDS.actionSheetMedia },
  ],
  model: { id: 'video-model-v1' },
  options: {},
  durationSeconds: 6,
  promptText: '多镜头剪接视频。',
}

function unitBatchRow(overrides: { orderedReferences?: unknown; inputSnapshot?: unknown } = {}) {
  return {
    id: IDS.unitBatchId,
    orderedReferences: overrides.orderedReferences ?? [
      { role: 'shot_keyframe', ordinal: 1, mediaId: IDS.keyframeCandidateMedia },
    ],
    inputSnapshot: overrides.inputSnapshot ?? unitSnapshot,
    versions: [
      {
        id: IDS.unitVersionId,
        outputVersionId: IDS.outputVersionId,
        outputVersion: { id: IDS.outputVersionId, status: 'completed', invalidatedAt: null },
      },
    ],
  }
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  remakeOutputVersion: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  remakePromptVersion: {
    findMany: vi.fn(),
  },
  remakeShotRevision: {
    findMany: vi.fn(),
  },
  remakeVideoUnitMember: {
    findMany: vi.fn(),
  },
  remakeVideoUnitBatch: {
    findMany: vi.fn(),
  },
  remakeVideoTrack: {
    findMany: vi.fn(),
  },
  remakeInvalidation: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  remakeVideoUnitTrack: {
    update: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invalidateRemakeVideoUnitVersions (D-22)', () => {
  it('marks unit versions needs_review when orderedReferences include an invalidated member mediaId', async () => {
    const { invalidateRemakeVideoUnitVersions } = await import(
      '@/lib/remake-projects/unit/invalidation'
    )
    prismaMock.remakeOutputVersion.findMany.mockResolvedValueOnce([
      { id: 'old-kf-1', mediaId: IDS.keyframeCandidateMedia, kind: 'keyframe_candidate' },
    ])
    prismaMock.remakePromptVersion.findMany.mockResolvedValueOnce([])
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      { id: IDS.revisionId, shotId: IDS.shotId },
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { unitId: IDS.unitId },
    ])
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([unitBatchRow()])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeInvalidation.create.mockResolvedValueOnce({ id: 'inv-unit-1' })

    const result = await invalidateRemakeVideoUnitVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(result.invalidated).toBe(1)
    expect(prismaMock.remakeOutputVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [IDS.outputVersionId] } },
        data: { status: 'needs_review', invalidatedAt: expect.any(Date) },
      }),
    )
    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shotId: IDS.shotId,
          revisionId: IDS.revisionId,
          unitBatchId: IDS.unitBatchId,
          unitVersionId: IDS.unitVersionId,
          reason: 'keyframe_updated',
          status: 'needs_review',
        }),
      }),
    )
    // adopted pointer / history untouched
    expect(prismaMock.remakeVideoUnitTrack.update).not.toHaveBeenCalled()
  })

  it('marks unit versions needs_review when a member promptVersionId is invalidated', async () => {
    const { invalidateRemakeVideoUnitVersions } = await import(
      '@/lib/remake-projects/unit/invalidation'
    )
    // invalidated media ids do NOT intersect the batch refs
    prismaMock.remakeOutputVersion.findMany.mockResolvedValueOnce([
      { id: 'old-kf-1', mediaId: 'unrelated-media', kind: 'keyframe_candidate' },
    ])
    // but the frozen member prompt version is invalidated
    prismaMock.remakePromptVersion.findMany.mockResolvedValueOnce([
      { id: IDS.member2PromptVersionId },
    ])
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      { id: IDS.revisionId, shotId: IDS.shotId },
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { unitId: IDS.unitId },
    ])
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([unitBatchRow()])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeInvalidation.create.mockResolvedValueOnce({ id: 'inv-unit-2' })

    const result = await invalidateRemakeVideoUnitVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'prompt_updated',
    })

    expect(result.invalidated).toBe(1)
    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitVersionId: IDS.unitVersionId, reason: 'prompt_updated' }),
      }),
    )
  })

  it('is idempotent — skips existing invalidation rows', async () => {
    const { invalidateRemakeVideoUnitVersions } = await import(
      '@/lib/remake-projects/unit/invalidation'
    )
    prismaMock.remakeOutputVersion.findMany.mockResolvedValueOnce([
      { id: 'old-kf-1', mediaId: IDS.keyframeCandidateMedia, kind: 'keyframe_candidate' },
    ])
    prismaMock.remakePromptVersion.findMany.mockResolvedValueOnce([])
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      { id: IDS.revisionId, shotId: IDS.shotId },
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { unitId: IDS.unitId },
    ])
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([unitBatchRow()])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce({ id: 'existing-inv' })

    const result = await invalidateRemakeVideoUnitVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(result.invalidated).toBe(0)
    expect(prismaMock.remakeInvalidation.create).not.toHaveBeenCalled()
  })

  it('is a no-op when the shot belongs to no unit', async () => {
    const { invalidateRemakeVideoUnitVersions } = await import(
      '@/lib/remake-projects/unit/invalidation'
    )
    prismaMock.remakeOutputVersion.findMany.mockResolvedValueOnce([
      { id: 'old-kf-1', mediaId: IDS.keyframeCandidateMedia, kind: 'keyframe_candidate' },
    ])
    prismaMock.remakePromptVersion.findMany.mockResolvedValueOnce([])
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      { id: IDS.revisionId, shotId: IDS.shotId },
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([])

    const result = await invalidateRemakeVideoUnitVersions({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    expect(result.invalidated).toBe(0)
    expect(prismaMock.remakeOutputVersion.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.remakeInvalidation.create).not.toHaveBeenCalled()
  })
})

describe('keyframe invalidation hook (D-22 Test 4)', () => {
  it('propagates member keyframe invalidation to the owning unit versions', async () => {
    const { invalidateKeyframeOutputsForRevision } = await import(
      '@/lib/remake-projects/keyframes/invalidation'
    )
    // Keyframe path + unit path share the same stale-output query
    prismaMock.remakeOutputVersion.findMany.mockResolvedValue([
      { id: 'old-kf-1', mediaId: IDS.keyframeCandidateMedia, kind: 'keyframe_candidate' },
    ])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.remakeInvalidation.findFirst
      .mockResolvedValueOnce(null) // keyframe output row
      .mockResolvedValueOnce(null) // unit version row
    prismaMock.remakeInvalidation.create
      .mockResolvedValueOnce({ id: 'inv-kf-1' })
      .mockResolvedValueOnce({ id: 'inv-unit-1' })
    // unit path lookups
    prismaMock.remakePromptVersion.findMany.mockResolvedValueOnce([])
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      { id: IDS.revisionId, shotId: IDS.shotId },
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { unitId: IDS.unitId },
    ])
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([unitBatchRow()])
    // video path (called between keyframe and unit paths) finds no single-shot tracks
    prismaMock.remakeVideoTrack.findMany.mockResolvedValue([])

    await invalidateKeyframeOutputsForRevision({
      shotId: IDS.shotId,
      revisionId: IDS.revisionId,
      reason: 'keyframe_updated',
    })

    // one invalidation row for the keyframe output + one for the unit version
    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.remakeInvalidation.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitVersionId: IDS.unitVersionId,
          unitBatchId: IDS.unitBatchId,
        }),
      }),
    )
  })
})
