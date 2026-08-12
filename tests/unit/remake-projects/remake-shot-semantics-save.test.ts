import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const findUnique = vi.fn()
  const update = vi.fn()
  const count = vi.fn()
  return { findUnique, update, count }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    remakeShot: { findUnique: mocks.findUnique, update: mocks.update },
    novelPromotionProject: { findUnique: mocks.findUnique },
    novelPromotionCharacter: { count: mocks.count },
    novelPromotionLocation: { findFirst: mocks.findUnique, count: mocks.count },
  },
}))

describe('updateRemakeShotSemantics ownership check', () => {
  beforeEach(() => vi.clearAllMocks())

  // `shot.remakeProjectId` (remake_projects row id) differs from the owning project id.
  // The service must compare against project.id (from the relation), not remakeProjectId.
  it('persists when the owning project id matches input.projectId (regression)', async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ // remakeShot.findUnique
        id: 'shot-1',
        remakeProjectId: 'rp-row-1',
        remakeProject: { project: { id: 'project-1', userId: 'user-1', type: 'remake' } },
      })
      .mockResolvedValueOnce({ id: 'novel-1' }) // novelPromotionProject.findUnique
    mocks.count.mockResolvedValue(1) // character asset count
    mocks.update.mockResolvedValue({
      id: 'shot-1', sceneAssetId: null, characterAssetIds: JSON.stringify(['char-1']), propAssetIds: null,
      shotType: null, cameraMove: null, description: null, moodPresetId: null, customMood: null,
      sceneTag: null, characterTags: null,
    })

    const { updateRemakeShotSemantics } = await import('@/lib/remake-projects/semantics/service')
    const result = await updateRemakeShotSemantics({
      projectId: 'project-1', shotId: 'shot-1', userId: 'user-1', characterAssetIds: ['char-1'],
    })
    expect(result).not.toBeNull()
    expect(mocks.update).toHaveBeenCalled()
  })

  it('returns null when the owning project id does not match input.projectId', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'shot-1',
      remakeProjectId: 'rp-row-1',
      remakeProject: { project: { id: 'project-1', userId: 'user-1', type: 'remake' } },
    })
    const { updateRemakeShotSemantics } = await import('@/lib/remake-projects/semantics/service')
    const result = await updateRemakeShotSemantics({
      projectId: 'other-project', shotId: 'shot-1', userId: 'user-1', characterAssetIds: ['char-1'],
    })
    expect(result).toBeNull()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
