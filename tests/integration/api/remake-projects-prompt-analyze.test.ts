import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const shot = {
  id: '33333333-3333-4333-8333-333333333333', stableKey: 'shot-1', currentRevision: 2, needsReview: false,
  revisions: [{ id: '44444444-4444-4444-8444-444444444444', revision: 2, lifecycleState: 'active', sourceRevision: 1, payload: JSON.stringify({ status: 'keep' }), keyframeMediaRefs: JSON.stringify({ first: 'frames/first.jpg', middle: 'frames/middle.jpg', last: 'frames/last.jpg' }) }],
}
const prismaMock = vi.hoisted(() => ({ project: { findUnique: vi.fn() } }))
const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({ taskId: 'task-1' })))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/api-auth', () => ({ requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })), isErrorResponse: vi.fn((value: unknown) => value instanceof Response) }))

describe('POST /api/remake-projects/[projectId]/prompts/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.project.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', type: 'remake', remakeProject: { id: '22222222-2222-4222-8222-222222222222', currentSource: { id: 'source-1', sourceRevision: 1, status: 'analyzed' }, shots: [shot] } })
  })

  it('submits exactly one authenticated image Shot/slot task', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/prompts/analyze/route')
    const response = await POST(new NextRequest('http://localhost/api/remake-projects/11111111-1111-4111-8111-111111111111/prompts/analyze', { method: 'POST', body: JSON.stringify({ kind: 'image', shotId: shot.id, slot: 'start', operationKey: 'click-1' }) }), { params: Promise.resolve({ projectId: '11111111-1111-4111-8111-111111111111' }) })
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ taskId: 'task-1' })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'remake_shot', targetId: shot.id, maxAttempts: 1 }))
  })

  it('submits a Prompt task for an untouched automatic Shot with complete keyframes', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      type: 'remake',
      remakeProject: {
        id: '22222222-2222-4222-8222-222222222222',
        currentSource: { id: 'source-1', sourceRevision: 1, status: 'analyzed' },
        shots: [{ ...shot, revisions: [{ ...shot.revisions[0], payload: JSON.stringify({ status: 'pending' }) }] }],
      },
    })
    const { POST } = await import('@/app/api/remake-projects/[projectId]/prompts/analyze/route')
    const response = await POST(new NextRequest('http://localhost/api/remake-projects/11111111-1111-4111-8111-111111111111/prompts/analyze', { method: 'POST', body: JSON.stringify({ kind: 'image', shotId: shot.id, slot: 'middle', operationKey: 'automatic-shot' }) }), { params: Promise.resolve({ projectId: '11111111-1111-4111-8111-111111111111' }) })
    expect(response.status).toBe(202)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({ targetId: shot.id }))
  })

  it('rejects extra body fields and incomplete whole-video input before task creation', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/prompts/analyze/route')
    const invalid = await POST(new NextRequest('http://localhost/api/remake-projects/project/prompts/analyze', { method: 'POST', body: JSON.stringify({ kind: 'image', shotId: shot.id, slot: 'start', operationKey: 'click-1', fingerprint: 'client' }) }), { params: Promise.resolve({ projectId: '11111111-1111-4111-8111-111111111111' }) })
    expect(invalid.status).toBe(400)
    prismaMock.project.findUnique.mockResolvedValueOnce({ id: 'project', type: 'remake', remakeProject: { id: 'remake', currentSource: { id: 'source', sourceRevision: 1 }, shots: [{ ...shot, needsReview: true }] } })
    const incomplete = await POST(new NextRequest('http://localhost/api/remake-projects/project/prompts/analyze', { method: 'POST', body: JSON.stringify({ kind: 'video', operationKey: 'video-1' }) }), { params: Promise.resolve({ projectId: 'project' }) })
    expect(incomplete.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
  })
})
