import { describe, expect, it } from 'vitest'
import {
  mergeShotGroupDraftMetadata,
  parseShotGroupDraftMetadata,
  type ShotGroupDraftMetadata,
} from '@/lib/shot-group/draft-metadata'
import { buildShotGroupVideoPrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { buildShotGroupVideoConfigSnapshot } from '@/lib/shot-group/video-config-snapshot'

function buildBaseDraftMetadata(
  overrides?: Partial<ShotGroupDraftMetadata>,
): ShotGroupDraftMetadata {
  return {
    segmentOrder: 1,
    clipId: 'clip-1',
    segmentKey: 'clip-1:1',
    sourceClipId: 'clip-1',
    segmentIndexWithinClip: 1,
    segmentStartSeconds: 0,
    segmentEndSeconds: 15,
    sceneLabel: '雨夜街口',
    narrativePrompt: '主角在雨夜街口追上目标，镜头从远景推进到近景。',
    embeddedDialogue: '林夏：别再躲我了。',
    dialogueOverrideText: null,
    shotRhythmGuidance: '先建立环境压迫感，再切人物对峙。',
    expectedShotCount: 6,
    sourceStatus: 'ready',
    placeholderReason: null,
    ...overrides,
  }
}

function buildShotGroup(videoReferencesJson: string | null) {
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
    bgmEnabled: false,
    includeDialogue: true,
    dialogueLanguage: 'zh' as const,
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: true,
    videoReferencesJson,
    items: [
      { id: 'item-1', shotGroupId: 'group-1', itemIndex: 0, title: '建立', prompt: '建立空间', imageUrl: 'cos/a.png' },
      { id: 'item-2', shotGroupId: 'group-1', itemIndex: 1, title: '推进', prompt: '推进动作', imageUrl: 'cos/b.png' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    videoMode: 'smart-multi-frame' as const,
  }
}

describe('shot group editable dialogue', () => {
  it('preserves embedded dialogue when only dialogueOverrideText is saved', () => {
    const baseSnapshot = buildShotGroupVideoConfigSnapshot({
      videoModel: 'ark::seedance-pro',
      generateAudio: true,
      includeDialogue: true,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: { duration: 15 },
      draftMetadata: buildBaseDraftMetadata(),
    })

    const previousDraftMetadata = parseShotGroupDraftMetadata(baseSnapshot)
    const merged = mergeShotGroupDraftMetadata(
      baseSnapshot,
      {
        ...(previousDraftMetadata as ShotGroupDraftMetadata),
        dialogueOverrideText: '林夏：这次我不会放你走。',
      },
      previousDraftMetadata,
    )

    const parsed = parseShotGroupDraftMetadata(merged)

    expect(parsed?.embeddedDialogue).toBe('林夏：别再躲我了。')
    expect(parsed?.dialogueOverrideText).toBe('林夏：这次我不会放你走。')
  })

  it('clears the override when dialogueOverrideText: null is saved', () => {
    const baseSnapshot = buildShotGroupVideoConfigSnapshot({
      videoModel: 'ark::seedance-pro',
      generateAudio: true,
      includeDialogue: true,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: { duration: 15 },
      draftMetadata: buildBaseDraftMetadata({
        dialogueOverrideText: '林夏：这次我不会放你走。',
      }),
    })

    const previousDraftMetadata = parseShotGroupDraftMetadata(baseSnapshot)
    const merged = mergeShotGroupDraftMetadata(
      baseSnapshot,
      {
        ...(previousDraftMetadata as ShotGroupDraftMetadata),
        dialogueOverrideText: null,
      },
      previousDraftMetadata,
    )

    const parsed = parseShotGroupDraftMetadata(merged)

    expect(parsed?.embeddedDialogue).toBe('林夏：别再躲我了。')
    expect(parsed?.dialogueOverrideText).toBeNull()
  })

  it('override dialogue takes precedence in the video prompt', () => {
    const prompt = buildShotGroupVideoPrompt({
      group: buildShotGroup(buildShotGroupVideoConfigSnapshot({
        generateAudio: true,
        includeDialogue: true,
        dialogueLanguage: 'zh',
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        generationOptions: { duration: 15 },
        draftMetadata: buildBaseDraftMetadata({
          dialogueOverrideText: '林夏：把枪放下。',
        }),
      })),
      template: getShotGroupTemplateSpec('grid-4'),
      locale: 'zh',
    })

    expect(prompt).toContain('台词内容：林夏：把枪放下。')
    expect(prompt).not.toContain('台词内容：林夏：别再躲我了。')
  })

  it('falls back to embedded dialogue when no override dialogue exists', () => {
    const prompt = buildShotGroupVideoPrompt({
      group: buildShotGroup(buildShotGroupVideoConfigSnapshot({
        generateAudio: true,
        includeDialogue: true,
        dialogueLanguage: 'zh',
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        generationOptions: { duration: 15 },
        draftMetadata: buildBaseDraftMetadata(),
      })),
      template: getShotGroupTemplateSpec('grid-4'),
      locale: 'zh',
    })

    expect(prompt).toContain('台词内容：林夏：别再躲我了。')
  })
})
