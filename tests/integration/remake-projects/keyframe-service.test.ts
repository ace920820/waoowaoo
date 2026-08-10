import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  remakeShot: { findFirst: vi.fn() },
  remakeKeyframeTrack: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  remakeKeyframeBatch: { findMany: vi.fn() },
  remakeKeyframeCandidate: { findFirst: vi.fn() },
  remakeKeyframeAdoptionEvent: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/remake-projects/prompt/service', () => ({ getAdoptedPromptForGeneration: vi.fn(async () => ({ id: 'prompt-1', shotRevisionId: 'revision-1', integratedGenerationPrompt: 'approved prompt' })) }))
vi.mock('@/lib/config-service', () => ({ getProjectModelConfig: vi.fn(async () => ({ storyboardModel: 'provider::image-v1' })), resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({ resolution: '1024x1024' })) }))

describe('remake keyframe service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.project.findFirst.mockResolvedValue({ id: 'project-1' })
    db.remakeShot.findFirst.mockResolvedValue({ id: 'shot-1', remakeProjectId: 'remake-1', stableKey: 'shot-1', currentRevision: 1, remakeProject: { currentSource: { sourceRevision: 1 } }, revisions: [{ id: 'revision-1', revision: 1, sourceRevision: 1, lifecycleState: 'active', keyframeMediaRefs: '{}' }] })
    db.remakeKeyframeTrack.findUnique.mockResolvedValue({ id: 'track-1', selectedForGeneration: true, adoptedCandidateId: null })
    db.remakeKeyframeTrack.findFirst.mockResolvedValue({ id: 'track-1', selectedForGeneration: true, adoptedCandidateId: null, shotRevision: { revision: 1, lifecycleState: 'active', shot: { id: 'shot-1', currentRevision: 1, remakeProject: { projectId: 'project-1' } } } })
  })

  it('persists current-revision selection and rejects an unapproved slot', async () => {
    const service = await import('@/lib/remake-projects/keyframes/service')
    await service.setKeyframeSelection({ projectId: 'project-1', userId: 'user-1', shotId: 'shot-1', slot: 'start', selected: true })
    expect(db.remakeKeyframeTrack.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { shotRevisionId_slot: { shotRevisionId: 'revision-1', slot: 'start' } }, create: expect.objectContaining({ selectedForGeneration: true }) }))
    db.remakeKeyframeTrack.findUnique.mockResolvedValueOnce(null)
    await expect(service.buildKeyframeGenerationSubmission({ projectId: 'project-1', userId: 'user-1', shotId: 'shot-1', slot: 'middle', operationKey: 'op-1', count: 1, model: 'provider::image-v1', options: {}, referenceMediaIds: [] })).rejects.toThrow('REMAKE_KEYFRAME_SLOT_NOT_SELECTED')
  })

  it('adopts only an authorized candidate and records the replacement event', async () => {
    db.remakeKeyframeCandidate.findFirst.mockResolvedValue({ id: 'candidate-2', batch: { trackId: 'track-1' }, outputVersion: { invalidatedAt: null, status: 'completed' } })
    const service = await import('@/lib/remake-projects/keyframes/service')
    db.remakeKeyframeTrack.update.mockResolvedValue({ id: 'track-1', adoptedCandidateId: 'candidate-2' })
    await expect(service.adoptKeyframeCandidate({ projectId: 'project-1', userId: 'user-1', trackId: 'track-1', candidateId: 'candidate-2' })).resolves.toMatchObject({ adoptedCandidateId: 'candidate-2' })
    expect(db.remakeKeyframeTrack.update).toHaveBeenCalled()
    expect(db.remakeKeyframeAdoptionEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ trackId: 'track-1', nextCandidateId: 'candidate-2' }) }))
  })

  it('returns history without mutating adoption', async () => {
    db.remakeKeyframeBatch.findMany.mockResolvedValue([{ id: 'batch-1', operationKey: 'op-1', requestedCandidateCount: 1, createdAt: new Date('2026-08-10T00:00:00Z'), candidates: [{ id: 'candidate-1', ordinal: 1, outputVersion: { mediaId: 'media-1', status: 'completed' } }] }])
    const service = await import('@/lib/remake-projects/keyframes/service')
    const history = await service.getKeyframeTrackHistory({ projectId: 'project-1', userId: 'user-1', trackId: 'track-1' })
    expect(history).toMatchObject({ trackId: 'track-1', batches: [{ id: 'batch-1', candidates: [{ id: 'candidate-1' }] }] })
    expect(db.remakeKeyframeTrack.update).not.toHaveBeenCalled()
  })
})
