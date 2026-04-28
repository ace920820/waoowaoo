import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

type PanelRow = {
  id: string
  storyboardId: string
  panelIndex: number
  srtSegment: string | null
  dialogueOverride?: string | null
  videoUrl: string | null
  imageUrl: string | null
  videoPrompt: string | null
  description: string | null
  firstLastFramePrompt: string | null
  duration: number | null
  storyboard?: {
    clip: {
      id: string
      screenplay: string | null
    } | null
  }
  matchedVoiceLines?: Array<{
    lineIndex: number
    speaker: string
    content: string
    matchedPanelId: string
    matchedStoryboardId: string
    matchedPanelIndex: number
  }>
}

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const withTaskLifecycleMock = vi.hoisted(() =>
  vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
)

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9' })),
  resolveLipSyncVideoSource: vi.fn(async () => 'https://provider.example/lipsync.mp4'),
  resolveVideoSourceFromGeneration: vi.fn<(...args: unknown[]) => Promise<{ url: string; actualVideoTokens?: number; downloadHeaders?: Record<string, string> }>>(async () => ({ url: 'https://provider.example/video.mp4' })),
  toSignedUrlIfCos: vi.fn((url: string | null) => (url ? `https://signed.example/${url}` : null)),
  uploadVideoSourceToCos: vi.fn(async () => 'cos/lip-sync/video.mp4'),
}))
const modelConfigContractMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn((value: string) => {
    const [provider, model] = value.split('::')
    if (!provider || !model) return null
    return { provider, modelId: model }
  }),
}))
const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))
const concurrencyGateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionShotGroup: {
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  novelPromotionVoiceLine: {
    findUnique: vi.fn(),
  },
  novelPromotionCharacter: {
    findMany: vi.fn(),
  },
  novelPromotionLocation: {
    findMany: vi.fn(),
  },
}))

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      void name
    }

    async add() {
      return { id: 'job-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(name: string, processor: WorkerProcessor) {
      void name
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: withTaskLifecycleMock,
}))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/model-config-contract', () => ({
  parseModelKeyStrict: modelConfigContractMock.parseModelKeyStrict,
}))
vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'api-key' })),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => concurrencyGateMock)

function buildPanel(overrides?: Partial<PanelRow>): PanelRow {
  return {
    id: 'panel-1',
    storyboardId: 'storyboard-1',
    panelIndex: 0,
    srtSegment: '第一句台词',
    videoUrl: 'cos/base-video.mp4',
    imageUrl: 'cos/panel-image.png',
    videoPrompt: 'panel prompt',
    description: 'panel description',
    firstLastFramePrompt: null,
    duration: 5,
    storyboard: {
      clip: {
        id: 'clip-1',
        screenplay: JSON.stringify({
          scenes: [
            {
              scene_number: 1,
              content: [
                { type: 'dialogue', character: 'Hero', lines: '第一句台词' },
              ],
            },
          ],
        }),
      },
    },
    matchedVoiceLines: [
      {
        lineIndex: 1,
        speaker: 'Hero',
        content: '第一句台词',
        matchedPanelId: 'panel-1',
        matchedStoryboardId: 'storyboard-1',
        matchedPanelIndex: 0,
      },
    ],
    ...(overrides || {}),
  }
}

function buildJob(params: {
  type: TaskJobData['type']
  payload?: Record<string, unknown>
  targetType?: string
  targetId?: string
}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: params.type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: params.targetType ?? 'NovelPromotionPanel',
      targetId: params.targetId ?? 'panel-1',
      payload: params.payload ?? {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function buildShotGroup(overrides?: Record<string, unknown>) {
  return {
    id: 'shot-group-1',
    episodeId: 'episode-1',
    title: '组 1',
    templateKey: 'grid-4',
    groupPrompt: '组提示词',
    videoPrompt: '视频提示词',
    compositeImageUrl: 'cos/shot-group.png',
    referenceImageUrl: 'cos/concept.png',
    generateAudio: true,
    bgmEnabled: false,
    includeDialogue: false,
    dialogueLanguage: 'zh',
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: true,
    videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
    items: [
      { itemIndex: 0, title: '镜头 1', prompt: '提示词 1', imageUrl: 'cos/frame-1.png', sourcePanelId: 'panel-1' },
      { itemIndex: 1, title: '镜头 2', prompt: '提示词 2', imageUrl: 'cos/frame-2.png', sourcePanelId: 'panel-2' },
    ],
    ...(overrides || {}),
  }
}

describe('worker video processor behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue(buildPanel())
    prismaMock.novelPromotionPanel.findFirst.mockResolvedValue(buildPanel())
    prismaMock.novelPromotionShotGroup.findFirst.mockResolvedValue(buildShotGroup())
    prismaMock.novelPromotionVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      audioUrl: 'cos/line-1.mp3',
      audioDuration: 1200,
    })
    prismaMock.novelPromotionCharacter.findMany.mockResolvedValue([{
      id: 'char-liwei',
      customVoiceUrl: 'cos/liwei-voice.wav',
      appearances: [{ id: 'appearance-liwei', imageUrl: 'cos/liwei.png', imageUrls: null, selectedIndex: null }],
    }])
    prismaMock.novelPromotionLocation.findMany
      .mockResolvedValueOnce([{
        id: 'loc-room',
        selectedImage: { id: 'loc-img', imageUrl: 'cos/room.png' },
        images: [],
      }])
      .mockResolvedValueOnce([{
        id: 'prop-key',
        selectedImage: { id: 'prop-img', imageUrl: 'cos/key.png' },
        images: [],
      }])

    const mod = await import('@/lib/workers/video.worker')
    mod.createVideoWorker()
  })

  it('VIDEO_PANEL: 缺少 payload.videoModel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {},
    })

    await expect(processor!(job)).rejects.toThrow('VIDEO_MODEL_REQUIRED: payload.videoModel is required')
  })

  it('VIDEO_PANEL: 透传异步轮询返回的下载头到 COS 上传', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'openai-compatible:oa-1::sora-2',
        generationOptions: {
          duration: 8,
          resolution: '720p',
        },
      },
    })

    await processor!(job)

    expect(utilsMock.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      'panel-video',
      'panel-1',
      {
        Authorization: 'Bearer oa-key',
      },
    )

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          prompt: expect.stringContaining('[Structured Speech Plan JSON]'),
        }),
      }),
    )
  })

  it('VIDEO_PANEL: 为 silent panel 注入结构化静音 speech plan', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      srtSegment: '人物只是沉默地看着窗外',
      storyboard: {
        clip: {
          id: 'clip-1',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 1,
                content: [
                  { type: 'action', text: '人物只是沉默地看着窗外' },
                ],
              },
            ],
          }),
        },
      },
      matchedVoiceLines: [],
    }))

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          prompt: expect.stringContaining('"mode": "silent"'),
        }),
      }),
    )

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Treat this panel as intentionally non-speaking.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('"guardrails": ['),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('avoid lip-sync-like mouth performance or speech-shaped mouth cycles.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Do not add background music, soundtrack, score, or musical bed.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.not.objectContaining({
        bgm: expect.anything(),
      }),
    })
  })

  it('VIDEO_PANEL: 为 dialogue panel 注入显式口播执行指令', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
      },
    })

    await processor!(job)

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Treat the listed lines as intentional on-screen spoken dialogue for this panel.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('speaker="Hero" content="第一句台词"'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('prefer restrained or silent mouth performance over incorrect speech.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.not.objectContaining({
        bgm: expect.anything(),
      }),
    })
  })

  it('VIDEO_PANEL: 优先使用视频阶段手动对白覆盖，避免预览与执行文本不一致', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      srtSegment: '旧对白',
      dialogueOverride: '视频阶段改后的对白',
      matchedVoiceLines: [
        {
          lineIndex: 1,
          speaker: 'Hero',
          content: '旧对白',
          matchedPanelId: 'panel-1',
          matchedStoryboardId: 'storyboard-1',
          matchedPanelIndex: 0,
        },
      ],
    }))

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
      },
    })

    await processor!(job)

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Panel text reference: 视频阶段改后的对白'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('content="视频阶段改后的对白"'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.not.objectContaining({
        prompt: expect.stringContaining('Panel text reference: 旧对白'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.not.objectContaining({
        prompt: expect.stringContaining('content="旧对白"'),
      }),
    })
  })

  it('VIDEO_PANEL: 为 voiceover panel 注入旁白执行指令', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(buildPanel({
      srtSegment: '城市从不真正入睡。',
      matchedVoiceLines: [],
      storyboard: {
        clip: {
          id: 'clip-1',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 1,
                content: [
                  { type: 'voiceover', text: '城市从不真正入睡。' },
                ],
              },
            ],
          }),
        },
      },
    }))

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
      },
    })

    await processor!(job)

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Treat the listed lines as off-screen narration or voiceover.'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('Do not stage these lines as on-screen mouth speech or visible lip-sync'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.not.objectContaining({
        bgm: expect.anything(),
      }),
    })
  })

  it('VIDEO_PANEL: 非 Vidu 模型不向共享 worker 请求注入不受支持的 bgm 参数', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
        generationOptions: {
          generateAudio: false,
        },
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          generateAudio: false,
          prompt: expect.stringContaining('"generateAudio": false'),
        }),
      }),
    )

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      modelId: 'fal::kling-v1',
      options: expect.not.objectContaining({
        bgm: expect.anything(),
      }),
    })
  })

  it('VIDEO_PANEL: 将 Ark 返回的实际视频 token 用量透传到任务结果', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      actualVideoTokens: 108000,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const result = await processor!(job) as { panelId: string; videoUrl: string; actualVideoTokens: number }
    expect(result).toEqual({
      panelId: 'panel-1',
      videoUrl: 'cos/lip-sync/video.mp4',
      actualVideoTokens: 108000,
    })
  })



  it('VIDEO_SHOT_GROUP: Seedance reference plan includes concept, character, prop and audio references', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_SHOT_GROUP,
      targetType: 'NovelPromotionShotGroup',
      targetId: 'shot-group-1',
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 5,
          resolution: '720p',
          generateAudio: true,
        },
      },
    })

    const result = await processor!(job) as {
      videoReferences: { referencePlan?: Array<{ token: string; label: string }> }
      videoPrompt: string
    }

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      modelId: 'ark::doubao-seedance-2-0-260128',
      options: expect.objectContaining({
        contentItems: expect.arrayContaining([
          { type: 'image_url', image_url: { url: 'https://signed.example/cos/shot-group.png' }, role: 'reference_image' },
          { type: 'image_url', image_url: { url: 'https://signed.example/cos/concept.png' }, role: 'reference_image' },
          { type: 'image_url', image_url: { url: 'https://signed.example/cos/liwei.png' }, role: 'reference_image' },
          { type: 'audio_url', audio_url: { url: 'https://signed.example/cos/liwei-voice.wav' }, role: 'reference_audio' },
        ]),
        prompt: expect.stringContaining('@Image3（角色 李未）'),
      }),
    })
    expect(resolveCall?.[1]).toMatchObject({
      options: expect.objectContaining({
        prompt: expect.stringContaining('@Audio1（角色 李未 声音）'),
      }),
    })
    const contentItems = (resolveCall?.[1] as { options?: { contentItems?: Array<{ type: string; role?: string }> } } | undefined)
      ?.options?.contentItems
    expect(contentItems?.filter((item) => item.type === 'image_url').every((item) => item.role === 'reference_image')).toBe(true)
    expect(result.videoReferences.referencePlan).toEqual(expect.arrayContaining([
      expect.objectContaining({ token: '@Image3', label: '角色 李未' }),
      expect.objectContaining({ token: '@Audio1', label: '角色 李未 声音' }),
    ]))
  })

  it('VIDEO_SHOT_GROUP: 非 Ark 模型归一为 composite storyboard 真实语义', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_SHOT_GROUP,
      targetType: 'NovelPromotionShotGroup',
      targetId: 'shot-group-1',
      payload: {
        videoModel: 'fal::kling-v1',
    videoReferencesJson: JSON.stringify({
      videoReferenceSettings: {
        includeConceptImage: true,
        includeCharacterImages: true,
        selectedCharacterAssetIds: ['char-liwei'],
        includeLocationImage: true,
        includePropImages: true,
        includeShotImages: false,
        includeCharacterAudio: true,
        selectedAudioCharacterAssetIds: ['char-liwei'],
      },
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '空房间',
        narrativePrompt: '李未发现线索。',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        effectiveLocationAsset: { assetType: 'location', source: 'manual', assetId: 'loc-room', label: '空房间' },
        selectedCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        effectiveCharacterAssets: [{ assetType: 'character', source: 'manual', assetId: 'char-liwei', label: '李未' }],
        selectedPropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
        effectivePropAssets: [{ assetType: 'prop', source: 'manual', assetId: 'prop-key', label: '旧钥匙' }],
      },
    }),
        generationOptions: {
          duration: 5,
          resolution: '720p',
          generateAudio: true,
        },
      },
    })

    const result = await processor!(job) as {
      shotGroupId: string
      videoSourceType: string
      videoReferences: { mode: string; referenceMode: string }
    }

    expect(result.videoSourceType).toBe('composite_image_mvp')
    expect(result.videoReferences).toMatchObject({
      mode: 'omni-reference',
      referenceMode: 'composite_image_mvp',
    })

    const resolveCall = utilsMock.resolveVideoSourceFromGeneration.mock.calls.at(-1)
    expect(resolveCall?.[1]).toMatchObject({
      modelId: 'fal::kling-v1',
      options: expect.not.objectContaining({
        contentItems: expect.anything(),
      }),
    })

    expect(prismaMock.novelPromotionShotGroup.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shot-group-1' },
      data: expect.objectContaining({
        videoSourceType: 'composite_image_mvp',
        videoModel: 'fal::kling-v1',
      }),
    }))
  })

  it('LIP_SYNC: 缺少 panel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce(null)
    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: { voiceLineId: 'line-1' },
      targetId: 'panel-missing',
    })

    await expect(processor!(job)).rejects.toThrow('Lip-sync panel not found')
  })

  it('LIP_SYNC: 正常路径写回 lipSyncVideoUrl 并清理 lipSyncTaskId', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: {
        voiceLineId: 'line-1',
        lipSyncModel: 'fal::lipsync-model',
      },
      targetId: 'panel-1',
    })

    const result = await processor!(job) as { panelId: string; voiceLineId: string; lipSyncVideoUrl: string }
    expect(result).toEqual({
      panelId: 'panel-1',
      voiceLineId: 'line-1',
      lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
    })

    expect(utilsMock.resolveLipSyncVideoSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        modelKey: 'fal::lipsync-model',
        audioDurationMs: 1200,
        videoDurationMs: 5000,
      }),
    )

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
        lipSyncTaskId: null,
      },
    })
  })

  it('未知任务类型: 显式报错', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const unsupportedJob = buildJob({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
    })

    await expect(processor!(unsupportedJob)).rejects.toThrow('Unsupported video task type')
  })
})
