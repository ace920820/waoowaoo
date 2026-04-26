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
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '旧城巷口',
        narrativePrompt: '旧的组提示词',
        embeddedDialogue: '站住。',
        dialogueOverrideText: null,
        shotRhythmGuidance: '先追逐再对峙',
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        videoPrompt: null,
        cinematicPlan: {
          videoPrompt: '电影化视频提示词：追逐压迫升级，最后停在近景对峙。',
          emotionalIntent: '让观众感到追逐者掌控局面',
          visualStrategy: {
            shotSize: '全景到近景',
            cameraMovement: '手持跟拍转稳定前推',
            blocking: '追逐者始终占据画面中心线',
          },
          shots: [{
            title: '巷口追逐',
            duration: '3s',
            shotSize: '全景',
            angle: '低角度',
            cameraMovement: '手持跟拍',
            blocking: '追逐者压迫被追者向墙边移动',
            dialogue: '站住。',
            prompt: '低角度手持跟拍，旧城巷口追逐者占据中心。',
          }],
        },
      },
    }),
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

    expect(prompt).toContain('提示词：电影化视频提示词：追逐压迫升级，最后停在近景对峙。')
    expect(prompt).toContain('必选 omni reference')
    expect(prompt).toContain('不要背景音乐')
    expect(prompt).toContain('电影情绪意图：让观众感到追逐者掌控局面。')
    expect(prompt).toContain('视觉策略：shotSize: 全景到近景')
    expect(prompt).toContain('最长约 15 秒的连续镜头节拍序列')
    expect(prompt).toContain('镜头语言纪律：参考项目《data/镜头语言.md》的方法论')
    expect(prompt).toContain('保持空间地理、视线连续和 180° 规则')
    expect(prompt).toContain('如提供台词内容，请把台词安排在对应镜头节拍内')
    expect(prompt).toContain('电影化镜头计划')
    expect(prompt).toContain('低角度手持跟拍，旧城巷口追逐者占据中心。')
    expect(prompt).not.toContain('组提示词')
    expect(prompt).not.toContain('辅助参考图')
    expect(prompt).not.toContain('背景音乐。')
  })
})
