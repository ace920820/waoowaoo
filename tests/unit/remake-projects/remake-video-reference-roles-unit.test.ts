import { describe, expect, it } from 'vitest'
import {
  VIDEO_REFERENCE_ROLE_ORDER,
  VIDEO_REFERENCE_ROLES,
  type OrderedVideoReference,
} from '@/lib/remake-projects/video/reference-roles'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
} from '@/lib/remake-projects/video/contracts'
import {
  buildRemakeReferencePromptSuffix,
  remakeReferenceRoleLabel,
  remakeReferenceRoleUsage,
} from '@/lib/remake-projects/video/reference-plan'

/** Build a shot_keyframe ref; cast bridges the pre-extension role union (RED). */
const shotKeyframeRef = (ordinal: number, mediaId: string) =>
  ({ role: 'shot_keyframe', ordinal, mediaId }) as unknown as OrderedVideoReference

describe('shot_keyframe role contract (D-06 / D-10)', () => {
  it('adds shot_keyframe to VIDEO_REFERENCE_ROLES', () => {
    expect(VIDEO_REFERENCE_ROLES).toContain('shot_keyframe')
  })

  it('places shot_keyframe between end_keyframe and action_sheet, keeping every other relative order', () => {
    const order = VIDEO_REFERENCE_ROLE_ORDER
    expect(order.start_keyframe).toBeLessThan(order.middle_keyframe)
    expect(order.middle_keyframe).toBeLessThan(order.end_keyframe)
    expect(order.end_keyframe).toBeLessThan(order.shot_keyframe)
    expect(order.shot_keyframe).toBeLessThan(order.action_sheet)
    expect(order.action_sheet).toBeLessThan(order.character_reference)
    expect(order.character_reference).toBeLessThan(order.scene_reference)
    expect(order.scene_reference).toBeLessThan(order.prop_reference)
    expect(order.prop_reference).toBeLessThan(order.character_audio_reference)
  })

  it('accepts N consecutive shot_keyframe references with contiguous ordinals (equal role allowed)', () => {
    const refs: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      shotKeyframeRef(2, 'media-2'),
      shotKeyframeRef(3, 'media-3'),
      { role: 'action_sheet', ordinal: 4, mediaId: 'media-as' },
    ]
    expect(() => assertVideoReferenceOrder(refs)).not.toThrow()
  })

  it('still rejects strictly-decreasing role order and non-contiguous ordinals', () => {
    const decreasing: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      { role: 'end_keyframe', ordinal: 2, mediaId: 'media-end' },
    ]
    expect(() => assertVideoReferenceOrder(decreasing)).toThrow('REMAKE_VIDEO_REFERENCE_ORDER_INVALID')

    const nonContiguous: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      shotKeyframeRef(3, 'media-3'),
    ]
    expect(() => assertVideoReferenceOrder(nonContiguous)).toThrow('REMAKE_VIDEO_REFERENCE_ORDINAL_INVALID')
  })

  it('accepts a plan whose only keyframe role is shot_keyframe', () => {
    const refs: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      { role: 'action_sheet', ordinal: 2, mediaId: 'media-as' },
    ]
    expect(() => assertVideoReferencesHaveKeyframe(refs)).not.toThrow()
  })
})

describe('shot_keyframe label / usage / prompt suffix', () => {
  it('renders a per-shot visual anchor label and segment-scoped usage', () => {
    expect(remakeReferenceRoleLabel('shot_keyframe')).toContain('主画面参考关键帧')
    expect(remakeReferenceRoleLabel('shot_keyframe')).toContain('镜头锚点')
    const usage = remakeReferenceRoleUsage('shot_keyframe')
    expect(usage).toContain('该镜头时间段')
    expect(usage).toContain('画面构成、美术风格、场景光照、人物形象')
    expect(usage).toContain('不得被其他参考改变')
  })

  it('groups shot_keyframe refs into 视觉锚点 with @Image tokens in ordinal order', () => {
    const refs: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      shotKeyframeRef(2, 'media-2'),
      { role: 'action_sheet', ordinal: 3, mediaId: 'media-as' },
    ]
    const suffix = buildRemakeReferencePromptSuffix(refs)

    expect(suffix).toContain('【视觉锚点 — 决定画面、画风、形象与构图】')
    expect(suffix.indexOf('@Image1')).toBeLessThan(suffix.indexOf('@Image2'))
    expect(suffix).toContain('@Image2（主画面参考关键帧 · 镜头锚点）')
  })

  it('renders the multi-keyframe Start→Middle→End parenthetical only for classic start/middle/end keyframes', () => {
    const classic: OrderedVideoReference[] = [
      { role: 'start_keyframe', ordinal: 1, mediaId: 'media-start' },
      { role: 'end_keyframe', ordinal: 2, mediaId: 'media-end' },
    ]
    expect(buildRemakeReferencePromptSuffix(classic)).toContain('（多张时按 Start→Middle→End 推进）')

    const unit: OrderedVideoReference[] = [
      shotKeyframeRef(1, 'media-1'),
      shotKeyframeRef(2, 'media-2'),
    ]
    expect(buildRemakeReferencePromptSuffix(unit)).not.toContain('Start→Middle→End')
  })
})
