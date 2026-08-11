import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const auth = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn(() => false),
}))
const semantics = vi.hoisted(() => ({
  updateRemakeShotSemantics: vi.fn(async () => ({
    semantics: {
      shotType: '平视中景',
      cameraMove: '固定',
      description: '中景：机舱内部，萨姆坐在靠窗位置看着腕表',
      moodPresetId: 'tranquil-ethereal-fantasy',
      customMood: '潮湿闷热',
      sceneTag: '机舱内部_白天',
      characterTags: ['萨姆', '我'],
    },
  })),
}))
vi.mock('@/lib/api-auth', () => auth)
vi.mock('@/lib/remake-projects/semantics/service', () => semantics)

describe('remake shot semantics API', () => {
  it('updates all semantics fields via PATCH', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/shots/[shotId]/semantics/route')
    const response = await route.PATCH(
      buildMockRequest({
        path: '/api/remake-projects/project-1/shots/shot-1/semantics',
        method: 'PATCH',
        body: {
          shotType: '平视中景',
          cameraMove: '固定',
          description: '中景：机舱内部，萨姆坐在靠窗位置看着腕表',
          moodPresetId: 'tranquil-ethereal-fantasy',
          customMood: '潮湿闷热',
          sceneTag: '机舱内部_白天',
          characterTags: ['萨姆', '我'],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1', shotId: 'shot-1' }) },
    )
    expect(response.status).toBe(200)
    expect(semantics.updateRemakeShotSemantics).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotId: 'shot-1',
      userId: 'user-1',
      shotType: '平视中景',
      cameraMove: '固定',
      description: '中景：机舱内部，萨姆坐在靠窗位置看着腕表',
      moodPresetId: 'tranquil-ethereal-fantasy',
      customMood: '潮湿闷热',
      sceneTag: '机舱内部_白天',
      characterTags: ['萨姆', '我'],
    })
    const data = await response.json()
    expect(data.semantics.shotType).toBe('平视中景')
    expect(data.semantics.characterTags).toEqual(['萨姆', '我'])
  })

  it('accepts partial updates', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/shots/[shotId]/semantics/route')
    const response = await route.PATCH(
      buildMockRequest({
        path: '/api/remake-projects/project-1/shots/shot-1/semantics',
        method: 'PATCH',
        body: { shotType: '越肩近景' },
      }),
      { params: Promise.resolve({ projectId: 'project-1', shotId: 'shot-1' }) },
    )
    expect(response.status).toBe(200)
    expect(semantics.updateRemakeShotSemantics).toHaveBeenCalledWith(
      expect.objectContaining({ shotType: '越肩近景' }),
    )
  })
})
