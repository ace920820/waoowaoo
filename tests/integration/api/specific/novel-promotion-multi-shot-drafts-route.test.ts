import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type ClipRecord = {
  id: string
  start: number
  end?: number
  duration?: number
  createdAt: Date
  summary: string
  location: string | null
  characters: string | null
  props: string | null
  content: string
  screenplay: string | null
  shotCount?: number
}

type ShotGroupItemRecord = {
  id: string
  shotGroupId: string
  itemIndex: number
  title: string | null
  prompt: string | null
  imageUrl: string | null
  sourcePanelId: string | null
}

type ShotGroupRecord = {
  id: string
  episodeId: string
  title: string
  templateKey: string
  groupPrompt: string | null
  videoPrompt: string | null
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
  videoModel: string | null
  videoReferencesJson: string | null
  compositeImageUrl: string | null
  videoUrl: string | null
  createdAt: Date
  items: ShotGroupItemRecord[]
}

type ShotGroupCreateData = {
  episodeId: string
  title: string
  templateKey: string
  groupPrompt?: string | null
  videoPrompt?: string | null
  generateAudio?: boolean
  bgmEnabled?: boolean
  includeDialogue?: boolean
  dialogueLanguage?: 'zh' | 'en' | 'ja'
  omniReferenceEnabled?: boolean
  smartMultiFrameEnabled?: boolean
  videoModel?: string | null
  videoReferencesJson?: string | null
  items?: {
    create?: Array<{
      itemIndex: number
      title: string | null
      prompt?: string | null
    }>
  }
}

type DraftMetadataRecord = {
  segmentOrder: number
  clipId: string
  segmentKey?: string
  sourceClipId?: string
  segmentIndexWithinClip?: number
  segmentStartSeconds?: number
  segmentEndSeconds?: number
  sceneLabel: string
  narrativePrompt: string | null
  embeddedDialogue: string | null
  shotRhythmGuidance: string | null
  expectedShotCount: number
  sourceStatus: 'ready' | 'placeholder'
  placeholderReason: 'missing_clip_content' | null
  dialogueOverrideText?: string | null
  selectedLocationAsset?: {
    assetType: 'location'
    source: 'manual' | 'preselected' | 'scriptDerived'
    assetId: string | null
    label: string
  } | null
  selectedCharacterAssets?: Array<{
    assetType: 'character'
    source: 'manual' | 'preselected' | 'scriptDerived'
    assetId: string | null
    label: string
  }>
  selectedPropAssets?: Array<{
    assetType: 'prop'
    source: 'manual' | 'preselected' | 'scriptDerived'
    assetId: string | null
    label: string
  }>
  referencePromptText?: string | null
  compositePromptText?: string | null
  storyboardModeId?: string | null
  storyboardModeLabel?: string | null
  storyboardMoodPresetId?: string | null
  customMood?: string | null
  cinematicPlan?: Record<string, unknown> | null
}

type EpisodeRecord = {
  id: string
  clips: ClipRecord[]
  shotGroups: ShotGroupRecord[]
}

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const attachMediaMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: { shotGroups: ShotGroupRecord[] }) => value),
}))

const ownershipMock = vi.hoisted(() => ({
  buildEpisodeInProjectWhere: vi.fn((_projectId: string, episodeId: string) => ({ id: episodeId })),
}))

const routeState = vi.hoisted(() => ({
  episode: null as EpisodeRecord | null,
  createCalls: [] as Array<Record<string, unknown>>,
  updateCalls: [] as Array<Record<string, unknown>>,
  storyboardCreateCalls: 0,
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
        ...routeState.episode,
        clips: routeState.episode.clips.map((clip) => ({ ...clip })),
        shotGroups: routeState.episode.shotGroups.map(cloneShotGroup),
      }
    }),
  },
  novelPromotionShotGroup: {
    create: vi.fn(async ({ data }: { data: ShotGroupCreateData }) => {
      routeState.createCalls.push(data)
      const id = `shot-group-created-${routeState.createCalls.length}`
      const items = ((data.items?.create as Array<Record<string, unknown>> | undefined) || []).map((item, index) => ({
        id: `${id}-item-${index}`,
        shotGroupId: id,
        itemIndex: Number(item.itemIndex),
        title: typeof item.title === 'string' ? item.title : null,
        prompt: typeof item.prompt === 'string' ? item.prompt : null,
        imageUrl: null,
        sourcePanelId: null,
      }))
      const record: ShotGroupRecord = {
        id,
        episodeId: String(data.episodeId),
        title: String(data.title),
        templateKey: String(data.templateKey),
        groupPrompt: (data.groupPrompt as string | null) ?? null,
        videoPrompt: (data.videoPrompt as string | null) ?? null,
        generateAudio: Boolean(data.generateAudio),
        bgmEnabled: Boolean(data.bgmEnabled),
        includeDialogue: Boolean(data.includeDialogue),
        dialogueLanguage: (data.dialogueLanguage as 'zh' | 'en' | 'ja') ?? 'zh',
        omniReferenceEnabled: Boolean(data.omniReferenceEnabled),
        smartMultiFrameEnabled: Boolean(data.smartMultiFrameEnabled),
        videoModel: (data.videoModel as string | null) ?? null,
        videoReferencesJson: (data.videoReferencesJson as string | null) ?? null,
        compositeImageUrl: null,
        videoUrl: null,
        createdAt: new Date(),
        items,
      }
      routeState.episode?.shotGroups.push(record)
      return record
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      routeState.updateCalls.push({ where, data })
      const current = routeState.episode?.shotGroups.find((group) => group.id === where.id)
      if (!current) return null
      const itemsCreate = (data.items as { create?: Array<Record<string, unknown>>; deleteMany?: Record<string, unknown> } | undefined)?.create
      Object.assign(current, data)
      if (itemsCreate) {
        current.items = itemsCreate.map((item, index) => ({
          id: `${current.id}-item-${index}`,
          shotGroupId: current.id,
          itemIndex: Number(item.itemIndex),
          title: typeof item.title === 'string' ? item.title : null,
          prompt: typeof item.prompt === 'string' ? item.prompt : null,
          imageUrl: null,
          sourcePanelId: null,
        }))
      }
      return current
    }),
  },
  novelPromotionStoryboard: {
    create: vi.fn(async () => {
      routeState.storyboardCreateCalls += 1
      return null
    }),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/media/attach', () => attachMediaMock)
vi.mock('@/lib/novel-promotion/ownership', () => ownershipMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

function buildClip(overrides?: Partial<ClipRecord>): ClipRecord {
  return {
    id: 'clip-1',
    start: 0,
    end: 60,
    duration: 60,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    summary: '主角在夜色里追上同伴',
    location: '雨夜街口',
    characters: '林夏, 周沉',
    props: '雨伞',
    content: '林夏穿过车流追上周沉，两人终于在雨夜街口正面对峙。',
    screenplay: JSON.stringify({
      scenes: [
        {
          scene_number: 1,
          content: [{ type: 'dialogue', character: '林夏', lines: '你终于肯停下了。' }],
        },
      ],
    }),
    shotCount: 4,
    ...(overrides || {}),
  }
}

function buildDraftMetadata(overrides?: Partial<DraftMetadataRecord>): DraftMetadataRecord {
  return {
    segmentOrder: 1,
    clipId: 'clip-1',
    segmentKey: 'clip-1:1',
    sourceClipId: 'clip-1',
    segmentIndexWithinClip: 1,
    segmentStartSeconds: 0,
    segmentEndSeconds: 15,
    sceneLabel: '雨夜街口',
    narrativePrompt: '旧提示词',
    embeddedDialogue: null,
    shotRhythmGuidance: '旧节奏',
    expectedShotCount: 4,
    sourceStatus: 'ready',
    placeholderReason: null,
    ...(overrides || {}),
  }
}

function buildShotGroup(overrides?: Partial<ShotGroupRecord>): ShotGroupRecord {
  return {
    id: 'shot-group-1',
    episodeId: 'episode-1',
    title: '已存在镜头组',
    templateKey: 'grid-4',
    groupPrompt: '旧组提示词',
    videoPrompt: '旧视频提示词',
    generateAudio: false,
    bgmEnabled: false,
    includeDialogue: false,
    dialogueLanguage: 'zh',
    omniReferenceEnabled: false,
    smartMultiFrameEnabled: true,
    videoModel: null,
    videoReferencesJson: JSON.stringify({
      configVersion: 2,
      mode: 'smart-multi-frame',
      generateAudio: false,
      includeDialogue: false,
      dialogueLanguage: 'zh',
      draftMetadata: buildDraftMetadata({ sceneLabel: '旧场景' }),
    }),
    compositeImageUrl: null,
    videoUrl: null,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    items: Array.from({ length: 4 }, (_, index) => ({
      id: `item-${index}`,
      shotGroupId: 'shot-group-1',
      itemIndex: index,
      title: `镜头 ${index + 1}`,
      prompt: null,
      imageUrl: null,
      sourcePanelId: null,
    })),
    ...(overrides || {}),
  }
}

describe('api specific - novel promotion multi-shot drafts route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createCalls = []
    routeState.updateCalls = []
    routeState.storyboardCreateCalls = 0
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-1', start: 0, end: 60, duration: 60 }),
        buildClip({ id: 'clip-2', start: 60, end: 120, duration: 60, shotCount: 6, location: '天桥', summary: '第二段推进' }),
      ],
      shotGroups: [],
    }
  })

  it('returns 8 derived segment shot groups for 2 coarse clips and summary.totalSegments reflects segment count', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/multi-shot-drafts/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/multi-shot-drafts',
      method: 'POST',
      body: { episodeId: 'episode-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      shotGroups: ShotGroupRecord[]
      summary: { totalSegments: number; createdCount: number; reusedCount: number; placeholderCount: number }
    }

    expect(res.status).toBe(200)
    expect(json.shotGroups).toHaveLength(8)
    expect(json.summary).toEqual({
      totalSegments: 8,
      createdCount: 8,
      reusedCount: 0,
      placeholderCount: 0,
    })
    const metadataList = json.shotGroups.map((group) => JSON.parse(group.videoReferencesJson || '{}').draftMetadata as DraftMetadataRecord)
    expect(metadataList.map((metadata) => metadata.segmentOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(metadataList.map((metadata) => metadata.segmentKey)).toEqual([
      'clip-1:1',
      'clip-1:2',
      'clip-1:3',
      'clip-1:4',
      'clip-2:1',
      'clip-2:2',
      'clip-2:3',
      'clip-2:4',
    ])
    expect(metadataList.filter((metadata) => metadata.sourceClipId === 'clip-1')).toHaveLength(4)
    expect(metadataList.filter((metadata) => metadata.sourceClipId === 'clip-2')).toHaveLength(4)
  })

  it('creates placeholder shot groups per 15-second segment slot and increments placeholderCount', async () => {
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-placeholder', start: 0, end: 60, duration: 60, content: '   ', location: null, screenplay: null }),
      ],
      shotGroups: [],
    }

    const mod = await import('@/app/api/novel-promotion/[projectId]/multi-shot-drafts/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/multi-shot-drafts',
      method: 'POST',
      body: { episodeId: 'episode-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      shotGroups: ShotGroupRecord[]
      summary: { placeholderCount: number }
    }

    expect(res.status).toBe(200)
    expect(json.shotGroups).toHaveLength(4)
    expect(json.summary.placeholderCount).toBe(4)
    expect(json.shotGroups[0].groupPrompt).toBeNull()
    expect(json.shotGroups[0].videoPrompt).toBeNull()
    const metadataList = json.shotGroups.map((group) => JSON.parse(group.videoReferencesJson || '{}').draftMetadata as DraftMetadataRecord)
    expect(metadataList.every((metadata) => metadata.sourceStatus === 'placeholder')).toBe(true)
    expect(metadataList.every((metadata) => metadata.placeholderReason === 'missing_clip_content')).toBe(true)
    expect(metadataList.map((metadata) => metadata.segmentKey)).toEqual([
      'clip-placeholder:1',
      'clip-placeholder:2',
      'clip-placeholder:3',
      'clip-placeholder:4',
    ])
  })

  it('reuses only exact derived segments and keeps 4 segment rows per coarse clip distinct', async () => {
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-1', start: 0, end: 60, duration: 60 }),
        buildClip({ id: 'clip-2', start: 60, end: 120, duration: 60 }),
      ],
      shotGroups: [
        buildShotGroup({
          id: 'shot-group-reused',
          compositeImageUrl: 'cos/composite.png',
          videoReferencesJson: JSON.stringify({
            configVersion: 2,
            mode: 'smart-multi-frame',
            generateAudio: false,
            includeDialogue: false,
            dialogueLanguage: 'zh',
            draftMetadata: buildDraftMetadata({
              clipId: 'clip-1',
              sourceClipId: 'clip-1',
              segmentKey: 'clip-1:1',
              segmentIndexWithinClip: 1,
              segmentOrder: 1,
              segmentStartSeconds: 0,
              segmentEndSeconds: 15,
              sceneLabel: '雨夜街口',
            }),
          }),
        }),
        buildShotGroup({
          id: 'shot-group-patch',
          compositeImageUrl: null,
          videoReferencesJson: JSON.stringify({
            configVersion: 2,
            mode: 'smart-multi-frame',
            generateAudio: false,
            includeDialogue: false,
            dialogueLanguage: 'zh',
            draftMetadata: buildDraftMetadata({
              clipId: 'clip-2',
              segmentKey: undefined,
              sourceClipId: undefined,
              segmentIndexWithinClip: 1,
              segmentOrder: 5,
              segmentStartSeconds: undefined,
              segmentEndSeconds: undefined,
              sceneLabel: '旧天桥',
            }),
          }),
        }),
      ],
    }

    const mod = await import('@/app/api/novel-promotion/[projectId]/multi-shot-drafts/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/multi-shot-drafts',
      method: 'POST',
      body: { episodeId: 'episode-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      shotGroups: ShotGroupRecord[]
      summary: { totalSegments: number; createdCount: number; reusedCount: number; placeholderCount: number }
    }

    expect(res.status).toBe(200)
    expect(json.summary).toEqual({
      totalSegments: 8,
      createdCount: 6,
      reusedCount: 1,
      placeholderCount: 0,
    })
    expect(routeState.createCalls).toHaveLength(6)
    expect(routeState.updateCalls).toHaveLength(2)
    expect(routeState.storyboardCreateCalls).toBe(0)
    expect(json.shotGroups).toHaveLength(8)
    const metadataList = json.shotGroups.map((group) => JSON.parse(group.videoReferencesJson || '{}').draftMetadata as DraftMetadataRecord)
    expect(new Set(metadataList.map((metadata) => metadata.segmentKey)).size).toBe(8)
    expect(metadataList.filter((metadata) => metadata.clipId === 'clip-1')).toHaveLength(4)
    expect(metadataList.filter((metadata) => metadata.clipId === 'clip-2')).toHaveLength(4)
  })

  it('preserves saved editable metadata when multi-shot drafts are rebuilt', async () => {
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-1', start: 0, end: 60, duration: 60, location: '新雨夜街口' }),
      ],
      shotGroups: [
        buildShotGroup({
          id: 'shot-group-editable',
          videoReferencesJson: JSON.stringify({
            configVersion: 2,
            mode: 'smart-multi-frame',
            generateAudio: false,
            includeDialogue: true,
            dialogueLanguage: 'zh',
            draftMetadata: buildDraftMetadata({
              clipId: 'clip-1',
              sourceClipId: 'clip-1',
              segmentKey: 'stale-key',
              segmentIndexWithinClip: 1,
              segmentOrder: 99,
              segmentStartSeconds: 120,
              segmentEndSeconds: 135,
              sceneLabel: '旧场景',
              narrativePrompt: '旧提示词',
              embeddedDialogue: '旧台词',
              dialogueOverrideText: '保留这句用户台词',
              selectedLocationAsset: {
                assetType: 'location',
                source: 'manual',
                assetId: 'loc-1',
                label: '天台',
              },
              selectedCharacterAssets: [{
                assetType: 'character',
                source: 'manual',
                assetId: 'char-1',
                label: '林夏定妆',
              }],
              selectedPropAssets: [{
                assetType: 'prop',
                source: 'manual',
                assetId: 'prop-1',
                label: '黑伞',
              }],
              referencePromptText: '保留参考提示词',
              compositePromptText: '保留合成提示词',
              storyboardModeId: 'story-mode-1',
              storyboardModeLabel: '电影感',
              storyboardMoodPresetId: 'mood-rain',
              customMood: '潮湿压迫感',
            }),
          }),
        }),
      ],
    }

    const mod = await import('@/app/api/novel-promotion/[projectId]/multi-shot-drafts/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/multi-shot-drafts',
      method: 'POST',
      body: { episodeId: 'episode-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await res.json() as {
      shotGroups: ShotGroupRecord[]
      summary: { totalSegments: number; createdCount: number; reusedCount: number; placeholderCount: number }
    }

    expect(res.status).toBe(200)
    expect(json.summary).toEqual({
      totalSegments: 4,
      createdCount: 3,
      reusedCount: 0,
      placeholderCount: 0,
    })

    const rebuilt = json.shotGroups.find((group) => group.id === 'shot-group-editable')
    expect(rebuilt).toBeTruthy()

    const rebuiltMetadata = JSON.parse(rebuilt?.videoReferencesJson || '{}').draftMetadata as DraftMetadataRecord
    expect(rebuiltMetadata.dialogueOverrideText).toBe('保留这句用户台词')
    expect(rebuiltMetadata.selectedLocationAsset).toMatchObject({
      assetType: 'location',
      source: 'manual',
      assetId: 'loc-1',
      label: '天台',
    })
    expect(rebuiltMetadata.selectedCharacterAssets).toMatchObject([{
      assetType: 'character',
      source: 'manual',
      assetId: 'char-1',
      label: '林夏定妆',
    }])
    expect(rebuiltMetadata.selectedPropAssets).toMatchObject([{
      assetType: 'prop',
      source: 'manual',
      assetId: 'prop-1',
      label: '黑伞',
    }])
    expect(rebuiltMetadata.storyboardModeId).toBe('story-mode-1')
    expect(rebuiltMetadata.storyboardModeLabel).toBe('电影感')
    expect(rebuiltMetadata.storyboardMoodPresetId).toBe('mood-rain')
    expect(rebuiltMetadata.customMood).toBe('潮湿压迫感')
    expect(rebuiltMetadata.referencePromptText).toBe('保留参考提示词')
    expect(rebuiltMetadata.compositePromptText).toBe('保留合成提示词')

    expect(rebuiltMetadata.segmentKey).toBe('clip-1:1')
    expect(rebuiltMetadata.segmentOrder).toBe(1)
    expect(rebuiltMetadata.segmentIndexWithinClip).toBe(1)
    expect(rebuiltMetadata.segmentStartSeconds).toBe(0)
    expect(rebuiltMetadata.segmentEndSeconds).toBe(15)
    expect(rebuiltMetadata.sceneLabel).toBe('新雨夜街口')

    const persisted = routeState.episode?.shotGroups.find((group) => group.id === 'shot-group-editable')
    const persistedMetadata = JSON.parse(persisted?.videoReferencesJson || '{}').draftMetadata as DraftMetadataRecord
    expect(persistedMetadata.dialogueOverrideText).toBe('保留这句用户台词')
    expect(persistedMetadata.selectedLocationAsset?.assetId).toBe('loc-1')
    expect(persistedMetadata.storyboardModeId).toBe('story-mode-1')
    expect(persistedMetadata.customMood).toBe('潮湿压迫感')
    expect(persistedMetadata.segmentKey).toBe('clip-1:1')
    expect(persistedMetadata.segmentStartSeconds).toBe(0)
    expect(persistedMetadata.segmentEndSeconds).toBe(15)
  })
})
