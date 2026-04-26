import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { buildValidStoryboardPackage } from '../../../unit/novel-promotion/storyboard-package/storyboard-package-fixtures'
import { parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'

type ShotGroupItemRecord = {
  id?: string
  shotGroupId: string
  itemIndex: number
  title: string | null
  prompt: string | null
  imageUrl?: string | null
  imageMediaId?: string | null
  sourcePanelId?: string | null
}

type ShotGroupRecord = {
  id: string
  episodeId: string
  title: string
  templateKey: string
  groupPrompt: string | null
  videoPrompt: string | null
  referenceImageUrl?: string | null
  referenceImageMediaId?: string | null
  compositeImageUrl?: string | null
  videoUrl?: string | null
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
  videoModel: string | null
  videoReferencesJson: string | null
  createdAt: Date
  items: ShotGroupItemRecord[]
}

type ProjectAssetRecord = {
  id: string
  name: string
  assetKind?: string
  selectedImageId?: string | null
  selectedImage?: { id: string; imageUrl: string } | null
  images?: Array<{ id: string; imageUrl: string; selected?: boolean }>
  appearances?: Array<{ id: string; imageUrl: string; selected?: boolean }>
}

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const routeState = vi.hoisted(() => ({
  episode: null as { id: string; shotGroups: ShotGroupRecord[] } | null,
  projectAssets: {
    characters: [] as ProjectAssetRecord[],
    locations: [] as ProjectAssetRecord[],
  },
  createCalls: [] as Array<Record<string, unknown>>,
  updateCalls: [] as Array<Record<string, unknown>>,
  deleteManyCalls: [] as Array<Record<string, unknown>>,
  createManyCalls: [] as Array<Record<string, unknown>>,
}))

const ownershipMock = vi.hoisted(() => ({
  buildEpisodeInProjectWhere: vi.fn((_projectId: string, episodeId: string) => ({ id: episodeId })),
}))

function cloneShotGroup(group: ShotGroupRecord): ShotGroupRecord {
  return {
    ...group,
    createdAt: new Date(group.createdAt),
    items: group.items.map((item) => ({ ...item })),
  }
}

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(async () => {
      if (!routeState.episode) return null
      return {
        id: routeState.episode.id,
        shotGroups: routeState.episode.shotGroups.map(cloneShotGroup),
      }
    }),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      characters: routeState.projectAssets.characters.map((asset) => ({ ...asset })),
      locations: routeState.projectAssets.locations.map((asset) => ({ ...asset })),
    })),
  },
  novelPromotionShotGroup: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      routeState.createCalls.push(data)
      const id = `imported-shot-group-${routeState.createCalls.length}`
      const itemCreates = ((data.items as { create?: Array<Record<string, unknown>> } | undefined)?.create) || []
      const group: ShotGroupRecord = {
        id,
        episodeId: String(data.episodeId),
        title: String(data.title),
        templateKey: String(data.templateKey),
        groupPrompt: data.groupPrompt as string | null,
        videoPrompt: data.videoPrompt as string | null,
        generateAudio: Boolean(data.generateAudio),
        bgmEnabled: Boolean(data.bgmEnabled),
        includeDialogue: Boolean(data.includeDialogue),
        dialogueLanguage: data.dialogueLanguage as 'zh' | 'en' | 'ja',
        omniReferenceEnabled: Boolean(data.omniReferenceEnabled),
        smartMultiFrameEnabled: Boolean(data.smartMultiFrameEnabled),
        videoModel: data.videoModel as string | null,
        videoReferencesJson: data.videoReferencesJson as string | null,
        createdAt: new Date(),
        items: itemCreates.map((item, index) => ({
          id: `${id}-item-${index}`,
          shotGroupId: id,
          itemIndex: Number(item.itemIndex),
          title: item.title as string | null,
          prompt: item.prompt as string | null,
        })),
      }
      routeState.episode?.shotGroups.push(group)
      return { id }
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      routeState.updateCalls.push({ where, data })
      const group = routeState.episode?.shotGroups.find((item) => item.id === where.id)
      if (!group) return { id: where.id }
      Object.assign(group, data)
      return { id: where.id }
    }),
  },
  novelPromotionShotGroupItem: {
    deleteMany: vi.fn(async ({ where }: { where: { shotGroupId: string } }) => {
      routeState.deleteManyCalls.push({ where })
      const group = routeState.episode?.shotGroups.find((item) => item.id === where.shotGroupId)
      if (group) group.items = []
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      routeState.createManyCalls.push({ data })
      for (const item of data) {
        const shotGroupId = String(item.shotGroupId)
        const group = routeState.episode?.shotGroups.find((candidate) => candidate.id === shotGroupId)
        if (!group) continue
        group.items.push({
          id: `${shotGroupId}-item-${item.itemIndex}`,
          shotGroupId,
          itemIndex: Number(item.itemIndex),
          title: item.title as string | null,
          prompt: item.prompt as string | null,
          imageUrl: item.imageUrl as string | null | undefined,
          imageMediaId: item.imageMediaId as string | null | undefined,
          sourcePanelId: item.sourcePanelId as string | null | undefined,
        })
      }
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    novelPromotionShotGroup: prismaMock.novelPromotionShotGroup,
    novelPromotionShotGroupItem: prismaMock.novelPromotionShotGroupItem,
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/novel-promotion/ownership', () => ownershipMock)

function markdownPackage(content = buildValidStoryboardPackage()) {
  return `# Director Package\n\n\`\`\`waoo-storyboard-package+json\n${JSON.stringify(content, null, 2)}\n\`\`\``
}

function buildExistingImportedShotGroup(overrides: Partial<ShotGroupRecord> = {}): ShotGroupRecord {
  const metadata = {
    segmentOrder: 1,
    clipId: 'A13_EMPTY_ROOM_V1_3:A_S01',
    segmentKey: 'A13_EMPTY_ROOM_V1_3:A13_SEG_001',
    sourceClipId: 'A_S01',
    segmentIndexWithinClip: 1,
    segmentStartSeconds: 0,
    segmentEndSeconds: 15,
    sceneLabel: '旧公寓门口 / 玄关',
    narrativePrompt: 'old prompt',
    embeddedDialogue: null,
    dialogueOverrideText: null,
    shotRhythmGuidance: null,
    expectedShotCount: 1,
    sourceStatus: 'ready',
    placeholderReason: null,
    importedStoryboardPackageId: 'A13_EMPTY_ROOM_V1_3',
    importedStoryboardSceneId: 'A_S01',
    importedStoryboardSegmentId: 'A13_SEG_001',
  }
  return {
    id: 'existing-imported-group',
    episodeId: 'episode-1',
    title: '旧导入标题',
    templateKey: 'grid-6',
    groupPrompt: 'old group prompt',
    videoPrompt: 'old video prompt',
    referenceImageUrl: 'https://cdn/ref.png',
    compositeImageUrl: 'https://cdn/composite.png',
    videoUrl: 'https://cdn/video.mp4',
    generateAudio: false,
    bgmEnabled: false,
    includeDialogue: false,
    dialogueLanguage: 'zh',
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: true,
    videoModel: null,
    videoReferencesJson: JSON.stringify({ configVersion: 2, mode: 'smart-multi-frame', draftMetadata: metadata }),
    createdAt: new Date('2026-04-26T00:00:00Z'),
    items: [{
      id: 'existing-item-0',
      shotGroupId: 'existing-imported-group',
      itemIndex: 0,
      title: '旧镜头',
      prompt: 'old item prompt',
      imageUrl: 'https://cdn/item.png',
      imageMediaId: 'media-item-1',
      sourcePanelId: 'panel-1',
    }],
    ...overrides,
  }
}

async function callImport(body: Record<string, unknown>) {
  const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/[episodeId]/storyboard-package-import/route')
  const req = buildMockRequest({
    path: '/api/novel-promotion/project-1/episodes/episode-1/storyboard-package-import',
    method: 'POST',
    body,
  })
  return mod.POST(req, { params: Promise.resolve({ projectId: 'project-1', episodeId: 'episode-1' }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  routeState.episode = { id: 'episode-1', shotGroups: [] }
  routeState.projectAssets = {
    characters: [{ id: 'char-1', name: '李未', appearances: [{ id: 'char-img-1', imageUrl: 'https://cdn/char.png', selected: true }] }],
    locations: [
      { id: 'loc-1', name: '旧公寓', assetKind: 'location', images: [{ id: 'loc-img-1', imageUrl: 'https://cdn/loc.png', selected: true }] },
      { id: 'prop-1', name: '钥匙', assetKind: 'prop', images: [{ id: 'prop-img-1', imageUrl: 'https://cdn/prop.png', selected: true }] },
    ],
  }
  routeState.createCalls = []
  routeState.updateCalls = []
  routeState.deleteManyCalls = []
  routeState.createManyCalls = []
})

describe('api specific - novel promotion storyboard package import route', () => {
  it('previews markdown package with asset matches and no mutations', async () => {
    const res = await callImport({ mode: 'preview', content: markdownPackage(), filename: 'package.md' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.summary).toMatchObject({ totalSegments: 1, createCount: 1, updateCount: 0 })
    expect(json.segments[0]).toMatchObject({
      action: 'create',
      segmentId: 'A13_SEG_001',
      shotCount: 1,
      templateKey: 'grid-6',
    })
    expect(json.segments[0].assetMatches.location[0]).toMatchObject({ status: 'matched', assetId: 'loc-1' })
    expect(json.segments[0].assetMatches.characters[0]).toMatchObject({ status: 'matched', assetId: 'char-1' })
    expect(json.segments[0].assetMatches.props[0]).toMatchObject({ status: 'matched', assetId: 'prop-1' })
    expect(routeState.createCalls).toHaveLength(0)
    expect(routeState.updateCalls).toHaveLength(0)
  })

  it('returns validation errors without mutating data', async () => {
    const res = await callImport({ mode: 'preview', content: '{"schema":"wrong"}', filename: 'bad.json' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('VALIDATION_FAILED')
    expect(routeState.createCalls).toHaveLength(0)
    expect(routeState.updateCalls).toHaveLength(0)
  })

  it('commits shot group fields, metadata, and item prompts', async () => {
    const res = await callImport({ mode: 'commit', content: JSON.stringify(buildValidStoryboardPackage()), filename: 'package.json' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.commit.created).toEqual([{ segmentId: 'A13_SEG_001', shotGroupId: 'imported-shot-group-1' }])
    expect(routeState.createCalls).toHaveLength(1)
    const group = routeState.episode?.shotGroups[0]
    expect(group).toMatchObject({
      title: '归来与第一处缺席',
      templateKey: 'grid-6',
      groupPrompt: 'Create a 2x3 keyframe storyboard sheet, 6 panels.',
      videoPrompt: 'Generate a restrained 15-second cinematic video segment set in an old apartment hallway.',
      smartMultiFrameEnabled: true,
    })
    expect(group?.items[0]).toMatchObject({
      itemIndex: 0,
      title: '李未深夜回到公寓门口',
      prompt: 'Wide shot, Li Wei approaches her apartment door in a narrow dim hallway.',
    })
    const metadata = parseShotGroupDraftMetadata(group?.videoReferencesJson)
    expect(metadata).toMatchObject({
      referencePromptText: 'Cinematic concept mother image for a 15-second segment, not a collage.',
      compositePromptText: 'Create a 2x3 keyframe storyboard sheet, 6 panels.',
      storyboardModeId: 'director-keyframe-sheet',
      storyboardModeLabel: '导演关键帧分镜表',
      customMood: '冷静、低照度、无人等待',
      importedStoryboardPackageId: 'A13_EMPTY_ROOM_V1_3',
      importedStoryboardSegmentId: 'A13_SEG_001',
    })
    expect(metadata?.selectedLocationAsset?.assetId).toBe('loc-1')
    expect(metadata?.selectedCharacterAssets?.[0]?.assetId).toBe('char-1')
    expect(metadata?.selectedPropAssets?.[0]?.assetId).toBe('prop-1')
  })

  it('updates existing imported group and preserves generated media by default', async () => {
    routeState.episode = {
      id: 'episode-1',
      shotGroups: [
        buildExistingImportedShotGroup(),
        buildExistingImportedShotGroup({
          id: 'manual-group',
          videoReferencesJson: JSON.stringify({ configVersion: 2 }),
        }),
      ],
    }
    const pkg = buildValidStoryboardPackage({ title: 'updated package' })
    pkg.scenes[0].segments[0].title = '更新后的片段标题'
    pkg.scenes[0].segments[0].cinematicPlan.shots[0].imagePrompt = 'Updated director prompt.'

    const res = await callImport({ mode: 'commit', content: JSON.stringify(pkg), filename: 'package.json' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary).toMatchObject({ totalSegments: 1, createCount: 0, updateCount: 1 })
    expect(json.commit.updated).toEqual([{ segmentId: 'A13_SEG_001', shotGroupId: 'existing-imported-group' }])
    expect(routeState.createCalls).toHaveLength(0)
    expect(routeState.updateCalls).toHaveLength(1)
    const updated = routeState.episode?.shotGroups.find((group) => group.id === 'existing-imported-group')
    const manual = routeState.episode?.shotGroups.find((group) => group.id === 'manual-group')
    expect(updated?.title).toBe('更新后的片段标题')
    expect(updated?.referenceImageUrl).toBe('https://cdn/ref.png')
    expect(updated?.compositeImageUrl).toBe('https://cdn/composite.png')
    expect(updated?.videoUrl).toBe('https://cdn/video.mp4')
    expect(updated?.items[0]).toMatchObject({
      prompt: 'Updated director prompt.',
      imageUrl: 'https://cdn/item.png',
      imageMediaId: 'media-item-1',
      sourcePanelId: 'panel-1',
    })
    expect(manual?.title).toBe('旧导入标题')
  })

  it('falls back to script-derived metadata for missing assets', async () => {
    routeState.projectAssets = { characters: [], locations: [] }

    const res = await callImport({ mode: 'commit', content: JSON.stringify(buildValidStoryboardPackage()), filename: 'package.json' })
    const json = await res.json()
    const group = routeState.episode?.shotGroups[0]
    const metadata = parseShotGroupDraftMetadata(group?.videoReferencesJson)

    expect(res.status).toBe(200)
    expect(json.summary.warningCount).toBeGreaterThan(0)
    expect(json.segments[0].assetMatches.location[0]).toMatchObject({ status: 'script-derived-fallback', assetId: null })
    expect(metadata?.effectiveLocationAsset).toMatchObject({ source: 'scriptDerived', assetId: null, label: '旧公寓' })
    expect(metadata?.missingAssetWarnings?.length).toBeGreaterThan(0)
    expect(routeState.projectAssets.characters).toHaveLength(0)
  })

  it('reports markdown without package block as parse failure', async () => {
    const res = await callImport({ mode: 'preview', content: '# 普通分镜表\n\n| a | b |', filename: 'package.md' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('MISSING_MARKDOWN_BLOCK')
    expect(routeState.createCalls).toHaveLength(0)
  })
})
