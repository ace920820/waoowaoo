import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import VideoPanelCardBody from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody'
import type { VideoPanelRuntime } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/hooks/useVideoPanelActions'

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => React.createElement('span', null, 'task-status'),
}))

vi.mock('@/components/ui/config-modals/ModelCapabilityDropdown', () => ({
  ModelCapabilityDropdown: () => React.createElement('div', null, 'model-dropdown'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: ({ alt }: { alt: string }) => React.createElement('div', null, alt),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

function createRuntime(overrides: Partial<VideoPanelRuntime> = {}): VideoPanelRuntime {
  const translate = (key: string, values?: Record<string, unknown>) => {
    if (key === 'firstLastFrame.asLastFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的尾帧`
    }
    if (key === 'firstLastFrame.asFirstFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的首帧`
    }
    if (key === 'firstLastFrame.generate') return '生成首尾帧视频'
    if (key === 'firstLastFrame.generated') return '首尾帧视频已生成'
    if (key === 'firstLastFrame.firstFrame') return '首帧'
    if (key === 'firstLastFrame.lastFrame') return '尾帧'
    if (key === 'firstLastFrame.firstFrameSource') {
      return `使用当前镜头 ${String(values?.number ?? '')} 的当前图片作为首帧来源`
    }
    if (key === 'firstLastFrame.lastFrameSourceLinked') {
      return `使用下一镜头 ${String(values?.number ?? '')} 的当前图片作为尾帧来源`
    }
    if (key === 'firstLastFrame.lastFrameSourceAvailable') {
      return `可链接下一镜头 ${String(values?.number ?? '')} 的当前图片作为尾帧来源`
    }
    if (key === 'firstLastFrame.tailFrameLinkedDescription') {
      return `该镜头会从自己的当前图片开始，并以镜头 ${String(values?.number ?? '')} 的当前图片作为尾帧结束。`
    }
    if (key === 'firstLastFrame.tailFrameAvailableDescription') {
      return `你可以把镜头 ${String(values?.number ?? '')} 的当前图片链接为该镜头的尾帧。`
    }
    if (key === 'firstLastFrame.noNextPanelDescription') return '没有下一镜头，因此当前镜头只能使用自己的当前图片生成。'
    if (key === 'firstLastFrame.noNextPanel') return '没有下一镜头'
    if (key === 'firstLastFrame.noNextPanelSource') return '没有下一镜头，无法提供尾帧来源'
    if (key === 'firstLastFrame.noSourceImage') return '当前还没有可用的当前图片'
    if (key === 'firstLastFrame.noTailFrameImage') return '下一镜头还没有当前图片'
    if (key === 'promptModal.promptLabel') return '视频提示词'
    if (key === 'promptModal.placeholder') return '输入首尾帧视频提示词...'
    if (key === 'panelCard.clickToEditPrompt') return '点击编辑提示词...'
    if (key === 'panelCard.selectModel') return '选择模型'
    if (key === 'panelCard.generateVideo') return '生成视频'
    if (key === 'panelCard.unknownShotType') return '未知镜头'
    if (key === 'panelCard.speechContract.title') return 'Speech 约束预览'
    if (key === 'panelCard.speechContract.mode.silent') return '静音'
    if (key === 'panelCard.speechContract.mode.dialogue') return '对白'
    if (key === 'panelCard.speechContract.mode.voiceover') return '旁白'
    if (key === 'panelCard.speechContract.source.screenplay_voice_lines') return '剧本对白映射'
    if (key === 'panelCard.speechContract.source.screenplay_panel_match') return '面板文本回落匹配'
    if (key === 'panelCard.speechContract.source.none') return '未命中 speech contract'
    if (key === 'panelCard.speechContract.match.matched') return '已命中'
    if (key === 'panelCard.speechContract.match.fallback') return '回落命中'
    if (key === 'panelCard.speechContract.match.none') return '未命中'
    if (key === 'panelCard.speechContract.audio.enabled') return '本次生成含音频'
    if (key === 'panelCard.speechContract.audio.disabled') return '本次生成禁用音频'
    if (key === 'panelCard.speechContract.summary.matched') return '这是当前生成配置下的 speech 约束预览；下次生成会按这组剧本台词约束执行。'
    if (key === 'panelCard.speechContract.summary.matchedAudioDisabled') return '这是当前生成配置下的 speech 约束预览；虽然命中了剧本台词，但这次关闭音频，所以下次生成会按静音约束执行。'
    if (key === 'panelCard.speechContract.summary.fallback') return '这是当前生成配置下的 speech 约束预览；当前没有命中显式对白映射，下次生成会按面板文本回落匹配的结果约束。'
    if (key === 'panelCard.speechContract.summary.fallbackAudioDisabled') return '这是当前生成配置下的 speech 约束预览；当前只命中面板文本回落匹配，但这次关闭音频，所以下次生成会按静音约束执行。'
    if (key === 'panelCard.speechContract.summary.none') return '这是当前生成配置下的 speech 约束预览；当前未命中 speech contract，所以下次生成会按静音处理。'
    if (key === 'panelCard.speechContract.summary.noneAudioDisabled') return '这是当前生成配置下的 speech 约束预览；当前未命中 speech contract，且这次关闭音频，所以下次生成会按静音约束执行。'
    if (key === 'panelCard.speechContract.guardrail.non_verbal_only') return '只允许环境声、动作声等非语言音频。'
    if (key === 'panelCard.speechContract.guardrail.no_verbal_audio') return '不要生成对白、旁白、歌词或其他口语化音频。'
    if (key === 'panelCard.speechContract.guardrail.no_mouth_sync') return '避免明显口型和像在说话的嘴部动作。'
    if (key === 'panelCard.speechContract.guardrail.intentional_silent') return '这个镜头被视为有意静音镜头。'
    if (key === 'panelCard.speechContract.guardrail.voiceover_only') return '命中的台词只按旁白/画外音处理。'
    if (key === 'panelCard.speechContract.guardrail.no_onscreen_speech') return '不要把这些词做成画内开口说话。'
    if (key === 'panelCard.speechContract.guardrail.reaction_over_speaking') return '人物更应表现为聆听、行动或无声反应。'
    if (key === 'panelCard.speechContract.guardrail.verbatim_only') return '只使用命中的结构化台词，不要改写。'
    if (key === 'panelCard.speechContract.guardrail.no_extra_lines') return '不要额外补词、旁白或即兴台词。'
    if (key === 'panelCard.speechContract.guardrail.align_visible_speech') return '如果人物出镜说话，口型只对齐这些词。'
    if (key === 'stage.hasSynced') return '已生成'
    if (key === 'promptModal.duration') return '秒'
    return key
  }

  const runtime = {
    t: translate,
    tCommon: (key: string) => key,
    panel: {
      storyboardId: 'sb-1',
      panelIndex: 2,
      panelId: 'panel-2',
      imageUrl: 'https://example.com/frame-2.jpg',
      videoUrl: null,
      videoGenerationMode: null,
      lipSyncVideoUrl: null,
      textPanel: {
        shot_type: '平视中景',
        description: '谢俞站在宴席中央',
        duration: 3,
      },
      speechPlan: {
        mode: 'dialogue',
        source: 'screenplay_voice_lines',
        generatedAudioRequired: true,
        primaryText: '把门关上。',
        speakers: ['Hero'],
        lines: [
          {
            lineIndex: 7,
            type: 'dialogue',
            speaker: 'Hero',
            content: '把门关上。',
            parenthetical: '压低声音',
          },
        ],
      },
    },
    panelIndex: 2,
    panelKey: 'sb-1-2',
    media: {
      showLipSyncVideo: true,
      onToggleLipSyncVideo: () => undefined,
      onPreviewImage: () => undefined,
      baseVideoUrl: undefined,
      currentVideoUrl: undefined,
    },
    taskStatus: {
      isVideoTaskRunning: false,
      isLipSyncTaskRunning: false,
      taskRunningVideoLabel: '生成中',
      lipSyncInlineState: null,
    },
    videoModel: {
      selectedModel: 'veo-3.1',
      setSelectedModel: () => undefined,
      capabilityFields: [],
      generationOptions: {},
      setCapabilityValue: () => undefined,
      missingCapabilityFields: [],
      videoModelOptions: [],
    },
    player: {
      isPlaying: false,
    },
    promptEditor: {
      isEditing: false,
      editingPrompt: '',
      setEditingPrompt: () => undefined,
      handleStartEdit: () => undefined,
      handleSave: () => undefined,
      handleCancelEdit: () => undefined,
      isSavingPrompt: false,
      localPrompt: '人物从席间回身，接到下一镜头',
    },
    voiceManager: {
      hasMatchedAudio: false,
      hasMatchedVoiceLines: false,
      audioGenerateError: null,
      localVoiceLines: [],
      isVoiceLineTaskRunning: () => false,
      handlePlayVoiceLine: () => undefined,
      handleGenerateAudio: async () => undefined,
      playingVoiceLineId: null,
    },
    lipSync: {
      handleStartLipSync: () => undefined,
      executingLipSync: false,
    },
    layout: {
      isLinked: true,
      isLastFrame: true,
      nextPanel: {
        storyboardId: 'sb-1',
        panelIndex: 3,
        imageUrl: 'https://example.com/frame-3.jpg',
      },
      prevPanel: {
        storyboardId: 'sb-1',
        panelIndex: 1,
        imageUrl: 'https://example.com/frame-1.jpg',
      },
      hasNext: true,
      flModel: 'veo-3.1',
      flModelOptions: [],
      flGenerationOptions: {},
      flCapabilityFields: [],
      flMissingCapabilityFields: [],
      flCustomPrompt: '',
      defaultFlPrompt: '',
      videoRatio: '9:16',
    },
    actions: {
      onGenerateVideo: () => undefined,
      onUpdatePanelVideoModel: () => undefined,
      onToggleLink: () => undefined,
      onFlModelChange: () => undefined,
      onFlCapabilityChange: () => undefined,
      onFlCustomPromptChange: () => undefined,
      onResetFlPrompt: () => undefined,
      onGenerateFirstLastFrame: () => undefined,
    },
    computed: {
      showLipSyncSection: false,
      canLipSync: false,
      hasVisibleBaseVideo: false,
    },
  }

  return {
    ...runtime,
    ...overrides,
  } as unknown as VideoPanelRuntime
}

describe('VideoPanelCardBody', () => {
  it('renders incoming and outgoing first-last-frame UI for chained panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime(),
      }),
    )

    expect(markup).toContain('作为镜头 2 的尾帧')
    expect(markup).toContain('作为镜头 4 的首帧')
    expect(markup).toContain('使用当前镜头 3 的当前图片作为首帧来源')
    expect(markup).toContain('使用下一镜头 4 的当前图片作为尾帧来源')
    expect(markup).toContain('视频提示词')
    expect(markup).toContain('生成首尾帧视频')
  })

  it('keeps prompt editing and normal generation UI for an incoming tail-frame-only panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          layout: {
            ...createRuntime().layout,
            isLinked: false,
            isLastFrame: true,
          },
        }),
      }),
    )

    expect(markup).toContain('作为镜头 2 的尾帧')
    expect(markup).toContain('视频提示词')
    expect(markup).toContain('生成视频')
  })

  it('renders available tail-frame source when next panel exists but is not linked', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          layout: {
            ...createRuntime().layout,
            isLinked: false,
            isLastFrame: false,
          },
        }),
      }),
    )

    expect(markup).toContain('你可以把镜头 4 的当前图片链接为该镜头的尾帧。')
    expect(markup).toContain('可链接下一镜头 4 的当前图片作为尾帧来源')
  })

  it('renders empty tail-frame state when there is no next panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          layout: {
            ...createRuntime().layout,
            hasNext: false,
            nextPanel: null,
            isLinked: false,
            isLastFrame: false,
          },
        }),
      }),
    )

    expect(markup).toContain('没有下一镜头，因此当前镜头只能使用自己的当前图片生成。')
    expect(markup).toContain('没有下一镜头，无法提供尾帧来源')
  })

  it('renders a matched dialogue speech contract summary from real speech plan data', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime(),
      }),
    )

    expect(markup).toContain('Speech 约束预览')
    expect(markup).toContain('对白')
    expect(markup).toContain('剧本对白映射')
    expect(markup).toContain('这是当前生成配置下的 speech 约束预览；下次生成会按这组剧本台词约束执行。')
    expect(markup).toContain('Hero (压低声音)')
    expect(markup).toContain('把门关上。')
    expect(markup).toContain('只使用命中的结构化台词，不要改写。')
  })

  it('renders fallback speech contract as silent when generateAudio is disabled', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          panel: {
            ...createRuntime().panel,
            speechPlan: {
              mode: 'voiceover',
              source: 'screenplay_panel_match',
              generatedAudioRequired: true,
              primaryText: '城市从不真正入睡。',
              speakers: ['Narrator'],
              lines: [
                {
                  lineIndex: 3,
                  type: 'voiceover',
                  speaker: 'Narrator',
                  content: '城市从不真正入睡。',
                  parenthetical: null,
                },
              ],
            },
          },
          videoModel: {
            ...createRuntime().videoModel,
            generationOptions: {
              generateAudio: false,
            },
          },
        }),
      }),
    )

    expect(markup).toContain('静音')
    expect(markup).toContain('面板文本回落匹配')
    expect(markup).toContain('回落命中')
    expect(markup).toContain('本次生成禁用音频')
    expect(markup).toContain('这是当前生成配置下的 speech 约束预览；当前只命中面板文本回落匹配，但这次关闭音频，所以下次生成会按静音约束执行。')
    expect(markup).toContain('Narrator')
    expect(markup).toContain('不要生成对白、旁白、歌词或其他口语化音频。')
  })

  it('keeps no-mouth-sync visible for silent panels', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          panel: {
            ...createRuntime().panel,
            speechPlan: {
              mode: 'silent',
              source: 'none',
              generatedAudioRequired: true,
              primaryText: null,
              speakers: [],
              lines: [],
            },
          },
        }),
      }),
    )

    expect(markup).toContain('静音')
    expect(markup).toContain('避免明显口型和像在说话的嘴部动作。')
  })
})
