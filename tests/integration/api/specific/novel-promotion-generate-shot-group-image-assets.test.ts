import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { buildShotGroupCompositePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'

type ShotGroupRecord = {
  id: string
  title: string
  templateKey: string
  groupPrompt: string | null
  referenceImageUrl: string | null
  videoReferencesJson: string | null
  items?: Array<{
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
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async (input: Record<string, unknown>) => ({
  success: true,
  async: true,
  taskId: 'task-shot-group-image',
  payload: input.payload,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    storyboardModel: 'image-model-1',
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
        storyboardMoodPresetId: 'mood-rain',
        customMood: '潮湿、压迫、冷白霓虹',
      },
    }),
    items: new Array(9).fill(null).map((_, index) => ({
      itemIndex: index,
      title: `镜头 ${index + 1}`,
      prompt: null,
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
  })
})
