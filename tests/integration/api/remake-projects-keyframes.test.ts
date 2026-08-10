import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const auth = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))
const keyframes = vi.hoisted(() => ({
  buildKeyframeGenerationSubmission: vi.fn(async () => ({
    taskType: 'remake_keyframe_image_generate', targetType: 'remake_shot', targetId: '33333333-3333-4333-8333-333333333333',
    payload: { kind: 'keyframe' }, dedupeKey: 'remake-keyframe:one',
  })),
  setKeyframeSelection: vi.fn(async () => ({ id: 'track-1', selectedForGeneration: true })),
  getProjectKeyframeState: vi.fn(async () => ({ missingCount: 0, shots: [] })),
}))
const submitTask = vi.hoisted(() => vi.fn(async () => ({ taskId: 'task-1' })))

vi.mock('@/lib/api-auth', () => auth)
vi.mock('@/lib/remake-projects/keyframes/service', () => keyframes)
vi.mock('@/lib/task/submitter', () => ({ submitTask }))

describe('remake keyframe API', () => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const shotId = '33333333-3333-4333-8333-333333333333'

  beforeEach(() => vi.clearAllMocks())

  it('submits one authenticated selected Start slot and returns 202', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/keyframes/route')
    const response = await route.POST(buildMockRequest({ path: `/api/remake-projects/${projectId}/keyframes`, method: 'POST', body: { action: 'generate', shotId, slot: 'start', operationKey: 'generate-1', count: 1, model: 'provider::image-v1', options: { resolution: '1024x1024' }, referenceMediaIds: [] } }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ taskId: 'task-1' })
    expect(keyframes.buildKeyframeGenerationSubmission).toHaveBeenCalledWith(expect.objectContaining({ projectId, userId: 'user-1', shotId, slot: 'start' }))
    expect(submitTask).toHaveBeenCalledWith(expect.objectContaining({ type: 'remake_keyframe_image_generate', maxAttempts: 1 }))
  })

  it('rejects malformed or stale generation without creating a task', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/keyframes/route')
    const malformed = await route.POST(buildMockRequest({ path: `/api/remake-projects/${projectId}/keyframes`, method: 'POST', body: { action: 'generate', shotId, slot: 'start', operationKey: 'x', count: 5 } }), { params: Promise.resolve({ projectId }) })
    expect(malformed.status).toBe(400)
    keyframes.buildKeyframeGenerationSubmission.mockRejectedValueOnce(new Error('REMAKE_KEYFRAME_INPUT_STALE'))
    const stale = await route.POST(buildMockRequest({ path: `/api/remake-projects/${projectId}/keyframes`, method: 'POST', body: { action: 'generate', shotId, slot: 'start', operationKey: 'x', count: 1, model: 'provider::image-v1', options: {}, referenceMediaIds: [] } }), { params: Promise.resolve({ projectId }) })
    expect(stale.status).toBe(409)
    expect(submitTask).not.toHaveBeenCalled()
  })
})
