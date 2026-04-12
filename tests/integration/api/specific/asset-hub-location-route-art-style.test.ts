import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalLocation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  globalAssetFolder: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - asset hub location route artStyle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      userId: 'user-1',
    })
    prismaMock.globalLocation.update.mockResolvedValue({
      id: 'location-1',
      artStyle: 'realistic',
      images: [],
    })
  })

  it('PATCH persists artStyle on asset-hub locations', async () => {
    const mod = await import('@/app/api/asset-hub/locations/[locationId]/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/locations/location-1',
      method: 'PATCH',
      body: {
        artStyle: 'realistic',
      },
    })

    const res = await mod.PATCH(req, {
      params: Promise.resolve({ locationId: 'location-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prismaMock.globalLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: { artStyle: 'realistic' },
      include: { images: true },
    })
    expect(body).toEqual({
      success: true,
      location: {
        id: 'location-1',
        artStyle: 'realistic',
        images: [],
      },
    })
  })
})
