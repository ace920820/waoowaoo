import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type ShotGroupRecord = {
  id: string
  episodeId: string
  title: string
  templateKey: string
  groupPrompt: string | null
  videoPrompt: string | null
  referenceImageUrl: string | null
  referenceImageMediaId: string | null
  compositeImageUrl: string | null
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
  videoModel: string | null
  videoReferencesJson: string | null
  videoUrl: string | null
  items: Array<{
    itemIndex: number
    title: string | null
    prompt: string | null
    imageUrl: string | null
    sourcePanelId: string | null
  }>
}

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const routeState = vi.hoisted(() => ({
  shotGroup: null as ShotGroupRecord | null,
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionShotGroup: {
    findFirst: vi.fn(async () => routeState.shotGroup),
  },
  $transaction: vi.fn(async (fn: (tx: {
    novelPromotionShotGroup: {
      update: (args: { where: { id: string }; data: Partial<ShotGroupRecord> }) => Promise<void>
    }
    novelPromotionShotGroupItem: {
      deleteMany: (args: unknown) => Promise<void>
      createMany: (args: unknown) => Promise<void>
    }
  }) => Promise<void>) => {
    await fn({
      novelPromotionShotGroup: {
        update: async ({ data }) => {
          routeState.shotGroup = {
            ...(routeState.shotGroup as ShotGroupRecord),
            ...data,
          }
        },
      },
      novelPromotionShotGroupItem: {
        deleteMany: async () => undefined,
        createMany: async () => undefined,
      },
    })
  }),
}))

const attachMediaMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: { shotGroups: ShotGroupRecord[] }) => value),
}))

const ownershipMock = vi.hoisted(() => ({
  buildShotGroupInProjectWhere: vi.fn((_projectId: string, shotGroupId: string) => ({ id: shotGroupId })),
  buildEpisodeInProjectWhere: vi.fn((_projectId: string, episodeId: string) => ({ id: episodeId })),
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async (input: Record<string, unknown>) => ({
  success: true,
  async: true,
  taskId: 'task-shot-group-video',
  status: 'queued',
  payload: input.payload,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    videoModel: 'fal::kling-v1',
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async (input: { runtimeSelections: Record<string, unknown> }) => input.runtimeSelections),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => attachMediaMock)
vi.mock('@/lib/novel-promotion/ownership', () => ownershipMock)
vi.mock('@/lib/api-config', () => ({
  resolveModelSelection: vi.fn(async () => undefined),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/task/has-output', () => ({
  hasShotGroupVideoOutput: vi.fn(async () => false),
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/task/ui-payload', () => ({
  withTaskUiPayload: vi.fn((payload: Record<string, unknown>) => payload),
}))
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))

function buildShotGroup(overrides?: Partial<ShotGroupRecord>): ShotGroupRecord {
  return {
    id: 'shot-group-1',
    episodeId: 'episode-1',
    title: '原始镜头组',
    templateKey: 'grid-4',
    groupPrompt: '原始组提示词',
    videoPrompt: '原始视频提示词',
    referenceImageUrl: 'cos/reference-old.png',
    referenceImageMediaId: 'media-reference-old',
    compositeImageUrl: 'cos/composite.png',
    generateAudio: true,
    bgmEnabled: false,
    includeDialogue: true,
    dialogueLanguage: 'ja',
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: true,
    videoModel: 'ark::seedance-pro',
    videoReferencesJson: JSON.stringify({
      configVersion: 2,
      mode: 'smart-multi-frame',
      videoModel: 'ark::seedance-pro',
      generateAudio: true,
      includeDialogue: true,
      dialogueLanguage: 'ja',
      generationOptions: {
        duration: 10,
        resolution: '1080p',
        generateAudio: true,
      },
      draftMetadata: {
        segmentOrder: 2,
        clipId: 'clip-2',
        sceneLabel: '雨夜街口',
        narrativePrompt: '已有提示词',
        embeddedDialogue: null,
        shotRhythmGuidance: '1. 建立',
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
      },
    }),
    videoUrl: null,
    items: [
      { itemIndex: 0, title: '镜头 1', prompt: '提示词 1', imageUrl: 'cos/a.png', sourcePanelId: 'panel-1' },
      { itemIndex: 1, title: '镜头 2', prompt: '提示词 2', imageUrl: 'cos/b.png', sourcePanelId: 'panel-2' },
    ],
    ...(overrides || {}),
  }
}

describe('api specific - novel promotion shot groups route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.shotGroup = buildShotGroup()
  })

  it('PATCH keeps saved generationOptions when request omits them and allows referenceImageUrl null to clear', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/shot-groups/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/shot-groups',
      method: 'PATCH',
      body: {
        shotGroupId: 'shot-group-1',
        title: '更新后的镜头组',
        referenceImageUrl: null,
        mode: 'smart-multi-frame',
        videoModel: 'ark::seedance-pro',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as { shotGroup: ShotGroupRecord }
    const savedConfig = JSON.parse(json.shotGroup.videoReferencesJson || '{}') as {
      generationOptions?: Record<string, unknown>
      mode?: string
    }

    expect(res.status).toBe(200)
    expect(json.shotGroup.referenceImageUrl).toBeNull()
    expect(routeState.shotGroup?.referenceImageMediaId).toBeNull()
    expect(savedConfig.mode).toBe('smart-multi-frame')
    expect(savedConfig.generationOptions).toEqual({
      duration: 10,
      resolution: '1080p',
      generateAudio: true,
    })
    expect((savedConfig as { draftMetadata?: Record<string, unknown> }).draftMetadata).toEqual({
      segmentOrder: 2,
      clipId: 'clip-2',
      sceneLabel: '雨夜街口',
      narrativePrompt: '已有提示词',
      embeddedDialogue: null,
      shotRhythmGuidance: '1. 建立',
      expectedShotCount: 4,
      sourceStatus: 'ready',
      placeholderReason: null,
    })
  })

  it('POST generate-shot-group-video normalizes non-Ark mode to real composite storyboard semantics', async () => {
    routeState.shotGroup = buildShotGroup({
      smartMultiFrameEnabled: true,
      omniReferenceEnabled: false,
      videoModel: 'fal::kling-v1',
      videoReferencesJson: JSON.stringify({
        configVersion: 2,
        mode: 'smart-multi-frame',
        videoModel: 'fal::kling-v1',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      }),
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-shot-group-video/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-shot-group-video',
      method: 'POST',
      body: {
        shotGroupId: 'shot-group-1',
        mode: 'smart-multi-frame',
        videoModel: 'fal::kling-v1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as { payload: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        mode: 'omni-reference',
        referenceMode: 'composite_image_mvp',
      }),
    }))
    expect(json.payload).toMatchObject({
      mode: 'omni-reference',
      referenceMode: 'composite_image_mvp',
    })
  })
})
