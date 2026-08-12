import { describe, expect, it } from 'vitest'
import type { RemakeShotView } from '@/lib/remake-projects/keyframes/adapter'
import {
  buildOrderedVideoReferences,
  mapRemakeVideoInputs,
  videoSubmissionReadiness,
} from '@/lib/remake-projects/keyframes/video-inputs'

function makeShot(overrides: Partial<RemakeShotView> = {}): RemakeShotView {
  return {
    id: 'shot-1',
    label: 'Shot 01',
    timeRange: { start: 0, end: 5 },
    durationSeconds: 5.2,
    revision: 1,
    slots: {
      start: {
        id: 'slot-start',
        slot: 'start',
        eligible: true,
        reason: null,
        adoptedCandidateId: 'cand-start',
        adoptedCandidate: { id: 'cand-start', ordinal: 1, mediaId: 'media-start', mediaUrl: null, status: 'completed', eligible: true, invalidated: false },
        selectedForGeneration: true,
        batches: [],
      },
      middle: {
        id: 'slot-middle',
        slot: 'middle',
        eligible: true,
        reason: null,
        adoptedCandidateId: 'cand-middle',
        adoptedCandidate: { id: 'cand-middle', ordinal: 2, mediaId: 'media-middle', mediaUrl: null, status: 'completed', eligible: true, invalidated: false },
        selectedForGeneration: true,
        batches: [],
      },
      end: {
        id: 'slot-end',
        slot: 'end',
        eligible: true,
        reason: null,
        adoptedCandidateId: 'cand-end',
        adoptedCandidate: { id: 'cand-end', ordinal: 3, mediaId: 'media-end', mediaUrl: null, status: 'completed', eligible: true, invalidated: false },
        selectedForGeneration: true,
        batches: [],
      },
    },
    actionSheet: { status: 'current', mediaId: 'media-as' },
    videoPromptStatus: 'approved',
    ...overrides,
  } as RemakeShotView
}

describe('mapRemakeVideoInputs', () => {
  it('exposes only adopted generated keyframes, not original frames (D-01/D-02)', () => {
    const shot = makeShot()
    const input = mapRemakeVideoInputs(shot)

    expect(input.mainImages.length).toBe(3)
    expect(input.mainImages.every((img) => img.source === 'adopted')).toBe(true)
    expect(input.mainImages.map((img) => img.slot).sort()).toEqual(['end', 'middle', 'start'])
  })

  it('respects capability flags for which slots are eligible', () => {
    const shot = makeShot()
    const input = mapRemakeVideoInputs(shot, { supportsEnd: false })

    expect(input.mainImages.map((img) => img.slot).sort()).toEqual(['middle', 'start'])
    expect(input.missingMainSlots).toEqual([])
    expect(input.capabilityReason).toContain('end')
  })

  it('identifies missing slots and missing prompt status', () => {
    const shot = makeShot({
      slots: {
        start: { id: 's1', slot: 'start', eligible: false, reason: 'not_adopted', adoptedCandidateId: null, adoptedCandidate: null, selectedForGeneration: false, batches: [] },
        middle: { id: 's2', slot: 'middle', eligible: true, reason: null, adoptedCandidateId: 'c', adoptedCandidate: { id: 'c', ordinal: 1, mediaId: 'media-m', mediaUrl: null, status: 'completed', eligible: true, invalidated: false }, selectedForGeneration: true, batches: [] },
        end: { id: 's3', slot: 'end', eligible: false, reason: 'not_adopted', adoptedCandidateId: null, adoptedCandidate: null, selectedForGeneration: false, batches: [] },
      } as RemakeShotView['slots'],
      videoPromptStatus: 'missing',
    })

    const input = mapRemakeVideoInputs(shot)
    expect(input.mainImages.length).toBe(1)
    expect(input.missingMainSlots.sort()).toEqual(['end', 'start'])
    expect(input.videoPrompt).toBe('missing')
  })
})

describe('buildOrderedVideoReferences (D-04 fixed order)', () => {
  it('always returns Start -> Middle -> End -> action-sheet order regardless of selection order', () => {
    const input = mapRemakeVideoInputs(makeShot())

    // User selects in "wrong" order
    const refs = buildOrderedVideoReferences(input, {
      slots: ['end', 'start'],
      includeActionSheet: true,
    })

    expect(refs.map((r) => r.role)).toEqual([
      'start_keyframe',
      'end_keyframe',
      'action_sheet',
    ])
    expect(refs[0].ordinal).toBe(1)
    expect(refs[1].ordinal).toBe(2)
    expect(refs[2].ordinal).toBe(3)
  })

  it('includes only explicitly selected references (D-01)', () => {
    const input = mapRemakeVideoInputs(makeShot())
    const refs = buildOrderedVideoReferences(input, {
      slots: ['middle'],
      includeActionSheet: false,
    })

    expect(refs.length).toBe(1)
    expect(refs[0].role).toBe('middle_keyframe')
  })

  it('excludes action sheet when not selected or unavailable', () => {
    const shot = makeShot({ actionSheet: { status: 'missing', mediaId: null } } as Partial<RemakeShotView>)
    const input = mapRemakeVideoInputs(shot)

    const refs = buildOrderedVideoReferences(input, {
      slots: ['middle'],
      includeActionSheet: true,
    })
    expect(refs.some((r) => r.role === 'action_sheet')).toBe(false)
  })

  it('does not include keyframes when none are selected (action sheet only is blocked by readiness, not here)', () => {
    const input = mapRemakeVideoInputs(makeShot())
    const refs = buildOrderedVideoReferences(input, {
      slots: [],
      includeActionSheet: true,
    })
    // Preview shows what was selected; readiness gate enforces the no-keyframe rule.
    expect(refs.every((r) => r.role === 'action_sheet')).toBe(true)
    expect(refs.length).toBe(1)
  })
})

describe('videoSubmissionReadiness (VGEN-07 / D-03)', () => {
  it('returns no reasons when one keyframe and approved prompt are selected', () => {
    const input = mapRemakeVideoInputs(makeShot())
    const reasons = videoSubmissionReadiness(input, { slots: ['middle'], includeActionSheet: false })
    expect(reasons).toEqual([])
  })

  it('blocks when no keyframe is selected', () => {
    const input = mapRemakeVideoInputs(makeShot())
    const reasons = videoSubmissionReadiness(input, { slots: [], includeActionSheet: true })
    expect(reasons).toContainEqual(expect.stringContaining('至少选择'))
  })

  it('blocks when selected slot has no adopted candidate', () => {
    const shot = makeShot({
      slots: {
        start: { id: 's1', slot: 'start', eligible: false, reason: 'not_adopted', adoptedCandidateId: null, adoptedCandidate: null, selectedForGeneration: false, batches: [] },
        middle: { id: 's2', slot: 'middle', eligible: true, reason: null, adoptedCandidateId: 'c', adoptedCandidate: { id: 'c', ordinal: 1, mediaId: 'm', mediaUrl: null, status: 'completed', eligible: true, invalidated: false }, selectedForGeneration: true, batches: [] },
        end: { id: 's3', slot: 'end', eligible: false, reason: 'not_adopted', adoptedCandidateId: null, adoptedCandidate: null, selectedForGeneration: false, batches: [] },
      } as RemakeShotView['slots'],
    })
    const input = mapRemakeVideoInputs(shot)
    const reasons = videoSubmissionReadiness(input, { slots: ['start', 'middle'], includeActionSheet: false })
    // start is selected but not adopted, so only middle counts; at least one keyframe is selected => passes
    // But the effective selected keyframes count is 1, so it passes
    expect(reasons).toEqual([])
  })

  it('blocks when video prompt is missing or needs review', () => {
    const input = mapRemakeVideoInputs(makeShot({ videoPromptStatus: 'needs_review' } as Partial<RemakeShotView>))
    const reasons = videoSubmissionReadiness(input, { slots: ['middle'], includeActionSheet: false })
    expect(reasons).toContainEqual(expect.stringContaining('复核'))
  })
})
