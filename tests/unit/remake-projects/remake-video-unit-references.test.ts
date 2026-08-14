import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildUnitReferencePlan,
  dedupeUnitAssetCandidates,
  collectUnitMemberKeyframeCandidates,
} from '@/lib/remake-projects/unit/references'
import type { RemakeReferenceCandidate, RemakeReferencePlanItem } from '@/lib/remake-projects/video/reference-plan'
import { assertVideoReferenceOrder } from '@/lib/remake-projects/video/contracts'
import type { OrderedVideoReference } from '@/lib/remake-projects/video/contracts'

/**
 * Unit reference-merge layer (D-06 / D-08 / D-10):
 *  - collectUnitMemberKeyframeCandidates: exactly one adopted keyframe per
 *    member (default middle, falling back to the only adopted slot), resolved
 *    to a stable media reference, in ordinal order; per-member error when a
 *    member has no adopted keyframe.
 *  - dedupeUnitAssetCandidates: cross-member asset-id dedup for characters /
 *    scenes / props / voices.
 *  - buildUnitReferencePlan: shot_keyframe (ordinal) -> action_sheet ->
 *    characters -> scene -> props -> audio, truncated by the single-sourced
 *    buildRemakeReferencePlan 9-image / 3-audio caps (keyframe > action sheet >
 *    characters > scene > props > voice priority).
 */

/** Map a plan item to the strict ordered-reference shape the service freezes
 * (drops null media fields the same way `buildVideoGenerationSubmission` does). */
function toOrderedRefs(plan: RemakeReferencePlanItem[]): OrderedVideoReference[] {
  return plan.map((item) => ({
    role: item.role,
    ordinal: item.ordinal,
    mediaType: item.mediaType,
    sourceType: item.sourceType,
    label: item.label,
    usage: item.usage,
    ...(item.assetId ? { assetId: item.assetId } : {}),
    ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
  }))
}

const prismaMock = vi.hoisted(() => {
  const findUnique = vi.fn()
  return {
    remakeKeyframeTrack: { findUnique },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const mediaServiceMock = vi.hoisted(() => ({
  resolveMediaRef: vi.fn(),
}))

vi.mock('@/lib/media/service', () => mediaServiceMock)

beforeEach(() => {
  vi.clearAllMocks()
  // rev-a: middle adopted. rev-b: middle missing, end adopted. rev-c: none.
  const tracks = new Map<string, { mediaId: string }>([
    ['rev-a:middle', { mediaId: 'media-kf-a' }],
    ['rev-b:end', { mediaId: 'media-kf-b-end' }],
  ])
  prismaMock.remakeKeyframeTrack.findUnique.mockImplementation(
    async (args: { where: { shotRevisionId_slot: { shotRevisionId: string; slot: string } } }) => {
      const { shotRevisionId, slot } = args.where.shotRevisionId_slot
      const row = tracks.get(`${shotRevisionId}:${slot}`)
      return row ? { adoptedCandidate: { outputVersion: { mediaId: row.mediaId } } } : null
    },
  )
  mediaServiceMock.resolveMediaRef.mockImplementation(async (mediaId: unknown) => ({
    id: `resolved-${mediaId}`,
  }))
})

describe('collectUnitMemberKeyframeCandidates (D-06 one keyframe per member)', () => {
  it('returns exactly one adopted keyframe per member in ordinal order with resolved stable media', async () => {
    const result = await collectUnitMemberKeyframeCandidates({
      members: [
        { shotRevisionId: 'rev-a', ordinal: 1 },
        { shotRevisionId: 'rev-b', ordinal: 2 },
      ],
    })

    expect(result).toHaveLength(2)
    // Member 1: default middle slot adopted -> resolved stable media.
    expect(result[0]!.ordinal).toBe(1)
    expect(result[0]!.role).toBe('shot_keyframe')
    expect(result[0]!.mediaType).toBe('image')
    expect(result[0]!.mediaId).toBe('resolved-media-kf-a')
    expect(result[0]!.mediaUrl).toBe('media-kf-a')
    expect(result[0]!.label).toBe('镜头 1 关键帧')
    expect(result[0]!.usage.length).toBeGreaterThan(0)
    // Member 2: middle missing -> falls back to the only adopted slot (end).
    expect(result[1]!.ordinal).toBe(2)
    expect(result[1]!.mediaId).toBe('resolved-media-kf-b-end')
    expect(result[1]!.mediaUrl).toBe('media-kf-b-end')
    expect(result[1]!.label).toBe('镜头 2 关键帧')
    // Ordinal order preserved.
    expect(result.map((c) => c.ordinal)).toEqual([1, 2])
  })

  it('throws a per-member error when a member has no adopted keyframe', async () => {
    await expect(
      collectUnitMemberKeyframeCandidates({
        members: [
          { shotRevisionId: 'rev-a', ordinal: 1 },
          { shotRevisionId: 'rev-c', ordinal: 2 },
        ],
      }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_MEMBER_KEYFRAME_MISSING:2')
  })
})

describe('dedupeUnitAssetCandidates (D-08 asset-id dedup)', () => {
  const assetCandidate = (role: string, assetId: string, mediaId: string): RemakeReferenceCandidate => ({
    role: role as RemakeReferenceCandidate['role'],
    mediaType: role === 'character_audio_reference' ? 'audio' : 'image',
    sourceType: role,
    label: `${role}:${assetId}`,
    usage: 'usage',
    assetId,
    mediaId,
  })

  it('collapses the same asset id across members to one candidate per role family', () => {
    const result = dedupeUnitAssetCandidates([
      // Same character in two members: image + voice each appear twice.
      assetCandidate('character_reference', 'char-1', 'media-char-1-a'),
      assetCandidate('character_audio_reference', 'char-1', 'media-voice-1-a'),
      assetCandidate('character_reference', 'char-1', 'media-char-1-b'),
      assetCandidate('character_audio_reference', 'char-1', 'media-voice-1-b'),
      // Same scene in two members.
      assetCandidate('scene_reference', 'scene-1', 'media-scene-1-a'),
      assetCandidate('scene_reference', 'scene-1', 'media-scene-1-b'),
      // Same prop in two members.
      assetCandidate('prop_reference', 'prop-1', 'media-prop-1-a'),
      assetCandidate('prop_reference', 'prop-1', 'media-prop-1-b'),
      // Distinct character stays.
      assetCandidate('character_reference', 'char-2', 'media-char-2'),
    ])

    const byRoleAndAsset = (role: string, assetId: string) =>
      result.filter((c) => c.role === role && c.assetId === assetId)
    expect(byRoleAndAsset('character_reference', 'char-1')).toHaveLength(1)
    expect(byRoleAndAsset('character_audio_reference', 'char-1')).toHaveLength(1)
    expect(byRoleAndAsset('scene_reference', 'scene-1')).toHaveLength(1)
    expect(byRoleAndAsset('prop_reference', 'prop-1')).toHaveLength(1)
    expect(byRoleAndAsset('character_reference', 'char-2')).toHaveLength(1)
    // First occurrence is kept (member 1's media refs).
    expect(result.find((c) => c.role === 'character_reference' && c.assetId === 'char-1')?.mediaId)
      .toBe('media-char-1-a')
    // Total: char-1 image + char-1 voice + scene + prop + char-2 image.
    expect(result).toHaveLength(5)
  })
})

describe('buildUnitReferencePlan (D-06/D-08 order + caps)', () => {
  const memberKeyframes = [
    { ordinal: 1, mediaId: 'media-kf-1' },
    { ordinal: 2, mediaId: 'media-kf-2' },
    { ordinal: 3, mediaId: 'media-kf-3' },
  ]
  const actionSheetMediaRef = { mediaId: 'media-sheet' }
  const assetCandidates: RemakeReferenceCandidate[] = [
    {
      role: 'character_reference', mediaType: 'image', sourceType: 'character_reference',
      label: '角色 A', usage: 'u', assetId: 'char-a', mediaId: 'media-char-a',
    },
    {
      role: 'character_reference', mediaType: 'image', sourceType: 'character_reference',
      label: '角色 B', usage: 'u', assetId: 'char-b', mediaId: 'media-char-b',
    },
    {
      role: 'scene_reference', mediaType: 'image', sourceType: 'location_reference',
      label: '场景 S', usage: 'u', assetId: 'scene-s', mediaId: 'media-scene-s',
    },
    {
      role: 'prop_reference', mediaType: 'image', sourceType: 'prop_reference',
      label: '物品 P', usage: 'u', assetId: 'prop-p', mediaId: 'media-prop-p',
    },
    {
      role: 'character_audio_reference', mediaType: 'audio', sourceType: 'character_voice_reference',
      label: '角色 A 声音', usage: 'u', assetId: 'char-a', mediaId: 'media-voice-a',
    },
  ]

  it('emits shot_keyframe refs in ordinal order, then action_sheet, then characters/scene/props, then audio', () => {
    const plan = buildUnitReferencePlan({
      memberKeyframes,
      actionSheetMediaRef,
      assetCandidates,
    })

    expect(plan.map((item) => item.role)).toEqual([
      'shot_keyframe', 'shot_keyframe', 'shot_keyframe',
      'action_sheet',
      'character_reference', 'character_reference',
      'scene_reference', 'prop_reference',
      'character_audio_reference',
    ])
    // Member keyframes keep ordinal order with per-member labels.
    expect(plan.filter((item) => item.role === 'shot_keyframe').map((item) => item.label))
      .toEqual(['镜头 1 关键帧', '镜头 2 关键帧', '镜头 3 关键帧'])
    // Contiguous ordinals from 1 -> the plan satisfies the reference order contract.
    expect(plan.map((item) => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(() => assertVideoReferenceOrder(toOrderedRefs(plan))).not.toThrow()
  })

  it('truncates past the 9-image cap by priority and never drops the member keyframes', () => {
    // 5 member keyframes + action sheet + 2 chars + 1 scene + 1 prop = 10 images > 9.
    const fiveKeyframes = [
      { ordinal: 1, mediaId: 'media-kf-1' },
      { ordinal: 2, mediaId: 'media-kf-2' },
      { ordinal: 3, mediaId: 'media-kf-3' },
      { ordinal: 4, mediaId: 'media-kf-4' },
      { ordinal: 5, mediaId: 'media-kf-5' },
    ]
    const plan = buildUnitReferencePlan({
      memberKeyframes: fiveKeyframes,
      actionSheetMediaRef,
      assetCandidates,
    })

    const shotKeyframes = plan.filter((item) => item.role === 'shot_keyframe')
    expect(shotKeyframes).toHaveLength(5) // never dropped
    expect(plan.some((item) => item.role === 'action_sheet')).toBe(true)
    // Lowest-priority image (the prop) drops first; scene still fits at image #9.
    expect(plan.some((item) => item.role === 'prop_reference')).toBe(false)
    expect(plan.some((item) => item.role === 'scene_reference')).toBe(true)
    expect(plan.filter((item) => item.role === 'character_reference')).toHaveLength(2)
    // 5 kf + sheet + 2 chars + scene = 9 images (cap), audio still present (separate cap).
    expect(plan.filter((item) => item.mediaType === 'image')).toHaveLength(9)
    expect(plan.filter((item) => item.mediaType === 'audio')).toHaveLength(1)
    // Contiguity + order contract still hold after truncation.
    expect(plan.map((item) => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(() => assertVideoReferenceOrder(toOrderedRefs(plan))).not.toThrow()
  })
})
