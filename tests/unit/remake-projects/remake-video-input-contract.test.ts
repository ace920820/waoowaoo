import { describe, expect, it } from 'vitest'
import { adaptRemakeShot } from '@/lib/remake-projects/keyframes/adapter'
import { mapRemakeVideoInputs, videoSubmissionDisabled } from '@/lib/remake-projects/keyframes/video-inputs'

describe('Remake video input contract', () => {
  it('uses adopted images only and never falls back to original keyframes', () => {
    const shot = adaptRemakeShot({
      id: 's', stableKey: 'shot', sequence: 1, reviewStatus: 'approved', needsReview: false, currentRevision: 1,
      review: { promptEligible: true }, keyframes: { start: { mediaId: 'original', mediaUrl: '/original' }, middle: { mediaId: null, mediaUrl: null }, end: { mediaId: null, mediaUrl: null } },
      keyframeGeneration: { tracks: [], actionSheet: { status: 'missing', id: null, mediaId: null, fingerprint: null }, history: [] }, promptTracks: [], revisions: [], provenance: [],
    } as never)
    const inputs = mapRemakeVideoInputs(shot)
    expect(inputs.mainImages).toEqual([])
    expect(inputs.missingMainSlots).toEqual(['start', 'middle', 'end'])
    expect(inputs.actionSheet.source).toBe('original_action_sheet')
  })

  it('keeps video submission structurally disabled in Phase 8', () => {
    expect(videoSubmissionDisabled()).toBe(true)
  })
})
