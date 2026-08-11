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

describe('Remake shot semantics adapter', () => {
  const shotWithSemantics = {
    id: 'shot-1', stableKey: 'shot-a', sequence: 1, reviewStatus: 'approved', needsReview: false,
    currentRevision: 2, review: { promptEligible: true, reason: null },
    semantics: {
      shotType: '平视中景',
      cameraMove: '固定',
      description: '中景：机舱内部，萨姆坐在靠窗位置看着腕表',
      moodPresetId: 'calm-spiritual',
      customMood: '潮湿闷热',
      sceneTag: '机舱内部_白天',
      characterTags: ['萨姆', '我'],
    },
    keyframes: { start: { mediaId: 'a', mediaUrl: '/a' }, middle: { mediaId: 'b', mediaUrl: '/b' }, end: { mediaId: 'c', mediaUrl: '/c' } },
    keyframeGeneration: { tracks: [], actionSheet: { status: 'waiting', id: null, mediaId: null, fingerprint: null }, history: [] },
    promptTracks: [
      { id: 'p1', targetKey: 'image:start', latestVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved' }, adoptedVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved' }, needsReview: false },
      { id: 'p2', targetKey: 'image:middle', latestVersion: { id: 'v2', versionNumber: 1, reviewStatus: 'approved' }, adoptedVersion: { id: 'v2', versionNumber: 1, reviewStatus: 'approved' }, needsReview: true },
      { id: 'p3', targetKey: 'video', latestVersion: { id: 'v3', versionNumber: 1, reviewStatus: 'approved' }, adoptedVersion: { id: 'v3', versionNumber: 1, reviewStatus: 'approved' }, needsReview: false },
    ], revisions: [], provenance: [],
  } as never

  it('surfaces all semantics fields on the Shot view', () => {
    const view = adaptRemakeShot(shotWithSemantics)
    expect(view.semantics.shotType).toBe('平视中景')
    expect(view.semantics.cameraMove).toBe('固定')
    expect(view.semantics.description).toContain('机舱内部')
    expect(view.semantics.moodPresetId).toBe('calm-spiritual')
    expect(view.semantics.customMood).toBe('潮湿闷热')
    expect(view.semantics.sceneTag).toBe('机舱内部_白天')
    expect(view.semantics.characterTags).toEqual(['萨姆', '我'])
  })

  it('maps image prompt status for each slot and video', () => {
    const view = adaptRemakeShot(shotWithSemantics)
    expect(view.imagePromptStatus.start).toBe('approved')
    expect(view.imagePromptStatus.middle).toBe('needs_review')
    expect(view.imagePromptStatus.end).toBe('missing')
    expect(view.videoPromptStatus).toBe('approved')
  })

  it('falls back to empty semantics when none are provided', () => {
    const bareShot = {
      id: 'shot-2', stableKey: 'shot-b', sequence: 2, reviewStatus: 'pending', needsReview: false,
      currentRevision: 1, review: { promptEligible: true, reason: null },
      keyframes: { start: { mediaId: null, mediaUrl: null }, middle: { mediaId: null, mediaUrl: null }, end: { mediaId: null, mediaUrl: null } },
      keyframeGeneration: { tracks: [], actionSheet: { status: 'waiting', id: null, mediaId: null, fingerprint: null }, history: [] },
      promptTracks: [], revisions: [], provenance: [],
    } as never
    const view = adaptRemakeShot(bareShot)
    expect(view.semantics.shotType).toBeNull()
    expect(view.semantics.cameraMove).toBeNull()
    expect(view.semantics.description).toBeNull()
    expect(view.semantics.moodPresetId).toBeNull()
    expect(view.semantics.customMood).toBeNull()
    expect(view.semantics.sceneTag).toBeNull()
    expect(view.semantics.characterTags).toEqual([])
  })
})
