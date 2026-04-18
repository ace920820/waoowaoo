import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const storageMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn((key: string) => `signed://${key}`),
  toFetchableUrl: vi.fn((url: string) => `https://fetchable.example/${encodeURIComponent(url)}`),
}))

const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn(async (value: string) => {
  if (value === '/m/video-public-id') return 'video/storage/from-media.mp4'
  if (value === 'video/storage/raw-key.mp4') return 'video/storage/raw-key.mp4'
  return null
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

describe('api specific - video proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

      return new Response('video-data', {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '10',
          'x-fetch-url': url,
        },
      })
    }) as unknown as typeof fetch)
  })

  it('signs and fetches a raw storage key', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/video-proxy/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/video-proxy',
      method: 'GET',
      query: { key: 'video/storage/raw-key.mp4' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('video/storage/raw-key.mp4')
    expect(storageMock.getSignedUrl).toHaveBeenCalledWith('video/storage/raw-key.mp4', 3600)
    expect(fetch).toHaveBeenCalledWith('https://fetchable.example/signed%3A%2F%2Fvideo%2Fstorage%2Fraw-key.mp4')
  })

  it('resolves media route values before signing', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/video-proxy/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/video-proxy',
      method: 'GET',
      query: { key: '/m/video-public-id' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('/m/video-public-id')
    expect(storageMock.getSignedUrl).toHaveBeenCalledWith('video/storage/from-media.mp4', 3600)
    expect(fetch).toHaveBeenCalledWith('https://fetchable.example/signed%3A%2F%2Fvideo%2Fstorage%2Ffrom-media.mp4')
  })

  it('passes through http urls without signing', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/video-proxy/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/video-proxy',
      method: 'GET',
      query: { key: 'https://cdn.example.com/video.mp4' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(resolveStorageKeyFromMediaValueMock).not.toHaveBeenCalled()
    expect(storageMock.getSignedUrl).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/video.mp4')
  })
})
