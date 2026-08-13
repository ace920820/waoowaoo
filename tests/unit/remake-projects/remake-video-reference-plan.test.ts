import { describe, expect, it } from 'vitest'
import {
  buildRemakeReferencePlan,
  buildRemakeReferencePromptSuffix,
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

describe('buildRemakeReferencePromptSuffix', () => {
  it('emits @Image / @Audio tokens in exact content[] order with usage text', () => {
    const refs = [
      { role: 'start_keyframe' as const, ordinal: 1, mediaType: 'image' as const, sourceType: 'start_keyframe', label: 'Start 起始帧', usage: '参考镜头起点构图', mediaId: 'm1' },
      { role: 'character_reference' as const, ordinal: 2, mediaType: 'image' as const, sourceType: 'character_reference', label: '角色 萨姆', usage: '必须保持角色身份一致', mediaUrl: 'images/sam.png' },
      { role: 'character_audio_reference' as const, ordinal: 3, mediaType: 'audio' as const, sourceType: 'character_voice_reference', label: '角色 萨姆 声音', usage: '参考角色音色', mediaUrl: 'voice/sam.mp3' },
    ]

    const suffix = buildRemakeReferencePromptSuffix(refs)

    expect(suffix).toContain('参考素材使用说明：')
    expect(suffix).toContain('@Image1（Start 起始帧）：参考镜头起点构图。')
    expect(suffix).toContain('@Image2（角色 萨姆）：必须保持角色身份一致。')
    expect(suffix).toContain('@Audio1（角色 萨姆 声音）：参考角色音色。')
    expect(suffix).toContain('请严格按上述 @Image / @Audio 引用理解素材用途')
  })
})
