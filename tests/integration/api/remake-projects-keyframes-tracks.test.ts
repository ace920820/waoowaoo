import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const auth = vi.hoisted(() => ({ requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })), isErrorResponse: vi.fn(() => false) }))
const service = vi.hoisted(() => ({ getKeyframeTrackHistory: vi.fn(async () => ({ trackId: 'track-1', adoptedCandidateId: null, batches: [] })), adoptKeyframeCandidate: vi.fn(async () => ({ id: 'track-1', adoptedCandidateId: 'candidate-1' })) }))
vi.mock('@/lib/api-auth', () => auth)
vi.mock('@/lib/remake-projects/keyframes/service', () => service)

describe('remake keyframe track API', () => {
  it('reads history without adopting', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/keyframes/tracks/[trackId]/route')
    const response = await route.GET(buildMockRequest({ path: '/api/remake-projects/project-1/keyframes/tracks/track-1', method: 'GET' }), { params: Promise.resolve({ projectId: 'project-1', trackId: 'track-1' }) })
    expect(response.status).toBe(200)
    expect(service.getKeyframeTrackHistory).toHaveBeenCalledWith({ projectId: 'project-1', userId: 'user-1', trackId: 'track-1' })
    expect(service.adoptKeyframeCandidate).not.toHaveBeenCalled()
  })

  it('requires an explicit adopt mutation', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/keyframes/tracks/[trackId]/route')
    const response = await route.POST(buildMockRequest({ path: '/api/remake-projects/project-1/keyframes/tracks/track-1', method: 'POST', body: { action: 'adopt', candidateId: 'candidate-1' } }), { params: Promise.resolve({ projectId: 'project-1', trackId: 'track-1' }) })
    expect(response.status).toBe(200)
    expect(service.adoptKeyframeCandidate).toHaveBeenCalledWith({ projectId: 'project-1', userId: 'user-1', trackId: 'track-1', candidateId: 'candidate-1' })
  })
})
