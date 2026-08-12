import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))
const prisma = vi.hoisted(() => ({
  remakeProject: {
    findUnique: vi.fn(async () => ({
      currentSource: { sourceRevision: 1 },
      shots: [{
        revisions: [{ lifecycleState: 'active', sourceRevision: 1, keyframeMediaRefs: '{}', payload: '{}' }],
        outputs: [{ mediaId: 'images/remake/project-1/keyframes/candidate.jpg' }],
      }],
    })),
  },
}))
const media = vi.hoisted(() => ({ getMediaObjectById: vi.fn(async () => null) }))
const storage = vi.hoisted(() => ({ getObjectBuffer: vi.fn(async () => Buffer.from('candidate-image')) }))

vi.mock('@/lib/api-auth', () => auth)
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/media/service', () => media)
vi.mock('@/lib/storage', () => storage)

describe('remake SceneDetect media route', () => {
  it('serves a legacy candidate whose output version stores a storage key', async () => {
    const { GET } = await import('@/app/api/remake-projects/[projectId]/scenedetect/media/[mediaId]/route')
    const mediaId = 'images/remake/project-1/keyframes/candidate.jpg'

    const response = await GET(
      new NextRequest(`http://localhost/api/remake-projects/project-1/scenedetect/media/${encodeURIComponent(mediaId)}`),
      { params: Promise.resolve({ projectId: 'project-1', mediaId }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(storage.getObjectBuffer).toHaveBeenCalledWith(mediaId)
  })
})
