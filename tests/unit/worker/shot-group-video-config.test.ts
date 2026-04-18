import { describe, expect, it } from 'vitest'
import { buildShotGroupVideoPrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import {
  deriveShotGroupModeFlags,
  normalizeShotGroupVideoMode,
  resolveShotGroupModeForModel,
  resolveShotGroupReferenceMode,
  sanitizeShotGroupGenerationOptions,
  supportsShotGroupMultiReferenceModes,
} from '@/lib/shot-group/video-config'

function buildShotGroup() {
  return {
    id: 'group-1',
    episodeId: 'episode-1',
    title: '追逐段落',
    templateKey: 'grid-4',
    groupPrompt: '旧的组提示词',
    videoPrompt: '新的视频提示词',
    referenceImageUrl: 'cos/ref.png',
    compositeImageUrl: 'cos/composite.png',
    generateAudio: true,
    bgmEnabled: true,
    includeDialogue: false,
    dialogueLanguage: 'zh' as const,
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: false,
    items: [
      { id: 'item-1', shotGroupId: 'group-1', itemIndex: 0, title: '建立', prompt: '建立空间', imageUrl: 'cos/a.png' },
      { id: 'item-2', shotGroupId: 'group-1', itemIndex: 1, title: '推进', prompt: '推进动作', imageUrl: 'cos/b.png' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('shot-group-video-config', () => {
  it('defaults to omni reference mode and derives exclusive flags', () => {
    expect(normalizeShotGroupVideoMode({})).toBe('omni-reference')
    expect(normalizeShotGroupVideoMode({
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
    })).toBe('smart-multi-frame')
    expect(deriveShotGroupModeFlags('omni-reference')).toEqual({
      omniReferenceEnabled: true,
      smartMultiFrameEnabled: false,
    })
  })

  it('sanitizes generation options to the auditable task payload subset', () => {
    expect(sanitizeShotGroupGenerationOptions({
      duration: 5,
      resolution: '1080p',
      generateAudio: true,
      aspectRatio: '16:9',
      generationMode: 'normal',
    })).toEqual({
      duration: 5,
      resolution: '1080p',
      generateAudio: true,
    })
  })

  it('normalizes non-Ark models to composite storyboard semantics', () => {
    expect(supportsShotGroupMultiReferenceModes('ark::seedance')).toBe(true)
    expect(supportsShotGroupMultiReferenceModes('fal::kling-v1')).toBe(false)
    expect(resolveShotGroupModeForModel({
      mode: 'smart-multi-frame',
      modelKey: 'fal::kling-v1',
    })).toBe('omni-reference')
    expect(resolveShotGroupReferenceMode({
      mode: 'smart-multi-frame',
      modelKey: 'fal::kling-v1',
    })).toBe('composite_image_mvp')
  })

  it('builds prompt around composite storyboard mode without reference-image or music language', () => {
    const prompt = buildShotGroupVideoPrompt({
      group: {
        ...buildShotGroup(),
        videoMode: 'omni-reference',
      },
      template: getShotGroupTemplateSpec('grid-4'),
      locale: 'zh',
    })

    expect(prompt).toContain('提示词：新的视频提示词')
    expect(prompt).toContain('必选 omni reference')
    expect(prompt).toContain('不要背景音乐')
    expect(prompt).not.toContain('组提示词')
    expect(prompt).not.toContain('辅助参考图')
    expect(prompt).not.toContain('背景音乐。')
  })
})
