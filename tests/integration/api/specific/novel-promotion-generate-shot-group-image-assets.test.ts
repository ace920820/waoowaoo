import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { buildShotGroupCompositePrompt, buildShotGroupReferencePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'

type ShotGroupRecord = {
  id: string
  title: string
  templateKey: string
  groupPrompt: string | null
  referenceImageUrl: string | null
  videoReferencesJson: string | null
  items?: Array<{
    id: string
    shotGroupId: string
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
  novelPromotionCharacter: {
    findMany: vi.fn(async () => [{
      id: 'character-manual',
      appearances: [{
        id: 'character-image-1',
        imageUrl: 'cos/character-manual.png',
        imageUrls: JSON.stringify(['cos/character-manual.png']),
        selectedIndex: 0,
      }],
    }]),
  },
  novelPromotionLocation: {
    findMany: vi.fn(async ({ where }: { where?: { assetKind?: unknown } } = {}) => {
      const isProp = where?.assetKind === 'prop'
      if (isProp) return []
      return [{
        id: 'location-manual',
        selectedImage: { id: 'location-image-1', imageUrl: 'cos/location-manual.png' },
        images: [],
      }]
    }),
  },
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async (input: Record<string, unknown>) => ({
  success: true,
  async: true,
  taskId: 'task-shot-group-image',
  payload: input.payload,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    storyboardModel: 'image-model-storyboard',
    shotGroupReferenceImageModel: 'image-model-reference',
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '1024x1024',
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/novel-promotion/ownership', () => ({
  buildShotGroupInProjectWhere: vi.fn((_projectId: string, shotGroupId: string) => ({ id: shotGroupId })),
}))
vi.mock('@/lib/api-config', () => ({
  resolveModelSelection: vi.fn(async () => undefined),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/task/has-output', () => ({
  hasShotGroupImageOutput: vi.fn(async () => false),
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

function buildShotGroup(): ShotGroupRecord {
  return {
    id: 'shot-group-1',
    title: '片段 1',
    templateKey: 'grid-9',
    groupPrompt: '镜头沿着空旷街口压低推进，人物关系逐步收紧。',
    referenceImageUrl: 'cos/reference.png',
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '雨夜街口',
        narrativePrompt: '镜头沿着空旷街口压低推进，人物关系逐步收紧。',
        embeddedDialogue: '“别再往前了。”',
        shotRhythmGuidance: '先远景，再半身，最后推到眼神特写。',
        expectedShotCount: 9,
        sourceStatus: 'ready',
        placeholderReason: null,
        selectedLocationAsset: {
          assetType: 'location',
          source: 'manual',
          assetId: 'location-manual',
          label: '废弃站台',
        },
        preselectedLocationAsset: {
          assetType: 'location',
          source: 'preselected',
          assetId: 'location-preselected',
          label: '雨夜街口',
        },
        effectiveLocationAsset: {
          assetType: 'location',
          source: 'manual',
          assetId: 'location-manual',
          label: '废弃站台',
        },
        selectedCharacterAssets: [{
          assetType: 'character',
          source: 'manual',
          assetId: 'character-manual',
          label: '林夏',
        }],
        effectiveCharacterAssets: [{
          assetType: 'character',
          source: 'manual',
          assetId: 'character-manual',
          label: '林夏',
        }],
        effectivePropAssets: [],
        missingAssetWarnings: [{
          assetType: 'prop',
          code: 'missing_asset_binding',
          message: '物品素材缺失，当前片段将继续使用剧本文本回退生成',
        }],
        referencePromptText: '单张关键概念图：林夏站在废弃站台边缘，被冷白霓虹切开轮廓。',
        compositePromptText: '四到九个镜头展示林夏被逼入雨夜站台，空间压迫逐步增强。',
        storyboardMoodPresetId: 'mood-rain',
        customMood: '潮湿、压迫、冷白霓虹',
        cinematicPlan: {
          emotionalIntent: '让观众感到被窥视、紧张且人物很脆弱',
          visualStrategy: {
            shotSize: '从远景压到眼神特写',
            angle: '高角度俯拍削弱人物力量',
            cameraMovement: '缓慢前推并轻微摇晃',
            lighting: '冷白霓虹与雨水反光形成高反差',
            blocking: '人物被站台柱子切割在画面边缘',
          },
          shots: [{
            title: '窥视建立',
            duration: '2s',
            shotSize: '远景',
            angle: '高角度',
            cameraMovement: '缓慢前推',
            composition: '柱子遮挡形成窥视感',
            lighting: '冷白霓虹侧逆光',
            blocking: '林夏站在画面边缘',
            action: '她回头确认身后动静',
            dialogue: '别再往前了。',
            prompt: '远景高角度，废弃站台柱后窥视林夏，冷白霓虹雨夜。',
          }],
        },
      },
    }),
    items: new Array(9).fill(null).map((_, index) => ({
      id: `shot-group-1-item-${index + 1}`,
      shotGroupId: 'shot-group-1',
      itemIndex: index,
      title: `镜头 ${index + 1}`,
      prompt: index === 0 ? '远景高角度，废弃站台柱后窥视林夏，冷白霓虹雨夜。' : null,
      imageUrl: null,
      sourcePanelId: null,
    })),
  }
}

describe('api specific - novel promotion generate shot group image assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.shotGroup = buildShotGroup()
  })

  it('passes effective asset bindings and mood context into the generation task payload', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-shot-group-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-shot-group-image',
      method: 'POST',
      body: {
        shotGroupId: 'shot-group-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      payload: {
        assetBindings: {
          location: { assetId: string; source: string; label: string }
          characters: Array<{ assetId: string; source: string; label: string }>
          props: Array<unknown>
          warnings: Array<{ assetType: string }>
        }
        storyboardMood: { presetId: string | null; customMood: string | null }
        imageModel: string
      }
    }

    expect(res.status).toBe(200)
    expect(json.payload.assetBindings.location).toMatchObject({
      assetId: 'location-manual',
      source: 'manual',
      label: '废弃站台',
    })
    expect(json.payload.assetBindings.characters).toEqual([
      expect.objectContaining({
        assetId: 'character-manual',
        source: 'manual',
        label: '林夏',
      }),
    ])
    expect(json.payload.assetBindings.props).toEqual([])
    expect(json.payload.assetBindings.warnings).toEqual([
      expect.objectContaining({ assetType: 'prop' }),
    ])
    expect(json.payload.storyboardMood).toEqual({
      presetId: 'mood-rain',
      customMood: '潮湿、压迫、冷白霓虹',
    })
    expect(json.payload.imageModel).toBe('image-model-storyboard')
  })

  it('hydrates asset image URLs before validating reference-image generation readiness', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-shot-group-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-shot-group-image',
      method: 'POST',
      body: {
        shotGroupId: 'shot-group-1',
        targetField: 'reference',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      payload: {
        assetReferenceImages: string[]
        imageModel: string
        assetBindings: {
          location: { imageUrl?: string | null }
          characters: Array<{ imageUrl?: string | null }>
        }
      }
    }

    expect(res.status).toBe(200)
    expect(json.payload.imageModel).toBe('image-model-reference')
    expect(configServiceMock.resolveProjectModelCapabilityGenerationOptions).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: 'image-model-reference',
    }))
    expect(json.payload.assetReferenceImages).toEqual([
      'cos/location-manual.png',
      'cos/character-manual.png',
    ])
    expect(json.payload.assetBindings.location?.imageUrl).toBe('cos/location-manual.png')
    expect(json.payload.assetBindings.characters[0]?.imageUrl).toBe('cos/character-manual.png')
  })

  it('injects manual-over-auto asset constraints and non-blocking warnings into the composite prompt', () => {
    const prompt = buildShotGroupCompositePrompt({
      group: {
        ...buildShotGroup(),
        episodeId: 'episode-1',
        templateKey: 'grid-9',
        dialogueLanguage: 'zh',
        generateAudio: false,
        bgmEnabled: false,
        includeDialogue: true,
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        createdAt: '2026-04-19T00:00:00.000Z',
        updatedAt: '2026-04-19T00:00:00.000Z',
      },
      template: getShotGroupTemplateSpec('grid-9'),
      artStyle: '电影感冷调分镜',
      locale: 'zh',
      canvasAspectRatio: '1:1',
    })

    expect(prompt).toContain('场景约束：废弃站台(manual)')
    expect(prompt).toContain('角色约束：林夏(manual)')
    expect(prompt).toContain('物品约束：未保存显式物品资产，回退到剧本道具描述。')
    expect(prompt).toContain('氛围约束：预设=mood-rain；自定义=潮湿、压迫、冷白霓虹。')
    expect(prompt).toContain('弱约束提示：prop 仍不完整')
    expect(prompt).toContain('剧情内容：四到九个镜头展示林夏被逼入雨夜站台，空间压迫逐步增强。')
    expect(prompt).toContain('电影情绪意图：让观众感到被窥视、紧张且人物很脆弱。')
    expect(prompt).toContain('视觉策略：shotSize: 从远景压到眼神特写')
    expect(prompt).toContain('请把每个有序槽位当作镜头级指令执行')
    expect(prompt).toContain('镜头语言纪律：参考项目《data/镜头语言.md》的方法论')
    expect(prompt).toContain('保持空间地理、视线连续和 180° 规则')
    expect(prompt).toContain('远景高角度，废弃站台柱后窥视林夏，冷白霓虹雨夜。')
    expect(prompt).toContain('电影化镜头计划')
  })

  it('keeps the reference prompt as one key visual while using cinematic intent', () => {
    const prompt = buildShotGroupReferencePrompt({
      group: {
        ...buildShotGroup(),
        episodeId: 'episode-1',
        templateKey: 'grid-9',
        dialogueLanguage: 'zh',
        generateAudio: false,
        bgmEnabled: false,
        includeDialogue: true,
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        createdAt: '2026-04-19T00:00:00.000Z',
        updatedAt: '2026-04-19T00:00:00.000Z',
      },
      artStyle: '电影感冷调概念图',
      locale: 'zh',
      canvasAspectRatio: '16:9',
    })

    expect(prompt).toContain('单张关键概念图：林夏站在废弃站台边缘，被冷白霓虹切开轮廓。')
    expect(prompt).toContain('电影情绪意图：让观众感到被窥视、紧张且人物很脆弱。')
    expect(prompt).toContain('视觉策略：shotSize: 从远景压到眼神特写')
    expect(prompt).toContain('不要输出九宫格、拼贴、多格构图')
    expect(prompt).toContain('镜头语言纪律：参考项目《data/镜头语言.md》的方法论')
    expect(prompt).toContain('输出一张完成的、写实电影感的辅助参考图')
  })
})
