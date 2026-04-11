import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  status: 'queued',
  deduped: false,
})))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(async () => ({
      id: 'panel-1',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
      location: 'Old Town',
    })),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      characters: [
        {
          id: 'character-1',
          name: 'Hero',
          appearances: [
            {
              changeReason: 'default',
              imageUrl: 'cos/hero-default.png',
              imageUrls: JSON.stringify(['cos/hero-default.png']),
              selectedIndex: 0,
            },
          ],
        },
      ],
      locations: [
        {
          id: 'location-1',
          name: 'Old Town',
          selectedImageId: 'location-image-1',
          images: [
            {
              id: 'location-image-1',
              isSelected: true,
              imageUrl: 'cos/old-town.png',
            },
          ],
        },
      ],
    })),
  },
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    storyboardModel: 'img::storyboard',
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({})),
}))

const apiConfigMock = vi.hoisted(() => ({
  resolveModelSelection: vi.fn(async () => ({ modelKey: 'img::storyboard' })),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ billable: false })),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasPanelImageOutput: vi.fn(async () => false),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - regenerate panel image readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects when current panel references missing character/location images', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      characters: [
        {
          id: 'character-1',
          name: 'Hero',
          appearances: [
            {
              changeReason: 'default',
              imageUrl: null,
              imageUrls: JSON.stringify([]),
              selectedIndex: 0,
            },
          ],
        },
      ],
      locations: [
        {
          id: 'location-1',
          name: 'Old Town',
          selectedImageId: 'location-image-1',
          images: [
            {
              id: 'location-image-1',
              isSelected: true,
              imageUrl: null,
            },
          ],
        },
      ],
    } as never)

    const mod = await import('@/app/api/novel-promotion/[projectId]/regenerate-panel-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/regenerate-panel-image',
      method: 'POST',
      body: { panelId: 'panel-1', count: 1 },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(body.error.details?.code).toBe('PANEL_REFERENCE_ASSETS_MISSING')
    expect(body.error.message).toContain('角色「Hero」缺少参考图')
    expect(body.error.message).toContain('场景「Old Town」缺少参考图')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('allows panel image submission when panel does not reference character/location assets', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      characters: null,
      location: null,
    } as never)

    const mod = await import('@/app/api/novel-promotion/[projectId]/regenerate-panel-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/regenerate-panel-image',
      method: 'POST',
      body: { panelId: 'panel-1', count: 1 },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(submitTaskMock).toHaveBeenCalledTimes(1)
  })
})
