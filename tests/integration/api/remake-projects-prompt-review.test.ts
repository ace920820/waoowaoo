import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } }, project: { id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const promptService = vi.hoisted(() => ({
  getPromptTrackDetail: vi.fn<(...args: never[]) => Promise<unknown>>(async () => ({
    track: { id: '22222222-2222-4222-8222-222222222222', shotId: '66666666-6666-4666-8666-666666666666', targetKey: 'image:start', latestVersion: 2, adoptedVersion: 1, needsReview: false },
    history: [{ id: '33333333-3333-4333-8333-333333333333', versionNumber: 2, source: 'human', reviewStatus: 'pending_review', isAdopted: false, coreText: 'new prompt', negativeConstraints: ['blur'], createdAt: '2026-08-09T00:00:00.000Z', provenance: {} }],
    selected: [],
  })),
  savePromptHumanEdit: vi.fn(async () => ({ id: '44444444-4444-4444-8444-444444444444', versionNumber: 3, status: 'pending_review' })),
  approveAndAdoptPromptVersion: vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', adoptedVersionId: '33333333-3333-4333-8333-333333333333' })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/remake-projects/prompt/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/remake-projects/prompt/service')>()),
  ...promptService,
}))

describe('remake prompt review track route', () => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const trackId = '22222222-2222-4222-8222-222222222222'
  const versionId = '33333333-3333-4333-8333-333333333333'

  beforeEach(() => vi.clearAllMocks())

  it('returns bounded history and only explicitly selected full versions for an authorized track', async () => {
    promptService.getPromptTrackDetail.mockResolvedValueOnce({
      track: { id: trackId, shotId: '66666666-6666-4666-8666-666666666666', targetKey: 'image:start', latestVersion: 2, adoptedVersion: 1, needsReview: false },
      history: [{ id: versionId, versionNumber: 2, source: 'human', reviewStatus: 'pending_review', isAdopted: false, coreText: 'new prompt', negativeConstraints: ['blur'], createdAt: '2026-08-09T00:00:00.000Z', provenance: {} }],
      selected: [{ id: versionId, rawOutput: 'raw model output', parsedOutput: { integratedGenerationPrompt: 'new prompt' } }],
    })
    const route = await import('@/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route')
    const response = await route.GET(buildMockRequest({ path: `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`, method: 'GET', query: { versionId } }), { params: Promise.resolve({ projectId, trackId }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ history: [expect.not.objectContaining({ rawOutput: expect.anything() })], selected: [{ id: versionId, rawOutput: 'raw model output' }] })
    expect(promptService.getPromptTrackDetail).toHaveBeenCalledWith({ projectId, userId: 'user-1', trackId, versionIds: [versionId] })
  })

  it('supports an explicit two-version comparison without changing adoption', async () => {
    const otherVersionId = '55555555-5555-4555-8555-555555555555'
    const route = await import('@/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route')
    const response = await route.GET(buildMockRequest({ path: `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`, method: 'GET', query: { compare: `${versionId},${otherVersionId}` } }), { params: Promise.resolve({ projectId, trackId }) })

    expect(response.status).toBe(200)
    expect(promptService.getPromptTrackDetail).toHaveBeenCalledWith({ projectId, userId: 'user-1', trackId, versionIds: [versionId, otherVersionId] })
    expect(promptService.approveAndAdoptPromptVersion).not.toHaveBeenCalled()
  })

  it('appends a human edit and requires PATCH for approval and adoption', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route')
    const post = await route.POST(buildMockRequest({ path: `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`, method: 'POST', body: { sourceVersionId: versionId, coreText: 'edited prompt', negativeConstraints: ['text'] } }), { params: Promise.resolve({ projectId, trackId }) })
    expect(post.status).toBe(201)
    expect(promptService.savePromptHumanEdit).toHaveBeenCalledWith(expect.objectContaining({ projectId, userId: 'user-1', trackId, sourceVersionId: versionId, coreText: 'edited prompt' }))
    expect(promptService.approveAndAdoptPromptVersion).not.toHaveBeenCalled()

    const patch = await route.PATCH(buildMockRequest({ path: `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`, method: 'PATCH', body: { versionId } }), { params: Promise.resolve({ projectId, trackId }) })
    expect(patch.status).toBe(200)
    expect(promptService.approveAndAdoptPromptVersion).toHaveBeenCalledWith({ projectId, shotId: expect.any(String), versionId, reviewerId: 'user-1' })
  })

  it('does not expose a cross-project track when the authorized projection is absent', async () => {
    promptService.getPromptTrackDetail.mockResolvedValueOnce(null)
    const route = await import('@/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route')
    const response = await route.GET(buildMockRequest({ path: `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`, method: 'GET' }), { params: Promise.resolve({ projectId, trackId }) })
    expect(response.status).toBe(404)
  })
})
