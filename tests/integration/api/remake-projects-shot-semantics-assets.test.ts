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
      description: '中景：机舱内部',
      moodPresetId: 'tranquil-ethereal-fantasy',
      customMood: null,
      sceneAssetId: 'scene-cabin-day',
      characterAssetIds: ['char-sam', 'char-me'],
      propAssetIds: ['prop-briefcase'],
      sceneTag: '机舱内部_白天',
      characterTags: ['萨姆', '我'],
    },
  })),
}))
vi.mock('@/lib/api-auth', () => auth)
vi.mock('@/lib/remake-projects/semantics/service', () => semantics)

describe('remake shot semantics API — asset IDs', () => {
  it('accepts scene, character, and prop asset IDs in PATCH', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/shots/[shotId]/semantics/route')
    const response = await route.PATCH(
      buildMockRequest({
        path: '/api/remake-projects/project-1/shots/shot-1/semantics',
        method: 'PATCH',
        body: {
          sceneAssetId: 'scene-cabin-day',
          characterAssetIds: ['char-sam', 'char-me'],
          propAssetIds: ['prop-briefcase'],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1', shotId: 'shot-1' }) },
    )
    expect(response.status).toBe(200)
    expect(semantics.updateRemakeShotSemantics).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneAssetId: 'scene-cabin-day',
        characterAssetIds: ['char-sam', 'char-me'],
        propAssetIds: ['prop-briefcase'],
      }),
    )
    const data = await response.json()
    expect(data.semantics.sceneAssetId).toBe('scene-cabin-day')
    expect(data.semantics.characterAssetIds).toEqual(['char-sam', 'char-me'])
    expect(data.semantics.propAssetIds).toEqual(['prop-briefcase'])
  })

  it('rejects asset IDs that are not UUID-like / valid strings', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/shots/[shotId]/semantics/route')
    const response = await route.PATCH(
      buildMockRequest({
        path: '/api/remake-projects/project-1/shots/shot-1/semantics',
        method: 'PATCH',
        body: {
          characterAssetIds: ['a'.repeat(150), 'b'],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1', shotId: 'shot-1' }) },
    )
    expect(response.status).toBe(400)
  })

  it('accepts null to clear asset binding', async () => {
    const route = await import('@/app/api/remake-projects/[projectId]/shots/[shotId]/semantics/route')
    const response = await route.PATCH(
      buildMockRequest({
        path: '/api/remake-projects/project-1/shots/shot-1/semantics',
        method: 'PATCH',
        body: { sceneAssetId: null, propAssetIds: null },
      }),
      { params: Promise.resolve({ projectId: 'project-1', shotId: 'shot-1' }) },
    )
    expect(response.status).toBe(200)
    expect(semantics.updateRemakeShotSemantics).toHaveBeenCalledWith(
      expect.objectContaining({ sceneAssetId: null, propAssetIds: null }),
    )
  })
})
