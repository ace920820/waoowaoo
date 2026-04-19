import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type ClipRecord = {
  id: string
  start: number
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
    create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
      routeState.createCalls.push(data)
      const id = `shot-group-created-${routeState.createCalls.length}`
      const items = ((data.items?.create as Array<Record<string, unknown>> | undefined) || []).map((item, index) => ({
        id: `${id}-item-${index}`,
        shotGroupId: id,
        itemIndex: Number(item.itemIndex),
        title: typeof item.title === 'string' ? item.title : null,
        prompt: null,
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
          prompt: null,
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
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        sceneLabel: '旧场景',
        narrativePrompt: '旧提示词',
        embeddedDialogue: null,
        shotRhythmGuidance: '旧节奏',
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
      },
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
        buildClip({ id: 'clip-1', start: 0 }),
        buildClip({ id: 'clip-2', start: 15, shotCount: 6, location: '天桥', summary: '第二段推进' }),
      ],
      shotGroups: [],
    }
  })

  it('returns one shot group per ordered clip and summary.totalSegments equals the clip count', async () => {
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
    expect(json.shotGroups).toHaveLength(2)
    expect(json.summary).toEqual({
      totalSegments: 2,
      createdCount: 2,
      reusedCount: 0,
      placeholderCount: 0,
    })
    const firstMetadata = JSON.parse(json.shotGroups[0].videoReferencesJson || '{}').draftMetadata
    expect(firstMetadata.segmentOrder).toBe(1)
    expect(firstMetadata.clipId).toBe('clip-1')
  })

  it('creates placeholder shot groups for invalid clips and increments placeholderCount', async () => {
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-placeholder', start: 0, content: '   ', location: null, screenplay: null }),
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
    expect(json.summary.placeholderCount).toBe(1)
    expect(json.shotGroups[0].groupPrompt).toBeNull()
    expect(json.shotGroups[0].videoPrompt).toBeNull()
    const metadata = JSON.parse(json.shotGroups[0].videoReferencesJson || '{}').draftMetadata
    expect(metadata.sourceStatus).toBe('placeholder')
    expect(metadata.placeholderReason).toBe('missing_clip_content')
  })

  it('reuses populated shot groups and avoids storyboard creation or duplicate draft groups', async () => {
    routeState.episode = {
      id: 'episode-1',
      clips: [
        buildClip({ id: 'clip-1', start: 0 }),
        buildClip({ id: 'clip-2', start: 15 }),
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
            draftMetadata: {
              segmentOrder: 1,
              clipId: 'clip-1',
              sceneLabel: '雨夜街口',
              narrativePrompt: '旧提示词',
              embeddedDialogue: null,
              shotRhythmGuidance: '旧节奏',
              expectedShotCount: 4,
              sourceStatus: 'ready',
              placeholderReason: null,
            },
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
            draftMetadata: {
              segmentOrder: 2,
              clipId: 'clip-2',
              sceneLabel: '旧天桥',
              narrativePrompt: '旧提示词',
              embeddedDialogue: null,
              shotRhythmGuidance: '旧节奏',
              expectedShotCount: 4,
              sourceStatus: 'ready',
              placeholderReason: null,
            },
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
      totalSegments: 2,
      createdCount: 0,
      reusedCount: 1,
      placeholderCount: 0,
    })
    expect(routeState.createCalls).toHaveLength(0)
    expect(routeState.updateCalls).toHaveLength(1)
    expect(routeState.storyboardCreateCalls).toBe(0)
    expect(routeState.episode?.shotGroups).toHaveLength(2)
  })
})
