import { ART_STYLES, getArtStylePrompt, isArtStyleValue } from '@/lib/constants'
import { describe, expect, it } from 'vitest'

const REQUIRED_STYLE_VALUES = [
  'american-comic',
  'japanese-anime',
  'chinese-comic',
  'realistic',
  'shaw-brothers',
  'hk-wuxia-90s',
  'anime-80s-handdrawn',
  'wuxia-2000s-cg',
  'chinese-xianxia',
  'japanese-cel',
  'cinematic-anime',
  'cyberpunk-anime',
  'dark-fantasy',
  'chibi-comedy',
  'pixar-3d',
] as const

describe('art style constants', () => {
  it('contains all required legacy and expanded style values', () => {
    const values = ART_STYLES.map((style) => style.value)

    expect(values).toEqual(expect.arrayContaining([...REQUIRED_STYLE_VALUES]))
  })

  it('returns zh and en prompts for all required style values', () => {
    for (const styleValue of REQUIRED_STYLE_VALUES) {
      expect(getArtStylePrompt(styleValue, 'zh')).toBeTruthy()
      expect(getArtStylePrompt(styleValue, 'en')).toBeTruthy()
    }
  })

  it('recognizes required style values and rejects unknown values', () => {
    for (const styleValue of REQUIRED_STYLE_VALUES) {
      expect(isArtStyleValue(styleValue)).toBe(true)
    }

    expect(isArtStyleValue('')).toBe(false)
    expect(isArtStyleValue('anime')).toBe(false)
    expect(isArtStyleValue('western-comic')).toBe(false)
    expect(isArtStyleValue(null)).toBe(false)
  })

  it('keeps american-comic compatible while correcting its semantics away from anime', () => {
    const zh = getArtStylePrompt('american-comic', 'zh')
    const en = getArtStylePrompt('american-comic', 'en')

    expect(zh).toContain('美式漫画')
    expect(zh).not.toContain('日式动漫')
    expect(en.toLowerCase()).toContain('american comic')
    expect(en.toLowerCase()).not.toContain('japanese anime')
  })

  it('upgrades chinese-comic and realistic prompts without changing their values and adds pixar-3d separately', () => {
    expect(getArtStylePrompt('chinese-comic', 'zh')).toContain('高品质国漫')
    expect(getArtStylePrompt('realistic', 'zh')).toContain('电影级写实')
    expect(getArtStylePrompt('pixar-3d', 'zh')).toContain('皮克斯/迪士尼级别3D动画渲染风格')
    expect(getArtStylePrompt('pixar-3d', 'en')).toContain('Pixar / Disney-level 3D animation rendering style')
  })
})
