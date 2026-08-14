import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  },
  remakeVideoUnit: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  remakeVideoUnitMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitBatch: { findFirst: vi.fn() },
  task: { findFirst: vi.fn() },
  remakeKeyframeTrack: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

function activeCurrentRevision(shotRevisionId: string, remakeProjectId = IDS.remakeProjectId) {
  return {
    id: shotRevisionId,
    revision: 1,
    lifecycleState: 'active',
    shot: { id: `shot-${shotRevisionId}`, currentRevision: 1, remakeProjectId },
  }
}

const unitSnapshot = {
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
    prismaMock.remakeVideoUnitBatch.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([
      { id: 'm1', unitId: IDS.unitId, shotRevisionId: IDS.member1ShotRevisionId, ordinal: 1 },
    ])
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 1 })
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
  })

  it('throws REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT when a queued/processing unit task exists', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: 'task-1' })
    await expect(updateVideoUnitMembers(input)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT',
    )
    expect(prismaMock.remakeVideoUnitBatch.findFirst).not.toHaveBeenCalled()
  })

  it('throws REMAKE_VIDEO_UNIT_MEMBERS_FROZEN after the first committed batch', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitBatch.findFirst.mockResolvedValueOnce({ id: 'batch-1' })
    await expect(updateVideoUnitMembers(input)).rejects.toThrow(
      'REMAKE_VIDEO_UNIT_MEMBERS_FROZEN',
    )
  })

  it('removes dropped members and blocks re-adding a member of another unit (D-04)', async () => {
    const { updateVideoUnitMembers } = await import('@/lib/remake-projects/unit/service')
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.task.findFirst.mockResolvedValueOnce(null)
    prismaMock.remakeVideoUnitBatch.findFirst.mockResolvedValueOnce(null)
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
