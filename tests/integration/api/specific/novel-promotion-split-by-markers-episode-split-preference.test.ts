import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1', email: 'user@example.com' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findFirst: vi.fn(async () => ({
      projectId: 'project-1',
      episodeSplitPreference: 'scene_group_3',
      project: { name: 'Project 1' },
    })),
  },
}))

const detectorMock = vi.hoisted(() => ({
  detectEpisodeMarkers: vi.fn(() => ({
    hasMarkers: true,
    markerType: '场景编号分组',
    markerTypeKey: 'sceneNumberGrouping',
    confidence: 'medium' as const,
    matches: [
      { index: 0, text: '场景01', episodeNumber: 1 },
      { index: 120, text: '场景02', episodeNumber: 2 },
    ],
    previewSplits: [
      { number: 1, title: '第 1 集', wordCount: 100, startIndex: 0, endIndex: 120, preview: '预览1' },
      { number: 2, title: '第 2 集', wordCount: 100, startIndex: 120, endIndex: 240, preview: '预览2' },
    ],
  })),
  splitByMarkers: vi.fn(() => ([
    { number: 1, title: '第 1 集', summary: '', content: '片段1', wordCount: 100 },
    { number: 2, title: '第 2 集', summary: '', content: '片段2', wordCount: 100 },
  ])),
}))

const logMock = vi.hoisted(() => ({
  logUserAction: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/episode-marker-detector', () => detectorMock)
vi.mock('@/lib/logging/semantic', () => logMock)

const baseContent = `${'场景01\n这一段用于测试分集偏好。'.repeat(10)}\n${'补充内容。'.repeat(20)}`

describe('api specific - novel promotion split by markers episode split preference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionProject.findFirst.mockResolvedValue({
      projectId: 'project-1',
      episodeSplitPreference: 'scene_group_3',
      project: { name: 'Project 1' },
    })
  })

  it('uses saved project episodeSplitPreference when body omits it', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/split-by-markers/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes/split-by-markers',
      method: 'POST',
      body: { content: baseContent },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(detectorMock.detectEpisodeMarkers).toHaveBeenCalledWith(
      baseContent,
      { episodeSplitPreference: 'scene_group_3' },
    )
  })

  it('uses the request body episodeSplitPreference as an override', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/episodes/split-by-markers/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/episodes/split-by-markers',
      method: 'POST',
      body: {
        content: baseContent,
        episodeSplitPreference: 'scene_group_2',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(detectorMock.detectEpisodeMarkers).toHaveBeenCalledWith(
      baseContent,
      { episodeSplitPreference: 'scene_group_2' },
    )
  })
})
