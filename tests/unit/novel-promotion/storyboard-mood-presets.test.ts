import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STORYBOARD_MOOD_PRESETS,
  buildStoryboardMoodContext,
  resolveStoryboardMoodHierarchy,
  buildStoryboardMoodStyleText,
  normalizeStoryboardMoodPresets,
} from '@/lib/storyboard-mood-presets'

describe('storyboard mood preset helpers', () => {
  it('falls back to default presets when project config is empty or invalid', () => {
    expect(normalizeStoryboardMoodPresets(null)).toEqual(DEFAULT_STORYBOARD_MOOD_PRESETS)
    expect(normalizeStoryboardMoodPresets('not-json')).toEqual(DEFAULT_STORYBOARD_MOOD_PRESETS)
    expect(normalizeStoryboardMoodPresets(JSON.stringify([{ nope: true }]))).toEqual(DEFAULT_STORYBOARD_MOOD_PRESETS)
    expect(DEFAULT_STORYBOARD_MOOD_PRESETS).toEqual([
      {
        id: 'nostalgic-sweet-melancholy',
        label: '怀旧甜美忧郁氛围',
        prompt: '光影柔和，色调素雅，营造出怀旧的 80–90 年代动漫氛围，在永恒浪漫的画面中平衡甜美与淡淡的忧郁。',
      },
      {
        id: 'tranquil-ethereal-fantasy',
        label: '宁静空灵奇幻氛围',
        prompt: '光影温润柔和，烘托出宁静空灵的氛围，令人联想到 80–90 年代的经典奇幻动漫。',
      },
      {
        id: 'cold-elegant-dark',
        label: '冷峻优雅暗黑氛围',
        prompt: '服饰质感利落高级，呈现出复古暗黑美学格调——经典、大胆、从容又极具气场。',
      },
      {
        id: 'minimal-mysterious-cold',
        label: '极简神秘冷峻氛围',
        prompt: '光影突出利落轮廓，营造出 90 年代动漫标志性的冷峻内敛氛围，简约、富有张力且充满沉静力量。',
      },
      {
        id: 'devout-solemn-melancholy',
        label: '虔诚肃穆忧郁氛围',
        prompt: '画面静谧而略带忧伤，体现出 90 年代动漫式的内敛灵性与情感克制，定格虔诚、内心挣扎与空灵之美。',
      },
      {
        id: 'gothic-dangerous-allure',
        label: '哥特魅惑危险氛围',
        prompt: '整体融合诱惑与力量，尽显 80 年代奇幻动漫式的摄人之美，兼具天使般的圣洁与危险气息。',
      },
    ])
  })

  it('normalizes valid presets and generates fallback ids when needed', () => {
    expect(normalizeStoryboardMoodPresets([
      { label: '暴雨压城', prompt: '低气压、潮湿、风暴临近' },
      { id: 'calm', label: '平静前夜', prompt: '克制安静，像暴风雨前的短暂停顿' },
    ])).toEqual([
      { id: '暴雨压城', label: '暴雨压城', prompt: '低气压、潮湿、风暴临近' },
      { id: 'calm', label: '平静前夜', prompt: '克制安静，像暴风雨前的短暂停顿' },
    ])
  })

  it('builds mood context and appends a dedicated style requirement summary', () => {
    const presets = [
      { id: 'storm', label: '暴风雨前', prompt: '低气压、潮湿、压迫、风雨欲来' },
    ]

    const mood = buildStoryboardMoodContext({
      projectPresets: presets,
      selectedPresetId: 'storm',
      customMood: '人物之间有微妙敌意',
    })

    expect(mood.summary).toContain('暴风雨前')
    expect(mood.summary).toContain('人物之间有微妙敌意')

    const styleText = buildStoryboardMoodStyleText('90s赛璐璐手绘风格', {
      projectPresets: presets,
      selectedPresetId: 'storm',
      customMood: '人物之间有微妙敌意',
    }, 'zh')

    expect(styleText).toContain('90s赛璐璐手绘风格')
    expect(styleText).toContain('分镜氛围要求')
    expect(styleText).toContain('人物之间有微妙敌意')
  })

  it('resolves effective mood by panel > clip > episode > project priority', () => {
    const presets = [
      { id: 'project', label: '项目默认', prompt: '整体克制安静' },
      { id: 'episode', label: '剧集默认', prompt: '关系开始失衡' },
      { id: 'clip', label: '分镜组应用', prompt: '雨前低压，空气潮湿' },
      { id: 'panel', label: '单格覆盖', prompt: '人物情绪逼近失控' },
    ]

    expect(resolveStoryboardMoodHierarchy({
      projectPresets: presets,
      projectDefault: { presetId: 'project' },
      episodeDefault: { presetId: 'episode' },
      clipApplied: { presetId: 'clip' },
      panelOverride: { presetId: 'panel' },
    })).toMatchObject({
      source: 'panel_override',
      preset: { id: 'panel' },
    })

    expect(resolveStoryboardMoodHierarchy({
      projectPresets: presets,
      projectDefault: { presetId: 'project' },
      episodeDefault: { presetId: 'episode' },
      clipApplied: { presetId: 'clip' },
      panelOverride: null,
    })).toMatchObject({
      source: 'clip_applied',
      preset: { id: 'clip' },
    })

    expect(resolveStoryboardMoodHierarchy({
      projectPresets: presets,
      projectDefault: { presetId: 'project' },
      episodeDefault: { presetId: 'episode' },
      clipApplied: null,
      panelOverride: null,
    })).toMatchObject({
      source: 'episode_default',
      preset: { id: 'episode' },
    })

    expect(resolveStoryboardMoodHierarchy({
      projectPresets: presets,
      projectDefault: { presetId: 'project' },
      episodeDefault: null,
      clipApplied: null,
      panelOverride: null,
    })).toMatchObject({
      source: 'project_default',
      preset: { id: 'project' },
    })
  })

  it('uses clip custom mood when no clip preset is selected', () => {
    const mood = resolveStoryboardMoodHierarchy({
      projectPresets: [],
      projectDefault: { presetId: 'missing' },
      clipApplied: { customMood: '阴云压城，呼吸发闷' },
      panelOverride: null,
    })

    expect(mood.source).toBe('clip_applied')
    expect(mood.customMood).toBe('阴云压城，呼吸发闷')
    expect(mood.summary).toContain('阴云压城')
  })

  it('keeps a lower preset when a higher layer only adds custom mood', () => {
    const presets = [
      { id: 'episode', label: '剧集默认', prompt: '关系开始失衡，空气紧绷' },
    ]

    const mood = resolveStoryboardMoodHierarchy({
      projectPresets: presets,
      episodeDefault: { presetId: 'episode' },
      clipApplied: { customMood: '人物之间有微妙敌意' },
      panelOverride: null,
    })

    expect(mood.source).toBe('clip_applied')
    expect(mood.preset).toMatchObject({ id: 'episode' })
    expect(mood.customMood).toBe('人物之间有微妙敌意')
    expect(mood.summary).toContain('剧集默认')
    expect(mood.summary).toContain('人物之间有微妙敌意')

    const styleText = buildStoryboardMoodStyleText('90s赛璐璐手绘风格', {
      projectPresets: presets,
      episodeDefault: { presetId: 'episode' },
      clipApplied: { customMood: '人物之间有微妙敌意' },
      panelOverride: null,
    }, 'zh')

    expect(styleText).toContain('剧集默认')
    expect(styleText).toContain('人物之间有微妙敌意')
  })
})
