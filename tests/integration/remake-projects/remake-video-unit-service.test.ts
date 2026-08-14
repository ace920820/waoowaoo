import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  unitInputFingerprint,
  type VideoUnitInputSnapshot,
} from '@/lib/remake-projects/unit/contracts'

/**
 * Unit CRUD / freeze-gate / currentness service tests (D-04 / D-19 / D-22),
 * using the vi.hoisted prisma-mock pattern. Runs with BILLING_TEST_BOOTSTRAP=0
 * (pure mock — no database).
 */

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  userId: '55555555-5555-4555-8555-555555555555',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: '33333333-3333-4333-8333-333333333333',
  member1ShotRevisionId: '44444444-4444-4444-8444-444444444444',
  member2ShotRevisionId: '55555555-5555-4555-8555-555555555555',
  member3ShotRevisionId: '66666666-6666-4666-8666-666666666666',
  member1KeyframeMediaId: '77777777-7777-4777-8777-777777777777',
  member2KeyframeMediaId: '88888888-8888-4888-8888-888888888888',
  member1PromptVersionId: '99999999-9999-4999-8999-999999999999',
  member2PromptVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actionSheetMediaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: { findFirst: vi.fn() },
  remakeShotRevision: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  remakeVideoUnit: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitTrack: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitBatch: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  remakeVideoUnitVersion: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitAdoptionEvent: {
    create: vi.fn(),
  },
  remakeOutputVersion: {
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  remakeInvalidation: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  remakeProvenanceRecord: {
    create: vi.fn(),
  },
  task: { findFirst: vi.fn() },
  remakeKeyframeTrack: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
  // Clear any leftover mockResolvedValueOnce queues across tests.
  for (const value of Object.values(prismaMock)) {
    if (value && typeof value === 'object') {
      for (const fn of Object.values(value as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in (fn as object)) {
          ;(fn as unknown as { mockReset: () => void }).mockReset()
        }
      }
    }
  }
  // Restore the transaction passthrough that mockReset wiped.
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => callback(prismaMock),
  )
})

function activeCurrentRevision(shotRevisionId: string, remakeProjectId = IDS.remakeProjectId) {
  return {
    id: shotRevisionId,
    revision: 1,
    lifecycleState: 'active',
    shot: { id: `shot-${shotRevisionId}`, currentRevision: 1, remakeProjectId },
  }
}

const unitSnapshot: VideoUnitInputSnapshot = {
  projectId: IDS.projectId,
  remakeProjectId: IDS.remakeProjectId,
  unitId: IDS.unitId,
  members: [
    {
      shotRevisionId: IDS.member1ShotRevisionId,
      ordinal: 1,
      selectedKeyframe: { slot: 'middle' as const, mediaId: IDS.member1KeyframeMediaId },
      promptVersionId: IDS.member1PromptVersionId,
      timeRangeSeconds: { start: 0, end: 1 },
    },
    {
      shotRevisionId: IDS.member2ShotRevisionId,
      ordinal: 2,
      selectedKeyframe: { slot: 'middle' as const, mediaId: IDS.member2KeyframeMediaId },
      promptVersionId: IDS.member2PromptVersionId,
      timeRangeSeconds: { start: 1, end: 4 },
    },
  ],
  orderedReferences: [
    { role: 'shot_keyframe' as const, ordinal: 1, mediaId: IDS.member1KeyframeMediaId },
    { role: 'shot_keyframe' as const, ordinal: 2, mediaId: IDS.member2KeyframeMediaId },
    { role: 'action_sheet' as const, ordinal: 3, mediaId: IDS.actionSheetMediaId },
  ],
  model: { id: 'video-model-v1', provider: 'ark' },
  options: { resolution: '720p', generateAudio: false },
  referenceMode: 'ark_content_multireference',
  durationSeconds: 6,
  promptText: '多镜头剪接视频。\n总时长约 6 秒。\n0-1s（镜头 1）：角色推门。\n1-4s（镜头 2）：角色走到窗边。',
}

describe('createVideoUnit (D-02/D-04)', () => {
  it('requires at least 2 members', async () => {
    const { createVideoUnit } = await import('@/lib/remake-projects/unit/service')
    await expect(
      createVideoUnit({
        projectId: IDS.projectId,
        userId: IDS.userId,
        memberShotRevisionIds: [IDS.member1ShotRevisionId],
      }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_MIN_MEMBERS')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a member whose shot revision is not active/current', async () => {
    const { createVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: IDS.projectId })
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      activeCurrentRevision(IDS.member1ShotRevisionId),
      { ...activeCurrentRevision(IDS.member2ShotRevisionId), lifecycleState: 'archived' },
    ])
    await expect(
      createVideoUnit({
        projectId: IDS.projectId,
        userId: IDS.userId,
        memberShotRevisionIds: [IDS.member1ShotRevisionId, IDS.member2ShotRevisionId],
      }),
    ).rejects.toThrow(`REMAKE_VIDEO_UNIT_MEMBER_NOT_CURRENT:${IDS.member2ShotRevisionId}`)
  })

  it('rejects a member already assigned to another unit (D-04)', async () => {
    const { createVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: IDS.projectId })
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      activeCurrentRevision(IDS.member1ShotRevisionId),
      activeCurrentRevision(IDS.member2ShotRevisionId),
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'member-row-1', shotRevisionId: IDS.member1ShotRevisionId },
    ])
    await expect(
      createVideoUnit({
        projectId: IDS.projectId,
        userId: IDS.userId,
        memberShotRevisionIds: [IDS.member1ShotRevisionId, IDS.member2ShotRevisionId],
      }),
    ).rejects.toThrow(`REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED:${IDS.member1ShotRevisionId}`)
  })

  it('creates the unit with members in submitted order (ordinals 1..n)', async () => {
    const { createVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.project.findFirst.mockResolvedValueOnce({ id: IDS.projectId })
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      activeCurrentRevision(IDS.member1ShotRevisionId),
      activeCurrentRevision(IDS.member2ShotRevisionId),
    ])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([])
    prismaMock.remakeVideoUnit.create.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 2 })

    const result = await createVideoUnit({
      projectId: IDS.projectId,
      userId: IDS.userId,
      memberShotRevisionIds: [IDS.member2ShotRevisionId, IDS.member1ShotRevisionId],
    })

    expect(result.unitId).toBe(IDS.unitId)
    expect(prismaMock.remakeVideoUnitMember.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 1 },
          { unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 2 },
        ],
      }),
    )
  })
})

describe('updateVideoUnitMembers (D-19 freeze gate)', () => {
  const input = {
    projectId: IDS.projectId,
    userId: IDS.userId,
    unitId: IDS.unitId,
    members: [
      { shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
    ],
  }

  it('succeeds while the unit has no pending task and zero committed batches', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
    ])
    prismaMock.remakeVideoUnitMember.deleteMany.mockResolvedValueOnce({ count: 0 })
    prismaMock.remakeVideoUnitMember.findUnique.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 1 })
    // Member added → invalidation path runs; no committed batches → nothing invalidated.
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([])
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
    ])

    const result = await updateVideoUnitMembers({
      ...input,
      members: [
        { shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
        { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
      ],
    })

    expect(result.unitId).toBe(IDS.unitId)
    expect(prismaMock.remakeVideoUnitMember.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
        ],
      }),
    )
    expect(result.invalidated).toBe(0)
  })

  it('throws REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT when a queued/processing unit task exists', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: 'task-1' })
    await expect(updateVideoUnitMembers(input)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT',
    )
    expect(prismaMock.remakeVideoUnitMember.findMany).not.toHaveBeenCalled()
  })

  it('allows member changes after a committed batch and invalidates prior unit versions (D-19 revised)', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    // No MEMBERS_FROZEN gate anymore — committed batches no longer freeze members.
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
    ])
    prismaMock.remakeVideoUnitMember.deleteMany.mockResolvedValueOnce({ count: 0 })
    prismaMock.remakeVideoUnitMember.findUnique.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 0 })
    // Member change triggers invalidation of the unit's prior completed versions.
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([
      {
        id: 'unit-batch-1',
        versions: [
          {
            id: 'uv-1',
            outputVersionId: 'ov-1',
            outputVersion: { status: 'completed', invalidatedAt: null },
          },
        ],
      },
    ])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeVideoUnitTrack.findUnique.mockResolvedValueOnce({ id: 'unit-track-1' })
    prismaMock.remakeShotRevision.findFirst.mockResolvedValueOnce({ shotId: 'shot-1' })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeInvalidation.create.mockResolvedValueOnce({ id: 'inv-1' })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
    ])

    const result = await updateVideoUnitMembers({
      ...input,
      members: [
        { shotRevisionId: IDS.member1ShotRevisionId, ordinal: 2 },
        { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 1 },
      ],
    })

    expect(result.unitId).toBe(IDS.unitId)
    // Reorder counts as a change → prior completed version is invalidated.
    expect(prismaMock.remakeOutputVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { invalidatedAt: expect.any(Date), status: 'needs_review' },
      }),
    )
    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'unit_members_changed',
          unitVersionId: 'uv-1',
        }),
      }),
    )
    expect(result.invalidated).toBe(1)
  })

  it('removes dropped members and blocks re-adding a member of another unit (D-04)', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
    ])
    prismaMock.remakeVideoUnitMember.findUnique.mockResolvedValueOnce({
      id: 'other-unit-member',
      unitId: 'other-unit',
    })
    await expect(
      updateVideoUnitMembers({
        ...input,
        members: [
          { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 1 },
          { shotRevisionId: IDS.member3ShotRevisionId, ordinal: 2 },
        ],
      }),
    ).rejects.toThrow(`REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED:${IDS.member3ShotRevisionId}`)
  })

  it("persists keyframeSlot on added members and updates existing members' slot, invalidating old versions (Phase 09.2)", async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1, keyframeSlot: null },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2, keyframeSlot: null },
    ])
    prismaMock.remakeVideoUnitMember.deleteMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeVideoUnitMember.findUnique.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeVideoUnitMember.update.mockResolvedValueOnce({ id: 'm2', keyframeSlot: 'end' })
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([
      {
        id: 'unit-batch-1',
        versions: [
          {
            id: 'uv-1',
            outputVersionId: 'ov-1',
            outputVersion: { status: 'completed', invalidatedAt: null },
          },
        ],
      },
    ])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeVideoUnitTrack.findUnique.mockResolvedValueOnce({ id: 'unit-track-1' })
    prismaMock.remakeShotRevision.findFirst.mockResolvedValueOnce({ shotId: 'shot-2' })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeInvalidation.create.mockResolvedValueOnce({ id: 'inv-1' })

    const result = await updateVideoUnitMembers({
      ...input,
      members: [
        { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 1, keyframeSlot: 'end' },
        { shotRevisionId: IDS.member3ShotRevisionId, ordinal: 2, keyframeSlot: 'start' },
      ],
    })

    // member3 added with its pinned slot; member2's slot updated in place.
    expect(prismaMock.remakeVideoUnitMember.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            shotRevisionId: IDS.member3ShotRevisionId,
            ordinal: 2,
            keyframeSlot: 'start',
          }),
        ],
      }),
    )
    expect(prismaMock.remakeVideoUnitMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { keyframeSlot: 'end' } }),
    )
    // Slot changes count as a member change → prior versions invalidated.
    expect(prismaMock.remakeOutputVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { invalidatedAt: expect.any(Date), status: 'needs_review' },
      }),
    )
    expect(result.invalidated).toBe(1)
  })

  it('treats a keyframeSlot-only change as a member change and invalidates old versions (Phase 09.2)', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1, keyframeSlot: null },
      { id: 'm2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2, keyframeSlot: null },
    ])
    prismaMock.remakeVideoUnitBatch.findMany.mockResolvedValueOnce([
      {
        id: 'unit-batch-1',
        versions: [
          {
            id: 'uv-1',
            outputVersionId: 'ov-1',
            outputVersion: { status: 'completed', invalidatedAt: null },
          },
        ],
      },
    ])
    prismaMock.remakeOutputVersion.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeVideoUnitTrack.findUnique.mockResolvedValueOnce({ id: 'unit-track-1' })
    prismaMock.remakeShotRevision.findFirst.mockResolvedValueOnce({ shotId: 'shot-1' })
    prismaMock.remakeInvalidation.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeInvalidation.create.mockResolvedValueOnce({ id: 'inv-1' })

    const result = await updateVideoUnitMembers({
      ...input,
      members: [
        { shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1, keyframeSlot: 'middle' },
        { shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
      ],
    })

    // Same member set and order — only member1's slot changed.
    expect(prismaMock.remakeVideoUnitMember.createMany).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnitMember.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnitMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { keyframeSlot: 'middle' } }),
    )
    expect(prismaMock.remakeOutputVersion.updateMany).toHaveBeenCalled()
    expect(prismaMock.remakeInvalidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'unit_members_changed' }),
      }),
    )
    expect(result.invalidated).toBe(1)
  })
})

describe('getVideoUnitDetail', () => {
  it('returns members (ordinal + shot info + durationSeconds), track batches/versions and adoption events', async () => {
    const { getVideoUnitDetail } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
      userLabel: null,
      createdAt: new Date('2026-08-14T00:00:00Z'),
      members: [
        { id: 'row-1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
        { id: 'row-2', unitId: IDS.unitId, shotRevisionId: IDS.member2ShotRevisionId, ordinal: 2 },
      ],
      tracks: [
        {
          id: 'unit-track-1',
          adoptedVersionId: 'uv-2',
          batches: [
            {
              id: 'unit-batch-1',
              taskId: 'task-1',
              operationKey: 'op-1',
              modelId: 'video-model-v1',
              modelOptions: { resolution: '720p' },
              orderedReferences: [{ role: 'shot_keyframe', ordinal: 1, mediaId: IDS.member1KeyframeMediaId }],
              createdAt: new Date('2026-08-14T00:00:00Z'),
              versions: [
                {
                  id: 'uv-1',
                  ordinal: 1,
                  outputVersionId: 'ov-1',
                  outputVersion: { mediaId: 'media-url-1', status: 'completed', invalidatedAt: null },
                },
              ],
            },
          ],
          adoptionEvents: [
            { id: 'event-1', previousVersionId: null, nextVersionId: 'uv-1', createdAt: new Date('2026-08-14T00:00:00Z') },
          ],
        },
      ],
    })
    prismaMock.remakeShotRevision.findMany.mockResolvedValueOnce([
      {
        id: IDS.member1ShotRevisionId,
        payload: JSON.stringify({ startTimecode: '00:00:00.000', endTimecode: '00:00:01.500' }),
        shot: { id: 'shot-1', stableKey: 'scene-001-shot-001', sequence: 1 },
      },
      {
        id: IDS.member2ShotRevisionId,
        payload: JSON.stringify({ startTimecode: '00:00:01.500', endTimecode: '00:00:04.500' }),
        shot: { id: 'shot-2', stableKey: 'scene-001-shot-002', sequence: 2 },
      },
    ])

    const result = await getVideoUnitDetail({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
    })

    expect(result).not.toBeNull()
    expect(result!.members).toHaveLength(2)
    expect(result!.members[0]).toMatchObject({
      ordinal: 1,
      shotRevisionId: IDS.member1ShotRevisionId,
      shotId: 'shot-1',
      stableKey: 'scene-001-shot-001',
      sequence: 1,
      durationSeconds: 1.5,
    })
    expect(result!.members[1].durationSeconds).toBe(3)
    expect(result!.track?.adoptedVersionId).toBe('uv-2')
    expect(result!.track?.batches[0].versions[0].mediaId).toBe('media-url-1')
    expect(result!.track?.adoptionEvents[0].nextVersionId).toBe('uv-1')
  })

  it('returns null when the unit is not owned by the user', async () => {
    const { getVideoUnitDetail } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce(null)
    const result = await getVideoUnitDetail({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
    })
    expect(result).toBeNull()
  })
})

describe('assertVideoUnitSubmissionCurrent (D-22)', () => {
  it('passes when unit, frozen members, active revisions and adopted keyframes are unchanged', async () => {
    const { assertVideoUnitSubmissionCurrent } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValueOnce({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce(
      unitSnapshot.members.map((member) => ({
        id: `row-${member.ordinal}`,
        unitId: IDS.unitId,
        shotRevisionId: member.shotRevisionId,
        ordinal: member.ordinal,
      })),
    )
    prismaMock.remakeShotRevision.findUnique
      .mockResolvedValueOnce({ id: IDS.member1ShotRevisionId, revision: 1, lifecycleState: 'active', shot: { currentRevision: 1 } })
      .mockResolvedValueOnce({ id: IDS.member2ShotRevisionId, revision: 1, lifecycleState: 'active', shot: { currentRevision: 1 } })
    prismaMock.remakeKeyframeTrack.findUnique
      .mockResolvedValueOnce({
        adoptedCandidate: { outputVersion: { mediaId: IDS.member1KeyframeMediaId } },
      })
      .mockResolvedValueOnce({
        adoptedCandidate: { outputVersion: { mediaId: IDS.member2KeyframeMediaId } },
      })

    await expect(assertVideoUnitSubmissionCurrent(unitSnapshot)).resolves.not.toThrow()
  })

  it('throws REMAKE_VIDEO_UNIT_INPUT_STALE when the unit is gone', async () => {
    const { assertVideoUnitSubmissionCurrent } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValueOnce(null)
    await expect(assertVideoUnitSubmissionCurrent(unitSnapshot)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_INPUT_STALE',
    )
  })

  it('throws REMAKE_VIDEO_UNIT_INPUT_STALE when the frozen member set changed', async () => {
    const { assertVideoUnitSubmissionCurrent } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValueOnce({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'row-1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
      { id: 'row-3', unitId: IDS.unitId, shotRevisionId: IDS.member3ShotRevisionId, ordinal: 2 },
    ])
    await expect(assertVideoUnitSubmissionCurrent(unitSnapshot)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_INPUT_STALE',
    )
  })

  it('throws REMAKE_VIDEO_UNIT_INPUT_STALE when a member shot revision is no longer active', async () => {
    const { assertVideoUnitSubmissionCurrent } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValueOnce({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce(
      unitSnapshot.members.map((member) => ({
        id: `row-${member.ordinal}`,
        unitId: IDS.unitId,
        shotRevisionId: member.shotRevisionId,
        ordinal: member.ordinal,
      })),
    )
    prismaMock.remakeShotRevision.findUnique.mockResolvedValueOnce({
      id: IDS.member1ShotRevisionId,
      revision: 1,
      lifecycleState: 'archived',
      shot: { currentRevision: 2 },
    })
    await expect(assertVideoUnitSubmissionCurrent(unitSnapshot)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_INPUT_STALE',
    )
  })

  it('throws REMAKE_VIDEO_UNIT_INPUT_STALE when an adopted keyframe changed', async () => {
    const { assertVideoUnitSubmissionCurrent } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValueOnce({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce(
      unitSnapshot.members.map((member) => ({
        id: `row-${member.ordinal}`,
        unitId: IDS.unitId,
        shotRevisionId: member.shotRevisionId,
        ordinal: member.ordinal,
      })),
    )
    prismaMock.remakeShotRevision.findUnique
      .mockResolvedValueOnce({ id: IDS.member1ShotRevisionId, revision: 1, lifecycleState: 'active', shot: { currentRevision: 1 } })
      .mockResolvedValueOnce({ id: IDS.member2ShotRevisionId, revision: 1, lifecycleState: 'active', shot: { currentRevision: 1 } })
    prismaMock.remakeKeyframeTrack.findUnique.mockResolvedValueOnce({
      adoptedCandidate: { outputVersion: { mediaId: IDS.member2KeyframeMediaId } },
    })

    await expect(assertVideoUnitSubmissionCurrent(unitSnapshot)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_INPUT_STALE',
    )
  })
})

describe('appendVideoUnitBatch (D-17/D-22)', () => {
  const appendInput = {
    taskId: 'task-1',
    operationKey: 'op-unit-001-v1',
    inputSnapshot: unitSnapshot,
    inputFingerprint: unitInputFingerprint(unitSnapshot),
    mediaId: 'media-result-1',
  }

  it('rejects a fingerprint mismatch before any write', async () => {
    const { appendVideoUnitBatch } = await import('@/lib/remake-projects/unit/service')
    await expect(
      appendVideoUnitBatch({ ...appendInput, inputFingerprint: 'f'.repeat(64) }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_FINGERPRINT_INVALID')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('creates track/batch/version/provenance once and is idempotent on trackId_operationKey retry', async () => {
    const { appendVideoUnitBatch } = await import('@/lib/remake-projects/unit/service')
    // D-22 currentness assertion (runs inside the transaction on every append)
    prismaMock.remakeVideoUnit.findUnique.mockResolvedValue({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValue(
      unitSnapshot.members.map((member) => ({
        id: `row-${member.ordinal}`,
        unitId: IDS.unitId,
        shotRevisionId: member.shotRevisionId,
        ordinal: member.ordinal,
      })),
    )
    prismaMock.remakeShotRevision.findUnique.mockResolvedValue({
      id: IDS.member1ShotRevisionId,
      revision: 1,
      lifecycleState: 'active',
      shotId: 'shot-1',
      shot: { currentRevision: 1 },
    })
    prismaMock.remakeKeyframeTrack.findUnique
      .mockResolvedValueOnce({ adoptedCandidate: { outputVersion: { mediaId: IDS.member1KeyframeMediaId } } })
      .mockResolvedValueOnce({ adoptedCandidate: { outputVersion: { mediaId: IDS.member2KeyframeMediaId } } })
      .mockResolvedValueOnce({ adoptedCandidate: { outputVersion: { mediaId: IDS.member1KeyframeMediaId } } })
      .mockResolvedValueOnce({ adoptedCandidate: { outputVersion: { mediaId: IDS.member2KeyframeMediaId } } })
    // track: first call creates, retry reuses
    prismaMock.remakeVideoUnitTrack.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'unit-track-1' })
    prismaMock.remakeVideoUnitTrack.create.mockResolvedValue({ id: 'unit-track-1' })
    // batch: first call creates, retry returns the existing rows
    prismaMock.remakeVideoUnitBatch.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-batch', versions: [{ id: 'existing-uv' }] })
    prismaMock.remakeVideoUnitBatch.create.mockResolvedValue({ id: 'unit-batch-1' })
    prismaMock.remakeVideoUnitVersion.findMany.mockResolvedValue([{ id: 'uv-1' }])
    prismaMock.remakeProvenanceRecord.create.mockResolvedValue({ id: 'prov-1' })

    const first = await appendVideoUnitBatch(appendInput)
    expect(first).toEqual({ batchId: 'unit-batch-1', versionIds: ['uv-1'] })

    const retry = await appendVideoUnitBatch(appendInput)
    expect(retry).toEqual({ batchId: 'existing-batch', versionIds: ['existing-uv'] })

    // no duplicated output / provenance rows
    expect(prismaMock.remakeVideoUnitBatch.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.remakeVideoUnitTrack.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.remakeProvenanceRecord.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.remakeVideoUnitBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackId: 'unit-track-1',
          operationKey: 'op-unit-001-v1',
          promptVersionId: IDS.member1PromptVersionId, // Open Question 1: first member's promptVersionId
          versions: expect.objectContaining({
            create: expect.objectContaining({
              ordinal: 1,
              outputVersion: expect.objectContaining({
                create: expect.objectContaining({
                  shotId: 'shot-1',
                  revisionId: IDS.member1ShotRevisionId,
                  kind: 'video_candidate_unit',
                  fingerprint: `op-unit-001-v1:${appendInput.inputFingerprint}:1`,
                  status: 'completed',
                }),
              }),
            }),
          }),
        }),
      }),
    )
  })
})

describe('adoptVideoUnitVersion (D-17)', () => {
  const adoptInput = {
    projectId: IDS.projectId,
    userId: IDS.userId,
    trackId: 'unit-track-1',
    versionId: 'uv-1',
  }

  it('sets the unit-track adoption pointer and writes an adoption event', async () => {
    const { adoptVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: null,
    })
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: 'uv-1',
      outputVersionId: 'ov-1',
      outputVersion: { status: 'completed', invalidatedAt: null },
      batch: { inputSnapshot: unitSnapshot },
    })
    prismaMock.remakeShotRevision.findUnique.mockResolvedValue({
      id: IDS.member1ShotRevisionId,
      revision: 1,
      lifecycleState: 'active',
      shot: { currentRevision: 1 },
    })
    prismaMock.remakeVideoUnitTrack.update.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-1',
    })
    prismaMock.remakeVideoUnitAdoptionEvent.create.mockResolvedValueOnce({ id: 'event-1' })

    const result = await adoptVideoUnitVersion(adoptInput)
    expect(result.adoptedVersionId).toBe('uv-1')
    expect(prismaMock.remakeVideoUnitAdoptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackId: 'unit-track-1',
          previousVersionId: null,
          nextVersionId: 'uv-1',
          reviewerId: IDS.userId,
        }),
      }),
    )
  })

  it('requires explicit confirmReplace when replacing the adopted version', async () => {
    const { adoptVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-1',
    })
    await expect(
      adoptVideoUnitVersion({ ...adoptInput, versionId: 'uv-2' }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_REPLACE_CONFIRM_REQUIRED')

    // with confirmation the replacement proceeds
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-1',
    })
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: 'uv-2',
      outputVersionId: 'ov-2',
      outputVersion: { status: 'completed', invalidatedAt: null },
      batch: { inputSnapshot: unitSnapshot },
    })
    prismaMock.remakeShotRevision.findUnique.mockResolvedValue({
      id: IDS.member1ShotRevisionId,
      revision: 1,
      lifecycleState: 'active',
      shot: { currentRevision: 1 },
    })
    prismaMock.remakeVideoUnitTrack.update.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-2',
    })
    prismaMock.remakeVideoUnitAdoptionEvent.create.mockResolvedValueOnce({ id: 'event-2' })
    const result = await adoptVideoUnitVersion({
      ...adoptInput,
      versionId: 'uv-2',
      confirmReplace: true,
    })
    expect(result.adoptedVersionId).toBe('uv-2')
  })

  it('rejects non-completed or invalidated versions', async () => {
    const { adoptVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: null,
    })
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce(null)
    await expect(adoptVideoUnitVersion(adoptInput)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND',
    )
  })

  it('rejects stale inputs with REMAKE_VIDEO_UNIT_INPUT_STALE', async () => {
    const { adoptVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: null,
    })
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: 'uv-1',
      outputVersionId: 'ov-1',
      outputVersion: { status: 'completed', invalidatedAt: null },
      batch: { inputSnapshot: unitSnapshot },
    })
    prismaMock.remakeShotRevision.findUnique.mockResolvedValueOnce({
      id: IDS.member1ShotRevisionId,
      revision: 1,
      lifecycleState: 'archived',
      shot: { currentRevision: 2 },
    })
    await expect(adoptVideoUnitVersion(adoptInput)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_INPUT_STALE',
    )
  })
})

describe('setVideoUnitReviewNote (D-17)', () => {
  it('writes the review note on an owned unit version', async () => {
    const { setVideoUnitReviewNote } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({ id: 'uv-1' })
    prismaMock.remakeVideoUnitVersion.update.mockResolvedValueOnce({
      id: 'uv-1',
      note: '需要调整运镜',
    })
    const result = await setVideoUnitReviewNote({
      projectId: IDS.projectId,
      userId: IDS.userId,
      versionId: 'uv-1',
      note: '需要调整运镜',
    })
    expect(result.note).toBe('需要调整运镜')
    expect(prismaMock.remakeVideoUnitVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: '需要调整运镜', reviewerId: IDS.userId }),
      }),
    )
  })

  it('throws REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND for a version outside the user project', async () => {
    const { setVideoUnitReviewNote } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce(null)
    await expect(
      setVideoUnitReviewNote({
        projectId: IDS.projectId,
        userId: IDS.userId,
        versionId: 'uv-x',
        note: 'x',
      }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND')
  })
})

describe('reconfirmVideoUnitVersion (D-17)', () => {
  const input = {
    projectId: IDS.projectId,
    userId: IDS.userId,
    trackId: 'unit-track-1',
    versionId: 'uv-1',
  }

  it('clears needs_review invalidation rows and the output invalidatedAt idempotently', async () => {
    const { reconfirmVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-1',
    })
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: 'uv-1',
      outputVersionId: 'ov-1',
      outputVersion: { invalidatedAt: new Date(), status: 'needs_review' },
    })
    prismaMock.remakeInvalidation.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeOutputVersion.update.mockResolvedValueOnce({
      id: 'ov-1',
      invalidatedAt: null,
      status: 'completed',
    })
    prismaMock.remakeVideoUnitAdoptionEvent.create.mockResolvedValueOnce({ id: 'event-reconfirm' })

    const result = await reconfirmVideoUnitVersion(input)
    expect(result.reconfirmed).toBe(true)
    expect(prismaMock.remakeInvalidation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unitVersionId: 'uv-1', status: 'needs_review' }),
      }),
    )
    expect(prismaMock.remakeOutputVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ov-1' },
        data: expect.objectContaining({ invalidatedAt: null, status: 'completed' }),
      }),
    )
  })

  it('rejects reconfirming a version that is not the adopted one', async () => {
    const { reconfirmVideoUnitVersion } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      adoptedVersionId: 'uv-9',
    })
    await expect(reconfirmVideoUnitVersion(input)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_RECONFIRM_NOT_ADOPTED',
    )
  })
})

describe('getVideoUnitTrackDetail', () => {
  it('returns the track with batches/versions and adoption events, ownership-scoped', async () => {
    const { getVideoUnitTrackDetail } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce({
      id: 'unit-track-1',
      unit: { id: IDS.unitId },
      adoptedVersionId: 'uv-1',
      batches: [
        {
          id: 'unit-batch-1',
          taskId: 'task-1',
          operationKey: 'op-1',
          modelId: 'video-model-v1',
          modelOptions: { resolution: '720p' },
          orderedReferences: [
            { role: 'shot_keyframe', ordinal: 1, mediaId: IDS.member1KeyframeMediaId },
          ],
          createdAt: new Date('2026-08-14T00:00:00Z'),
          versions: [
            {
              id: 'uv-1',
              ordinal: 1,
              outputVersionId: 'ov-1',
              outputVersion: { mediaId: 'media-1', status: 'completed', invalidatedAt: null },
            },
          ],
        },
      ],
      adoptionEvents: [
        {
          id: 'event-1',
          previousVersionId: null,
          nextVersionId: 'uv-1',
          createdAt: new Date('2026-08-14T00:00:00Z'),
        },
      ],
    })
    const result = await getVideoUnitTrackDetail({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: 'unit-track-1',
    })
    expect(result?.track).toMatchObject({
      id: 'unit-track-1',
      unitId: IDS.unitId,
      adoptedVersionId: 'uv-1',
    })
    expect(result?.history[0].versions[0]).toMatchObject({
      id: 'uv-1',
      mediaId: 'media-1',
      status: 'completed',
    })
    expect(result?.adoptionEvents[0].nextVersionId).toBe('uv-1')
  })

  it('returns null when the track is not owned by the user', async () => {
    const { getVideoUnitTrackDetail } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce(null)
    const result = await getVideoUnitTrackDetail({
      projectId: IDS.projectId,
      userId: IDS.userId,
      trackId: 'unit-track-1',
    })
    expect(result).toBeNull()
  })
})

describe('dissolveVideoUnit (D-19 revised)', () => {
  const dissolveInput = {
    projectId: IDS.projectId,
    userId: IDS.userId,
    unitId: IDS.unitId,
    reason: '手动解散，重新组织镜头',
  }

  it('soft-deletes the unit: releases members and stamps dissolvedAt', async () => {
    const { dissolveVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({
      id: IDS.unitId,
      dissolvedAt: null,
    })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.deleteMany.mockResolvedValueOnce({ count: 2 })
    const dissolvedAt = new Date('2026-08-14T12:00:00Z')
    prismaMock.remakeVideoUnit.update.mockResolvedValueOnce({
      id: IDS.unitId,
      dissolvedAt,
    })

    const result = await dissolveVideoUnit(dissolveInput)

    expect(result).toEqual({ unitId: IDS.unitId, dissolvedAt })
    expect(prismaMock.remakeVideoUnitMember.deleteMany).toHaveBeenCalledWith({
      where: { unitId: IDS.unitId },
    })
    expect(prismaMock.remakeVideoUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IDS.unitId },
        data: expect.objectContaining({
          dissolvedAt: expect.any(Date),
          dissolvedReason: '手动解散，重新组织镜头',
        }),
      }),
    )
  })

  it('is idempotent when the unit is already dissolved (no member release)', async () => {
    const { dissolveVideoUnit } = await import('@/lib/remake-projects/unit/service')
    const dissolvedAt = new Date('2026-08-14T10:00:00Z')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({
      id: IDS.unitId,
      dissolvedAt,
    })

    const result = await dissolveVideoUnit(dissolveInput)

    expect(result).toEqual({ unitId: IDS.unitId, dissolvedAt })
    expect(prismaMock.task.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnitMember.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnit.update).not.toHaveBeenCalled()
  })

  it('blocks dissolve while a unit generation task is pending/running', async () => {
    const { dissolveVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({
      id: IDS.unitId,
      dissolvedAt: null,
    })
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: 'task-1' })

    await expect(dissolveVideoUnit(dissolveInput)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT',
    )
    expect(prismaMock.remakeVideoUnitMember.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnit.update).not.toHaveBeenCalled()
  })

  it('throws REMAKE_VIDEO_UNIT_NOT_FOUND when the unit is not owned by the user', async () => {
    const { dissolveVideoUnit } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce(null)

    await expect(dissolveVideoUnit(dissolveInput)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_NOT_FOUND',
    )
    expect(prismaMock.remakeVideoUnitMember.deleteMany).not.toHaveBeenCalled()
  })
})
