import type { StoryboardPackage } from '@/lib/novel-promotion/storyboard-package'

export function buildValidStoryboardPackage(overrides: Partial<StoryboardPackage> = {}): StoryboardPackage {
  return {
    schema: 'waoo.storyboard_package',
    schemaVersion: '1.0',
    packageId: 'A13_EMPTY_ROOM_V1_3',
    title: '空房间 45 秒完整场景多片段生产包',
    language: 'zh',
    global: {
      targetDurationSec: 45,
      segmentDurationSec: 15,
      defaultTemplateKey: 'grid-6',
      visualBible: {
        style: 'restrained realistic film stills',
        negativePrompt: 'crying woman, tears',
      },
      continuity: {
        axis: '门口到室内深处为主轴',
      },
    },
    assets: {
      locations: [{ externalId: 'LOC_OLD_APARTMENT', name: '旧公寓', matchName: '旧公寓' }],
      characters: [{ externalId: 'CHAR_LI_WEI', name: '李未', matchName: '李未' }],
      props: [{ externalId: 'PROP_KEY', name: '旧钥匙和门锁', matchName: '钥匙' }],
    },
    scenes: [{
      sceneId: 'A_S01',
      title: '空房间',
      targetDurationSec: 45,
      directorIntent: '让观众跟随她逐步确认缺席。',
      segments: [{
        segmentId: 'A13_SEG_001',
        order: 1,
        timecode: '00:00-00:15',
        targetDurationSec: 15,
        title: '归来与第一处缺席',
        sceneLabel: '旧公寓门口 / 玄关',
        dramaticFunction: '钥匙卡住、屋里无灯、玄关少一双鞋。',
        localOnlyNotice: '不展示桌面、衣柜、手机或最终坐下。',
        informationProgression: ['深夜旧走廊', '钥匙卡住', '玄关少一双鞋'],
        reviewConfig: {
          templateKey: 'grid-6',
          referencePromptText: 'Cinematic concept mother image for a 15-second segment, not a collage.',
          storyboardMode: {
            id: 'director-keyframe-sheet',
            label: '导演关键帧分镜表',
            promptText: 'Create a 2x3 keyframe storyboard sheet following exact ordered panels.',
          },
          compositePromptText: 'Create a 2x3 keyframe storyboard sheet, 6 panels.',
          assets: {
            locationRefs: ['LOC_OLD_APARTMENT'],
            characterRefs: ['CHAR_LI_WEI'],
            propRefs: ['PROP_KEY'],
          },
          mood: {
            presetId: null,
            customMood: '冷静、低照度、无人等待',
          },
        },
        videoConfig: {
          videoPrompt: 'Generate a restrained 15-second cinematic video segment set in an old apartment hallway.',
          dialogueText: '',
          dialogueLanguage: 'zh',
          includeDialogue: false,
          generateAudio: false,
          referenceMode: 'smart-multi-frame',
          videoModel: null,
          generationOptions: { duration: 15, resolution: '1080p', generateAudio: false },
        },
        cinematicPlan: {
          emotionalIntent: {
            dominantMood: '疲惫、不安、冷观察',
          },
          visualStrategy: {
            colorAndLight: '4300K 冷白偏绿走廊灯',
          },
          shots: [
            {
              shotId: 'A13_S01_SH01',
              index: 1,
              durationSec: 2.5,
              title: '李未深夜回到公寓门口',
              dramaticBeat: '李未深夜回到公寓门口',
              informationUnit: '时间很晚，空间安静，人物孤身进入',
              purpose: '建立冷静、低照度、无人等待的基调',
              blocking: '李未从走廊左侧进入，停在门前',
              shotSize: 'WS',
              lens: '28mm 轻广角',
              dof: '中深景深',
              angle: '略低平视',
              cameraMovement: 'static',
              composition: '李未15%，门墙65%，走廊负空间20%',
              lighting: '走廊感应灯冷白偏绿 4300K',
              edit: '冷开场静切到手部',
              imagePrompt: 'Wide shot, Li Wei approaches her apartment door in a narrow dim hallway.',
            },
          ],
        },
      }],
    }],
    ...overrides,
  }
}
