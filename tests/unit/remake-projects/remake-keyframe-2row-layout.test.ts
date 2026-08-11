import { describe, expect, it } from 'vitest'
import { buildTwoRowLayout, type TwoRowSlotColumn } from '@/lib/remake-projects/keyframes/adapter'
import { adaptRemakeShot } from '@/lib/remake-projects/keyframes/adapter'

function baseShot() {
  return {
    id: 'shot-1', stableKey: 'shot-a', sequence: 1, reviewStatus: 'approved', needsReview: false,
    currentRevision: 2, review: { promptEligible: true, reason: null },
    semantics: { shotType: null, cameraMove: null, description: null, moodPresetId: null, customMood: null, sceneTag: null, characterTags: [] },
    keyframes: {
      start: { mediaId: 'a', mediaUrl: '/a' },
      middle: { mediaId: 'b', mediaUrl: '/b' },
      end: { mediaId: 'c', mediaUrl: '/c' },
    },
    keyframeGeneration: {
      tracks: [
        {
          id: 't-start', slot: 'start', selectedForGeneration: true,
          adoptedCandidateId: null, eligible: true,
          batches: [{
            id: 'b1', operationKey: 'op1', inputFingerprint: 'f1',
            createdAt: '2026-01-01T00:00:00Z', requestedCandidateCount: 1,
            candidates: [{ id: 'c1', ordinal: 1, outputVersionId: 'ov1', mediaId: 'm1', eligible: true }],
          }],
        },
        {
          id: 't-middle', slot: 'middle', selectedForGeneration: true,
          adoptedCandidateId: 'c2', eligible: true,
          batches: [{
            id: 'b2', operationKey: 'op2', inputFingerprint: 'f2',
            createdAt: '2026-01-01T00:00:00Z', requestedCandidateCount: 1,
            candidates: [{ id: 'c2', ordinal: 1, outputVersionId: 'ov2', mediaId: 'm2', eligible: true }],
          }],
        },
        {
          id: 't-end', slot: 'end', selectedForGeneration: false,
          adoptedCandidateId: null, eligible: false,
          batches: [],
        },
      ],
      actionSheet: { status: 'waiting', id: null, mediaId: null, fingerprint: null },
      history: [],
    },
    promptTracks: [],
    revisions: [], provenance: [],
  } as never
}

describe('Remake keyframe 2-row 3-column layout', () => {
  it('always returns 3 columns in start → middle → end order', () => {
    const shot = adaptRemakeShot(baseShot())
    const columns = buildTwoRowLayout(shot)
    expect(columns).toHaveLength(3)
    expect(columns[0].slot).toBe('start')
    expect(columns[1].slot).toBe('middle')
    expect(columns[2].slot).toBe('end')
  })

  it('top row is the original frame, bottom row is the new keyframe', () => {
    const shot = adaptRemakeShot(baseShot())
    const columns = buildTwoRowLayout(shot)
    expect(columns[0].original.mediaUrl).toBe('/a')
    expect(columns[0].newFrame?.adoptedMediaUrl).toBeNull()
    expect(columns[0].newFrame?.candidateCount).toBe(1)
  })

  it('bottom row reflects the adopted candidate when present', () => {
    const shot = adaptRemakeShot(baseShot())
    const columns = buildTwoRowLayout(shot)
    // Middle slot has an adopted candidate
    const middle = columns[1]
    expect(middle.newFrame?.isAdopted).toBe(true)
    expect(middle.newFrame?.adoptedMediaUrl).toBeTruthy()
  })

  it('bottom row shows empty state when no slot is selected or no batches exist', () => {
    const shot = adaptRemakeShot(baseShot())
    const columns = buildTwoRowLayout(shot)
    // End slot is not eligible and has no batches
    const end = columns[2]
    expect(end.newFrame?.isEmpty).toBe(true)
    expect(end.newFrame?.candidateCount).toBe(0)
  })

  it('column has explicit row labels (top = 原始动作参考, bottom = 新画面参考)', () => {
    const shot = adaptRemakeShot(baseShot())
    const columns = buildTwoRowLayout(shot)
    for (const column of columns) {
      expect(column.rowLabels.original).toBe('原始动作参考')
      expect(column.rowLabels.newFrame).toBe('新画面参考')
    }
  })

  it('slot ordering is stable even if track array is in different order', () => {
    const data = baseShot()
    // Reorder tracks so end comes first
    const tracks = (data as Record<string, unknown>).keyframeGeneration as Record<string, unknown>
    const t = tracks.tracks as unknown[]
    tracks.tracks = [t[2], t[0], t[1]]
    const shot = adaptRemakeShot(data)
    const columns = buildTwoRowLayout(shot)
    expect(columns.map((column) => column.slot)).toEqual(['start', 'middle', 'end'])
  })

  it('imagePrompts carry adopted negative constraints alongside core text', () => {
    const data = baseShot() as Record<string, unknown>
    data.promptTracks = [
      {
        id: 'pt-start',
        targetKey: 'image:start',
        adoptedVersion: {
          id: 'v1',
          versionNumber: 1,
          reviewStatus: 'approved',
          coreText: 'adopted prompt',
          negativeConstraints: ['blurry', 'low quality'],
        },
      },
    ]
    const shot = adaptRemakeShot(data as never)
    expect(shot.imagePrompts.start).toMatchObject({
      coreText: 'adopted prompt',
      negativeConstraints: ['blurry', 'low quality'],
    })
    expect(shot.imagePrompts.middle.negativeConstraints).toEqual([])
  })
})
