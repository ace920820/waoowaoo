import { describe, expect, it } from 'vitest'
import { evaluateSceneDetectReviewGate } from '@/lib/remake-projects/scenedetect/review-gate'

describe('SceneDetect review gate', () => {
  const ready = { status: 'keep' as const, needsReview: false, revisionState: 'active', sourceRevision: 2, currentSourceRevision: 2, keyframeMediaRefs: { first: 'a', middle: 'b', last: 'c' }, keyframeTaskStatus: 'completed' }
  it('only confirms a current, complete user-kept revision', () => expect(evaluateSceneDetectReviewGate(ready)).toMatchObject({ confirmed: true, promptEligible: true, reasons: [] }))
  it('keeps modified and incomplete shots out of prompt eligibility', () => expect(evaluateSceneDetectReviewGate({ ...ready, needsReview: true, keyframeMediaRefs: { first: 'a' } })).toMatchObject({ promptEligible: false, reasons: expect.arrayContaining(['NEEDS_REVIEW', 'KEYFRAMES_MISSING']) }))
  it('does not treat task completion as approval', () => expect(evaluateSceneDetectReviewGate({ ...ready, status: 'pending' })).toMatchObject({ confirmed: false, reasons: ['STATUS_NOT_KEEP'] }))
  it('allows Prompt analysis for an untouched automatic Shot with complete keyframes', () => {
    expect(evaluateSceneDetectReviewGate({ ...ready, status: 'pending' })).toMatchObject({
      confirmed: false,
      promptEligible: true,
      reasons: ['STATUS_NOT_KEEP'],
    })
  })
})
