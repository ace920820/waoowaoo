import { describe, expect, it } from 'vitest'
import {
  mergeShotGroupDraftMetadata,
  parseShotGroupDraftMetadata,
  type ShotGroupDraftMetadata,
} from '@/lib/shot-group/draft-metadata'
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
})
