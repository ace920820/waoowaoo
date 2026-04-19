import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async () => ({
    novelData: { id: 'np-1', projectId: 'project-1' },
  })),
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
    novelData: { id: 'np-1', projectId: 'project-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const routeState = vi.hoisted(() => ({
  episode: {
    id: 'episode-1',
    novelPromotionProjectId: 'np-1',
    episodeNumber: 1,
    name: '第 1 集',
    description: null as string | null,
    novelText: '第一章内容',
    episodeProductionMode: 'multi_shot',
    storyboardDefaultMoodPresetId: null as string | null,
    audioUrl: null as string | null,
    srtContent: null as string | null,
    clips: [],
    storyboards: [],
    shotGroups: [],
    shots: [],
    voiceLines: [],
  },
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findMany: vi.fn(async () => [routeState.episode]),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => routeState.episode),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.name === '第 2 集' ? 'episode-2' : 'episode-1',
      novelPromotionProjectId: 'np-1',
      episodeNumber: Number(data.episodeNumber),
      name: data.name,
      description: data.description ?? null,
      novelText: data.novelText ?? null,
      episodeProductionMode: data.episodeProductionMode,
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      routeState.episode = {
        ...routeState.episode,
        ...data,
      }
      return routeState.episode
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  novelPromotionProject: {
    findFirst: vi.fn(async () => ({ id: 'np-1', projectId: 'project-1' })),
    update: vi.fn(async () => ({ id: 'np-1', lastEpisodeId: 'episode-1' })),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => await Promise.all(operations)),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logging/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logging/core')>()
  return {
    ...actual,
    logError: vi.fn(),
    createScopedLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }
})
vi.mock('@/lib/media/attach', () => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))
vi.mock('@/lib/media/service', () => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => null),
}))
vi.mock('@/lib/novel-promotion/panel-speech-plan', () => ({
  attachSpeechPlanToStoryboards: vi.fn(({ storyboards }: { storyboards: unknown[] }) => storyboards),
}))
vi.mock('@/lib/storyboard-mood-presets', () => ({
  normalizeStoryboardMoodText: vi.fn((value: string | null | undefined) => value ?? null),
}))

describe('api contract - novel promotion episode production mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.episode = {
      id: 'episode-1',
      novelPromotionProjectId: 'np-1',
      episodeNumber: 1,
      name: '第 1 集',
      description: null,
      novelText: '第一章内容',
      episodeProductionMode: 'multi_shot',
      storyboardDefaultMoodPresetId: null,
      audioUrl: null,
      srtContent: null,
      clips: [],
      storyboards: [],
      shotGroups: [],
      shots: [],
      voiceLines: [],
    }
  })

  it('defaults POST create to multi_shot when production mode is omitted', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes',
      method: 'POST',
      body: {
        name: '第 1 集',
        novelText: '第一章内容',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(201)
    expect(prismaMock.novelPromotionEpisode.create).toHaveBeenCalledWith({
      data: {
        novelPromotionProjectId: 'np-1',
        episodeNumber: 1,
        name: '第 1 集',
        description: null,
        episodeProductionMode: 'multi_shot',
        novelText: '第一章内容',
      },
    })
  })

  it('defaults batch-created episodes to multi_shot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/batch/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes/batch',
      method: 'POST',
      body: {
        episodes: [
          { name: '第 1 集', novelText: '第一章内容' },
          { name: '第 2 集', novelText: '第二章内容' },
        ],
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionEpisode.create).toHaveBeenNthCalledWith(1, {
      data: {
        novelPromotionProjectId: 'np-1',
        episodeNumber: 1,
        name: '第 1 集',
        description: null,
        novelText: '第一章内容',
        episodeProductionMode: 'multi_shot',
      },
    })
    expect(prismaMock.novelPromotionEpisode.create).toHaveBeenNthCalledWith(2, {
      data: {
        novelPromotionProjectId: 'np-1',
        episodeNumber: 2,
        name: '第 2 集',
        description: null,
        novelText: '第二章内容',
        episodeProductionMode: 'multi_shot',
      },
    })
  })

  it('PATCH persists and returns a valid episodeProductionMode', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes/episode-1',
      method: 'PATCH',
      body: {
        episodeProductionMode: 'traditional',
      },
    })

    const res = await mod.PATCH(req, {
      params: Promise.resolve({ projectId: 'project-1', episodeId: 'episode-1' }),
    })
    const json = await res.json() as { episode: { episodeProductionMode: string } }

    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionEpisode.update).toHaveBeenCalledWith({
      where: { id: 'episode-1' },
      data: { episodeProductionMode: 'traditional' },
    })
    expect(json.episode.episodeProductionMode).toBe('traditional')
  })

  it('GET episode payload exposes episodeProductionMode for workspace consumers', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes/episode-1',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ projectId: 'project-1', episodeId: 'episode-1' }),
    })
    const json = await res.json() as { episode: { episodeProductionMode: string } }

    expect(res.status).toBe(200)
    expect(json.episode.episodeProductionMode).toBe('multi_shot')
  })
})
