import { describe, expect, it } from 'vitest'
import { adaptRemakeShot, canSelectRemakeKeyframeSlot, orderedRemakeBatches } from '@/lib/remake-projects/keyframes/adapter'

describe('Remake two-layer keyframe stage', () => {
  const shot = {
    id: 'shot-1', stableKey: 'shot-a', sequence: 1, reviewStatus: 'approved', needsReview: false,
    currentRevision: 2, review: { promptEligible: true, reason: null },
    keyframes: { start: { mediaId: 'a', mediaUrl: '/a' }, middle: { mediaId: 'b', mediaUrl: '/b' }, end: { mediaId: 'c', mediaUrl: '/c' } },
    keyframeGeneration: { tracks: [], actionSheet: { status: 'waiting', id: null, mediaId: null, fingerprint: null }, history: [] },
    promptTracks: [
      { id: 'p1', targetKey: 'image:start', latestVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved' }, adoptedVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved' }, needsReview: false },
    ], revisions: [], provenance: [],
  } as never

  it('keeps immutable originals and leaves fresh slots unselected', () => {
    const view = adaptRemakeShot(shot)
    expect(view.original).toEqual({ start: { mediaId: 'a', mediaUrl: '/a' }, middle: { mediaId: 'b', mediaUrl: '/b' }, end: { mediaId: 'c', mediaUrl: '/c' } })
    expect(view.slots.start.selectedForGeneration).toBe(false)
    expect(view.slots.start.adoptedCandidate).toBeNull()
  })

  it('rejects unavailable or invalidated choices with a reason', () => {
    expect(canSelectRemakeKeyframeSlot({ eligible: false, reason: 'Prompt 已失效' })).toBe(false)
    expect(canSelectRemakeKeyframeSlot({ eligible: true, reason: null })).toBe(true)
  })

  it('preserves chronological batch history', () => {
    expect(orderedRemakeBatches([
      { id: 'new', createdAt: '2026-01-02', candidates: [], operationKey: 'n', requestedCandidateCount: 1 },
      { id: 'old', createdAt: '2026-01-01', candidates: [], operationKey: 'o', requestedCandidateCount: 2 },
    ])).toMatchObject([{ id: 'old' }, { id: 'new' }])
  })
})
