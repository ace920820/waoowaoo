import { describe, expect, it } from 'vitest'
import {
  mapStoryboardPackageToImportPlan,
  validateStoryboardPackage,
} from '@/lib/novel-promotion/storyboard-package'
import { buildValidStoryboardPackage } from './storyboard-package-fixtures'

function buildValidatedPackage(overrides = {}) {
  const result = validateStoryboardPackage(buildValidStoryboardPackage(overrides))
  if (!result.success) {
    throw new Error(`fixture invalid: ${JSON.stringify(result.issues)}`)
  }
  return result.data
}

describe('storyboard package mapper', () => {
  it('maps package metadata and flattened segment identity', () => {
    const plan = mapStoryboardPackageToImportPlan(buildValidatedPackage())

    expect(plan).toMatchObject({
      packageId: 'A13_EMPTY_ROOM_V1_3',
      title: '空房间 45 秒完整场景多片段生产包',
      language: 'zh',
      scenes: [{
        sceneId: 'A_S01',
        title: '空房间',
        segmentIds: ['A13_SEG_001'],
      }],
    })
    expect(plan.segments[0]).toMatchObject({
      packageId: 'A13_EMPTY_ROOM_V1_3',
      sceneId: 'A_S01',
      segmentId: 'A13_SEG_001',
      order: 1,
      timecode: '00:00-00:15',
    })
  })

  it('maps review and video config into shot-group-style fields and draft metadata', () => {
    const segment = mapStoryboardPackageToImportPlan(buildValidatedPackage()).segments[0]

    expect(segment.shotGroupFields).toMatchObject({
      title: '归来与第一处缺席',
      templateKey: 'grid-6',
      groupPrompt: expect.stringContaining('Create a 2x3 keyframe storyboard sheet, 6 panels.'),
      videoPrompt: expect.stringContaining('Generate a restrained 15-second cinematic video segment set in an old apartment hallway.'),
      generateAudio: false,
      includeDialogue: false,
      dialogueLanguage: 'zh',
      mode: 'smart-multi-frame',
      generationOptions: { duration: 15, resolution: '1080p', generateAudio: false },
    })
    expect(segment.draftMetadata).toMatchObject({
      referencePromptText: expect.stringContaining('Cinematic concept mother image for a 15-second segment, not a collage.'),
      compositePromptText: expect.stringContaining('Create a 2x3 keyframe storyboard sheet, 6 panels.'),
      storyboardModeId: 'director-keyframe-sheet',
      storyboardModeLabel: '导演关键帧分镜表',
      storyboardModePromptText: 'Create a 2x3 keyframe storyboard sheet following exact ordered panels.',
      storyboardMoodPresetId: null,
      customMood: '冷静、低照度、无人等待',
      sourceStatus: 'ready',
      placeholderReason: null,
      segmentStartSeconds: 0,
      segmentEndSeconds: 15,
    })
    expect(segment.draftMetadata.referencePromptText).toContain('关键镜头视觉锚点')
    expect(segment.draftMetadata.compositePromptText).toContain('导演逐镜头分镜表要求')
    expect(segment.shotGroupFields.videoPrompt).toContain('导演逐镜头视频执行表')
  })

  it('maps dialogue text into override metadata and includeDialogue', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const plan = mapStoryboardPackageToImportPlan(buildValidatedPackage({
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          videoConfig: {
            ...segment.videoConfig,
            dialogueText: '李未：你还会回来吗？',
            includeDialogue: false,
          },
        }],
      }],
    }))

    expect(plan.segments[0].shotGroupFields.includeDialogue).toBe(true)
    expect(plan.segments[0].draftMetadata.embeddedDialogue).toBe('李未：你还会回来吗？')
    expect(plan.segments[0].draftMetadata.dialogueOverrideText).toBe('李未：你还会回来吗？')
  })

  it('maps declared asset refs into match requests and script-derived references', () => {
    const segment = mapStoryboardPackageToImportPlan(buildValidatedPackage()).segments[0]

    expect(segment.assetMatchRequests.location).toEqual([
      expect.objectContaining({
        assetType: 'location',
        ref: 'LOC_OLD_APARTMENT',
        externalId: 'LOC_OLD_APARTMENT',
        matchName: '旧公寓',
        label: '旧公寓',
        status: 'declared',
      }),
    ])
    expect(segment.draftMetadata.scriptDerivedLocationAsset).toMatchObject({
      assetType: 'location',
      source: 'scriptDerived',
      assetId: null,
      label: '旧公寓',
    })
    expect(segment.draftMetadata.scriptDerivedCharacterAssets[0]).toMatchObject({ label: '李未' })
    expect(segment.draftMetadata.scriptDerivedPropAssets[0]).toMatchObject({ label: '旧钥匙和门锁' })
  })

  it('emits warnings for package refs missing asset declarations without throwing', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const plan = mapStoryboardPackageToImportPlan(buildValidatedPackage({
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          reviewConfig: {
            ...segment.reviewConfig,
            assets: {
              ...segment.reviewConfig.assets,
              propRefs: ['PROP_UNKNOWN'],
            },
          },
        }],
      }],
    }))

    expect(plan.segments[0].assetMatchRequests.props[0]).toMatchObject({
      ref: 'PROP_UNKNOWN',
      status: 'missing-declaration',
      label: 'PROP_UNKNOWN',
    })
    expect(plan.segments[0].warnings).toContain('prop asset reference "PROP_UNKNOWN" is not declared in package assets.')
  })

  it('maps cinematic shots into ordered item payloads and preserves cinematic plan metadata', () => {
    const segment = mapStoryboardPackageToImportPlan(buildValidatedPackage()).segments[0]

    expect(segment.items).toEqual([
      expect.objectContaining({
        itemIndex: 0,
        title: '李未深夜回到公寓门口',
        prompt: expect.stringContaining('画面提示词=Wide shot, Li Wei approaches her apartment door in a narrow dim hallway.'),
        durationSec: 2.5,
        shotSize: 'WS',
        angle: '略低平视',
        cameraMovement: 'static',
        composition: '李未15%，门墙65%，走廊负空间20%',
        lighting: '走廊感应灯冷白偏绿 4300K',
        blocking: '李未从走廊左侧进入，停在门前',
        emotionalBeat: '李未深夜回到公寓门口',
      }),
    ])
    expect(segment.draftMetadata.cinematicPlan).toMatchObject({
      packageSegmentId: 'A13_SEG_001',
      dramaticFunction: '钥匙卡住、屋里无灯、玄关少一双鞋。',
      informationProgression: ['深夜旧走廊', '钥匙卡住', '玄关少一双鞋'],
      emotionalIntent: {
        dominantMood: '疲惫、不安、冷观察',
      },
      importedRawPrompts: {
        compositePromptText: 'Create a 2x3 keyframe storyboard sheet, 6 panels.',
        referencePromptText: 'Cinematic concept mother image for a 15-second segment, not a collage.',
        videoPrompt: 'Generate a restrained 15-second cinematic video segment set in an old apartment hallway.',
      },
    })
    expect(segment.items[0].prompt).toContain('焦段=28mm')
    expect(segment.items[0].prompt).toContain('景深=中深景深')
    expect(segment.items[0].prompt).toContain('剪辑=冷开场')
    expect(segment.items[0].prompt).toContain('目的=建立冷静、低照度、无人等待的基调')
  })
})
