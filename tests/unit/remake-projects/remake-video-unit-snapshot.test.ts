import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import {
  unitInputFingerprint,
  videoUnitInputSnapshotSchema,
  type VideoUnitInputSnapshot,
} from '@/lib/remake-projects/unit/contracts'
import {
  buildVideoUnitTaskDescriptor,
  parseVideoUnitTaskPayload,
} from '@/lib/remake-projects/unit/task-contract'

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: '33333333-3333-4333-8333-333333333333',
  member1ShotRevisionId: '44444444-4444-4444-8444-444444444444',
  member2ShotRevisionId: '55555555-5555-4555-8555-555555555555',
  member1KeyframeMediaId: '66666666-6666-4666-8666-666666666666',
  member2KeyframeMediaId: '77777777-7777-4777-8777-777777777777',
  member1PromptVersionId: '88888888-8888-4888-8888-888888888888',
  member2PromptVersionId: '99999999-9999-4999-8999-999999999999',
  actionSheetMediaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

const frozenUnitSnapshot: VideoUnitInputSnapshot = {
  projectId: ids.projectId,
  remakeProjectId: ids.remakeProjectId,
  unitId: ids.unitId,
  members: [
    {
      shotRevisionId: ids.member1ShotRevisionId,
      ordinal: 1,
      selectedKeyframe: { slot: 'middle', mediaId: ids.member1KeyframeMediaId },
      promptVersionId: ids.member1PromptVersionId,
      timeRangeSeconds: { start: 0, end: 1 },
    },
    {
      shotRevisionId: ids.member2ShotRevisionId,
      ordinal: 2,
      selectedKeyframe: { slot: 'middle', mediaId: ids.member2KeyframeMediaId },
      promptVersionId: ids.member2PromptVersionId,
      timeRangeSeconds: { start: 1, end: 4 },
    },
  ],
  orderedReferences: [
    { role: 'shot_keyframe', ordinal: 1, mediaId: ids.member1KeyframeMediaId },
    { role: 'shot_keyframe', ordinal: 2, mediaId: ids.member2KeyframeMediaId },
    { role: 'action_sheet', ordinal: 3, mediaId: ids.actionSheetMediaId },
  ],
  model: { id: 'video-model-v1', provider: 'ark' },
  options: { resolution: '720p', generateAudio: false },
  referenceMode: 'ark_content_multireference',
  durationSeconds: 6,
  promptText: '这是按时间顺序切换的多镜头视频，各镜头之间为剪接切换（cut），不是连续运镜。\n总时长约 6 秒。\n\n0-1s（镜头 1）：角色推门进入房间。\n1-4s（镜头 2）：角色走到窗边。',
}

describe('videoUnitInputSnapshotSchema (D-22 strict snapshot)', () => {
  it('parses the full research-skeleton shape', () => {
    const parsed = videoUnitInputSnapshotSchema.parse(frozenUnitSnapshot)
    expect(parsed.members).toHaveLength(2)
    expect(parsed.members[0]).toMatchObject({
      shotRevisionId: ids.member1ShotRevisionId,
      ordinal: 1,
      selectedKeyframe: { slot: 'middle', mediaId: ids.member1KeyframeMediaId },
      promptVersionId: ids.member1PromptVersionId,
      timeRangeSeconds: { start: 0, end: 1 },
    })
    expect(parsed.orderedReferences.map((ref) => ref.role)).toEqual([
      'shot_keyframe',
      'shot_keyframe',
      'action_sheet',
    ])
    expect(parsed.durationSeconds).toBe(6)
    expect(parsed.referenceMode).toBe('ark_content_multireference')
  })

  it('is strict: rejects unknown keys', () => {
    expect(() => videoUnitInputSnapshotSchema.parse({ ...frozenUnitSnapshot, rogue: 'x' })).toThrow()
    expect(() =>
      videoUnitInputSnapshotSchema.parse({
        ...frozenUnitSnapshot,
        members: [{ ...frozenUnitSnapshot.members[0], rogue: 'x' }],
      }),
    ).toThrow()
  })

  it('rejects a single-member unit and a missing promptText', () => {
    expect(() =>
      videoUnitInputSnapshotSchema.parse({
        ...frozenUnitSnapshot,
        members: [frozenUnitSnapshot.members[0]],
      }),
    ).toThrow()
    expect(() =>
      videoUnitInputSnapshotSchema.parse({ ...frozenUnitSnapshot, promptText: '' }),
    ).toThrow()
  })
})

describe('unitInputFingerprint (D-22 sensitivity)', () => {
  it('produces identical fingerprints for identical snapshots', () => {
    expect(unitInputFingerprint(frozenUnitSnapshot)).toBe(unitInputFingerprint({ ...frozenUnitSnapshot }))
  })

  it('changes when member order changes', () => {
    const reordered = {
      ...frozenUnitSnapshot,
      members: [frozenUnitSnapshot.members[1], frozenUnitSnapshot.members[0]],
    }
    expect(unitInputFingerprint(reordered)).not.toBe(unitInputFingerprint(frozenUnitSnapshot))
  })

  it('changes when a member time anchor changes', () => {
    const retimed = {
      ...frozenUnitSnapshot,
      members: [
        frozenUnitSnapshot.members[0],
        { ...frozenUnitSnapshot.members[1], timeRangeSeconds: { start: 1, end: 5 } },
      ],
    }
    expect(unitInputFingerprint(retimed)).not.toBe(unitInputFingerprint(frozenUnitSnapshot))
  })

  it('changes when a member keyframe mediaId changes', () => {
    const newKeyframe = {
      ...frozenUnitSnapshot,
      members: [
        {
          ...frozenUnitSnapshot.members[0],
          selectedKeyframe: { slot: 'middle' as const, mediaId: ids.actionSheetMediaId },
        },
        frozenUnitSnapshot.members[1],
      ],
    }
    expect(unitInputFingerprint(newKeyframe)).not.toBe(unitInputFingerprint(frozenUnitSnapshot))
  })
})

describe('buildVideoUnitTaskDescriptor (deterministic unit descriptor)', () => {
  it('returns the unit task type, remake_unit target, unitId, and remake-video-unit dedupe key', () => {
    const descriptor = buildVideoUnitTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'generate-unit-001-v1',
      inputSnapshot: frozenUnitSnapshot,
    })

    expect(descriptor.taskType).toBe(TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE)
    expect(TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE).toBe('remake_video_unit_generate')
    expect(descriptor.targetType).toBe('remake_unit')
    expect(descriptor.targetId).toBe(ids.unitId)
    expect(descriptor.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(descriptor.dedupeKey).toBe(
      `remake-video-unit:${ids.projectId}:generate-unit-001-v1:${descriptor.inputFingerprint}`,
    )
    expect(descriptor.payload).toMatchObject({
      kind: 'video_unit',
      operationKey: 'generate-unit-001-v1',
      inputSnapshot: frozenUnitSnapshot,
      inputFingerprint: descriptor.inputFingerprint,
    })
  })

  it('rejects a snapshot bound to a different project (T-091-04)', () => {
    expect(() =>
      buildVideoUnitTaskDescriptor({
        projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        operationKey: 'generate-unit-001-v1',
        inputSnapshot: frozenUnitSnapshot,
      }),
    ).toThrow('REMAKE_VIDEO_UNIT_PROJECT_MISMATCH')
  })
})

describe('parseVideoUnitTaskPayload (D-22 tamper resistance)', () => {
  const descriptor = buildVideoUnitTaskDescriptor({
    projectId: ids.projectId,
    operationKey: 'generate-unit-001-v1',
    inputSnapshot: frozenUnitSnapshot,
  })

  it('strips runtime keys and re-verifies the fingerprint', () => {
    const parsed = parseVideoUnitTaskPayload({
      ...descriptor.payload,
      flowId: 'runtime-only',
      runId: 'runtime-run',
      meta: { trace: 'x' },
      flowStageIndex: 1,
      flowStageTotal: 2,
      flowStageTitle: 'stage',
    })
    expect(parsed).toEqual(descriptor.payload)
  })

  it('rejects tampered snapshots', () => {
    expect(() =>
      parseVideoUnitTaskPayload({
        ...descriptor.payload,
        inputSnapshot: { ...frozenUnitSnapshot, durationSeconds: 10 },
      }),
    ).toThrow('REMAKE_VIDEO_UNIT_FINGERPRINT_INVALID')
  })
})
