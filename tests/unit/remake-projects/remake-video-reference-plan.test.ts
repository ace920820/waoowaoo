import { describe, expect, it } from 'vitest'
import {
  buildRemakeReferencePlan,
  buildRemakeReferencePromptSuffix,
  remakeReferenceRoleLabel,
  remakeReferenceRoleUsage,
  REMAKE_VIDEO_AUDIO_CAP,
  REMAKE_VIDEO_IMAGE_CAP,
  type RemakeReferenceCandidate,
} from '@/lib/remake-projects/video/reference-plan'

const keyframe = (role: 'start_keyframe' | 'middle_keyframe' | 'end_keyframe', ordinalMedia: string): RemakeReferenceCandidate => ({
  role,
  mediaType: 'image',
  sourceType: role,
  label: role,
  usage: 'usage',
  mediaId: ordinalMedia,
})

describe('buildRemakeReferencePlan', () => {
  it('orders keyframes -> action sheet -> characters -> scene -> props -> audio with contiguous ordinals', () => {
    const candidates: RemakeReferenceCandidate[] = [
      { role: 'character_audio_reference', mediaType: 'audio', sourceType: 'character_voice_reference', label: '角色 萨姆 声音', usage: 'audio usage', mediaUrl: 'voice/sam.mp3' },
      { role: 'prop_reference', mediaType: 'image', sourceType: 'prop_reference', label: '物品 公文包', usage: 'prop usage', mediaUrl: 'images/prop.png' },
      keyframe('end_keyframe', 'media-end'),
      { role: 'action_sheet', mediaType: 'image', sourceType: 'action_sheet', label: '动作表', usage: 'action usage', mediaId: 'media-as' },
      { role: 'character_reference', mediaType: 'image', sourceType: 'character_reference', label: '角色 萨姆', usage: 'char usage', mediaUrl: 'images/sam.png' },
      keyframe('start_keyframe', 'media-start'),
      { role: 'scene_reference', mediaType: 'image', sourceType: 'location_reference', label: '场景 机舱', usage: 'scene usage', mediaUrl: 'images/scene.png' },
    ]

    const plan = buildRemakeReferencePlan(candidates)

    expect(plan.map((item) => item.role)).toEqual([
      'start_keyframe',
      'end_keyframe',
      'action_sheet',
      'character_reference',
      'scene_reference',
      'prop_reference',
      'character_audio_reference',
    ])
    expect(plan.map((item) => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('caps images at 9 and audio at 3, dropping lower-priority overflow', () => {
    const characters = Array.from({ length: 6 }, (_, index) => ({
      role: 'character_reference' as const,
      mediaType: 'image' as const,
      sourceType: 'character_reference',
      label: `角色 ${index}`,
      usage: 'usage',
      mediaUrl: `images/c${index}.png`,
    }))
    const props = Array.from({ length: 6 }, (_, index) => ({
      role: 'prop_reference' as const,
      mediaType: 'image' as const,
      sourceType: 'prop_reference',
      label: `物品 ${index}`,
      usage: 'usage',
      mediaUrl: `images/p${index}.png`,
    }))
    const voices = Array.from({ length: 5 }, (_, index) => ({
      role: 'character_audio_reference' as const,
      mediaType: 'audio' as const,
      sourceType: 'character_voice_reference',
      label: `声音 ${index}`,
      usage: 'usage',
      mediaUrl: `voice/v${index}.mp3`,
    }))

    const plan = buildRemakeReferencePlan([
      keyframe('start_keyframe', 'media-start'),
      keyframe('middle_keyframe', 'media-middle'),
      keyframe('end_keyframe', 'media-end'),
      { role: 'action_sheet', mediaType: 'image', sourceType: 'action_sheet', label: '动作表', usage: 'usage', mediaId: 'media-as' },
      { role: 'scene_reference', mediaType: 'image', sourceType: 'location_reference', label: '场景', usage: 'usage', mediaUrl: 'images/scene.png' },
      ...characters,
      ...props,
      ...voices,
    ])

    const images = plan.filter((item) => item.mediaType === 'image')
    const audio = plan.filter((item) => item.mediaType === 'audio')

    expect(images.length).toBe(REMAKE_VIDEO_IMAGE_CAP) // 9
    expect(audio.length).toBe(REMAKE_VIDEO_AUDIO_CAP) // 3
    // 4 anchor/scene images + 5 characters = 9; props all dropped
    expect(images.filter((item) => item.role === 'prop_reference').length).toBe(0)
    expect(images.filter((item) => item.role === 'character_reference').length).toBe(5)
    // first 3 voices kept
    expect(audio.map((item) => item.label)).toEqual(['声音 0', '声音 1', '声音 2'])
    // ordinals remain contiguous across the kept items
    expect(plan.map((item) => item.ordinal)).toEqual(plan.map((_, index) => index + 1))
  })
})

describe('unified reference terminology', () => {
  it('labels every keyframe role as 主画面参考关键帧 with a slot suffix', () => {
    expect(remakeReferenceRoleLabel('start_keyframe')).toBe('主画面参考关键帧 · Start 起始帧')
    expect(remakeReferenceRoleLabel('middle_keyframe')).toBe('主画面参考关键帧 · Middle 中间帧')
    expect(remakeReferenceRoleLabel('end_keyframe')).toBe('主画面参考关键帧 · End 结尾帧')
  })

  it('labels the action sheet consistently as 动作参考表', () => {
    expect(remakeReferenceRoleLabel('action_sheet')).toBe('动作参考表')
  })

  it('uses anchor semantics for keyframes and beat-only semantics for the action sheet', () => {
    for (const role of ['start_keyframe', 'middle_keyframe', 'end_keyframe'] as const) {
      const usage = remakeReferenceRoleUsage(role)
      expect(usage).toContain('这是整段视频的主画面参考关键帧')
      expect(usage).toContain('画面构成、美术风格、场景光照、人物形象')
      expect(usage).toContain('整段视频的视觉必须与之一致')
      expect(usage).toContain('不得被其他参考改变')
    }
    const actionUsage = remakeReferenceRoleUsage('action_sheet')
    expect(actionUsage).toContain('开始→中间→结束的三段式二维分镜参考')
    expect(actionUsage).toContain('仅用于传达动作发展顺序、事件内容与镜头变化')
    expect(actionUsage).toContain('不要复制它的画面、画风或人物形象')
    expect(actionUsage).toContain('视觉一律以主画面参考关键帧为准')
  })
})

describe('buildRemakeReferencePromptSuffix', () => {
  it('groups keyframes under 视觉锚点 and the action sheet under 动作节拍 with a conflict rule', () => {
    const refs = [
      { role: 'middle_keyframe' as const, ordinal: 1, mediaType: 'image' as const, sourceType: 'middle_keyframe', mediaId: 'm1' },
      { role: 'action_sheet' as const, ordinal: 2, mediaType: 'image' as const, sourceType: 'action_sheet', mediaId: 'm2' },
      { role: 'character_reference' as const, ordinal: 3, mediaType: 'image' as const, sourceType: 'character_reference', label: '角色 萨姆', usage: '必须保持角色身份一致', mediaUrl: 'images/sam.png' },
      { role: 'character_audio_reference' as const, ordinal: 4, mediaType: 'audio' as const, sourceType: 'character_voice_reference', label: '角色 萨姆 声音', usage: '参考角色音色', mediaUrl: 'voice/sam.mp3' },
    ]

    const suffix = buildRemakeReferencePromptSuffix(refs)

    expect(suffix).toContain('参考素材使用说明：')
    expect(suffix).toContain('【视觉锚点 — 决定画面、画风、形象与构图】')
    expect(suffix).toContain('@Image1（主画面参考关键帧 · Middle 中间帧）')
    expect(suffix).toContain('【动作节拍 — 只决定画面如何变化、发生什么、如何拍】')
    expect(suffix).toContain('@Image2（动作参考表）')
    expect(suffix).toContain('【辅助参考 — 保持一致性】')
    expect(suffix).toContain('@Image3（角色 萨姆）：必须保持角色身份一致。')
    expect(suffix).toContain('【声音参考 — 保持音色一致】')
    expect(suffix).toContain('@Audio1（角色 萨姆 声音）：参考角色音色。')
    expect(suffix).toContain('【一致性规则】')
    expect(suffix).toContain('画面 / 画风 / 形象 / 构图：以主画面参考关键帧为准；')
    expect(suffix).toContain('动作 / 事件 / 镜头节拍：以动作参考表为准；')
    expect(suffix).toContain('两者冲突时，画面细节服从主画面参考关键帧，动作节奏服从动作参考表。')
  })

  it('drops the action-sheet rule when no action sheet is included', () => {
    const refs = [
      { role: 'start_keyframe' as const, ordinal: 1, mediaType: 'image' as const, sourceType: 'start_keyframe', mediaId: 'm1' },
      { role: 'end_keyframe' as const, ordinal: 2, mediaType: 'image' as const, sourceType: 'end_keyframe', mediaId: 'm2' },
    ]

    const suffix = buildRemakeReferencePromptSuffix(refs)

    expect(suffix).toContain('【视觉锚点 — 决定画面、画风、形象与构图】')
    expect(suffix).not.toContain('【动作节拍')
    expect(suffix).not.toContain('动作 / 事件 / 镜头节拍：以动作参考表为准；')
    expect(suffix).toContain('画面 / 画风 / 形象 / 构图：以主画面参考关键帧为准')
  })

  it('mentions Start→Middle→End progression when multiple keyframes are uploaded', () => {
    const refs = [
      { role: 'start_keyframe' as const, ordinal: 1, mediaType: 'image' as const, sourceType: 'start_keyframe', mediaId: 'm1' },
      { role: 'middle_keyframe' as const, ordinal: 2, mediaType: 'image' as const, sourceType: 'middle_keyframe', mediaId: 'm2' },
      { role: 'end_keyframe' as const, ordinal: 3, mediaType: 'image' as const, sourceType: 'end_keyframe', mediaId: 'm3' },
    ]

    const suffix = buildRemakeReferencePromptSuffix(refs)

    expect(suffix).toContain('@Image1（主画面参考关键帧 · Start 起始帧）')
    expect(suffix).toContain('@Image2（主画面参考关键帧 · Middle 中间帧）')
    expect(suffix).toContain('@Image3（主画面参考关键帧 · End 结尾帧）')
    expect(suffix).toContain('（多张时按 Start→Middle→End 推进）')
  })
})
