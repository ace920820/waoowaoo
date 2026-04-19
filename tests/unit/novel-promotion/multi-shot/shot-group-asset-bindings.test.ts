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
    embeddedDialogue: '“你终于肯停下了。”',
    dialogueOverrideText: null,
    shotRhythmGuidance: '先建立环境压迫感，再切人物对峙。',
    expectedShotCount: 6,
    sourceStatus: 'ready',
    placeholderReason: null,
    ...overrides,
  }
}

describe('shot group asset bindings', () => {
  it('resolves effective assets with manual > preselected > scriptDerived priority', () => {
    const snapshot = buildShotGroupVideoConfigSnapshot({
      videoModel: 'fal::kling-v1',
      generateAudio: false,
      includeDialogue: true,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: { duration: 15 },
      draftMetadata: buildBaseDraftMetadata({
        selectedLocationAsset: {
          assetType: 'location',
          source: 'manual',
          assetId: 'location-manual',
          label: '废弃地铁站',
        },
        preselectedLocationAsset: {
          assetType: 'location',
          source: 'preselected',
          assetId: 'location-preselected',
          label: '雨夜街口',
        },
        scriptDerivedLocationAsset: {
          assetType: 'location',
          source: 'scriptDerived',
          assetId: null,
          label: '剧本解析出的雨夜街口',
        },
        selectedCharacterAssets: [{
          assetType: 'character',
          source: 'manual',
          assetId: 'character-manual',
          label: '林夏',
        }],
        preselectedCharacterAssets: [{
          assetType: 'character',
          source: 'preselected',
          assetId: 'character-preselected',
          label: '周沉',
        }],
        scriptDerivedCharacterAssets: [{
          assetType: 'character',
          source: 'scriptDerived',
          assetId: null,
          label: '路人',
        }],
        preselectedPropAssets: [{
          assetType: 'prop',
          source: 'preselected',
          assetId: 'prop-preselected',
          label: '黑伞',
        }],
        scriptDerivedPropAssets: [{
          assetType: 'prop',
          source: 'scriptDerived',
          assetId: null,
          label: '手机',
        }],
        storyboardMoodPresetId: 'mood-rainy-noir',
        customMood: '潮湿、压迫、霓虹反光',
      }),
    })

    const parsed = parseShotGroupDraftMetadata(snapshot)

    expect(parsed?.effectiveLocationAsset).toMatchObject({
      assetId: 'location-manual',
      source: 'manual',
      label: '废弃地铁站',
    })
    expect(parsed?.effectiveCharacterAssets).toEqual([
      expect.objectContaining({
        assetId: 'character-manual',
        source: 'manual',
        label: '林夏',
      }),
    ])
    expect(parsed?.effectivePropAssets).toEqual([
      expect.objectContaining({
        assetId: 'prop-preselected',
        source: 'preselected',
        label: '黑伞',
      }),
    ])
    expect(parsed?.storyboardMoodPresetId).toBe('mood-rainy-noir')
    expect(parsed?.customMood).toBe('潮湿、压迫、霓虹反光')
    expect(parsed?.missingAssetWarnings).toEqual([])
  })

  it('keeps asset and mood metadata when merging into an existing snapshot', () => {
    const baseSnapshot = buildShotGroupVideoConfigSnapshot({
      videoModel: 'ark::seedance-pro',
      generateAudio: false,
      includeDialogue: false,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: { duration: 15, resolution: '1080p' },
      draftMetadata: buildBaseDraftMetadata({
        preselectedLocationAsset: {
          assetType: 'location',
          source: 'preselected',
          assetId: 'location-preselected',
          label: '地下停车场',
        },
        storyboardMoodPresetId: 'mood-cold-blue',
      }),
    })

    const previousDraftMetadata = parseShotGroupDraftMetadata(baseSnapshot)
    const merged = mergeShotGroupDraftMetadata(
      baseSnapshot,
      buildBaseDraftMetadata({
        ...previousDraftMetadata,
        selectedPropAssets: [{
          assetType: 'prop',
          source: 'manual',
          assetId: 'prop-manual',
          label: '染血信封',
        }],
        customMood: '冷白灯、空旷回响、危险将至',
      }),
      previousDraftMetadata,
    )

    const parsed = parseShotGroupDraftMetadata(merged)
    const raw = JSON.parse(merged) as {
      generationOptions?: Record<string, unknown>
      mode?: string
    }

    expect(parsed?.preselectedLocationAsset).toMatchObject({
      assetId: 'location-preselected',
      source: 'preselected',
    })
    expect(parsed?.effectiveLocationAsset).toMatchObject({
      assetId: 'location-preselected',
      source: 'preselected',
    })
    expect(parsed?.selectedPropAssets).toEqual([
      expect.objectContaining({
        assetId: 'prop-manual',
        source: 'manual',
      }),
    ])
    expect(parsed?.storyboardMoodPresetId).toBe('mood-cold-blue')
    expect(parsed?.customMood).toBe('冷白灯、空旷回响、危险将至')
    expect(raw.mode).toBe('smart-multi-frame')
    expect(raw.generationOptions).toEqual({ duration: 15, resolution: '1080p' })
  })

  it('falls back to script-derived assets and keeps warning-capable missing state non-blocking', () => {
    const parsed = parseShotGroupDraftMetadata(
      buildShotGroupVideoConfigSnapshot({
        generateAudio: false,
        includeDialogue: false,
        dialogueLanguage: 'zh',
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        generationOptions: {},
        draftMetadata: buildBaseDraftMetadata({
          sceneLabel: '密林边缘',
          selectedLocationAsset: null,
          preselectedLocationAsset: null,
          selectedCharacterAssets: [],
          preselectedCharacterAssets: [],
          selectedPropAssets: [],
          preselectedPropAssets: [],
        }),
      }),
    )

    expect(parsed?.scriptDerivedLocationAsset).toMatchObject({
      source: 'scriptDerived',
      label: '密林边缘',
      assetId: null,
    })
    expect(parsed?.effectiveLocationAsset).toMatchObject({
      source: 'scriptDerived',
      label: '密林边缘',
      assetId: null,
    })
    expect(parsed?.missingAssetWarnings).toEqual([
      expect.objectContaining({ assetType: 'location', code: 'missing_asset_binding' }),
      expect.objectContaining({ assetType: 'character', code: 'missing_asset_binding' }),
      expect.objectContaining({ assetType: 'prop', code: 'missing_asset_binding' }),
    ])
  })
})
