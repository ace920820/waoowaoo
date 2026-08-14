import { describe, expect, it } from 'vitest'
import { buildUnitSubmissionPreview } from '@/lib/remake-projects/unit/preview'
import { buildUnitTimedPrompt } from '@/lib/remake-projects/unit/time-anchors'
import { buildUnitReferencePlan } from '@/lib/remake-projects/unit/reference-plan'
import type { RemakeReferenceCandidate } from '@/lib/remake-projects/video/reference-plan'

/**
 * D-16 shared WYSIWYG preview assembly:
 *  - buildUnitSubmissionPreview returns the ordered member list (numeric
 *    durations), the reference order (per-member keyframe + merged action
 *    sheet + dedup assets), the timed prompt text, and the normalized total
 *    duration via deriveDefaultVideoDuration.
 *  - The preview prompt text is exactly buildUnitTimedPrompt output (single
 *    source of truth) and the preview reference order is exactly
 *    buildUnitReferencePlan output — what the user sees is what the server
 *    freezes.
 *  - The assembler is pure and client-safe (no prisma, no storage, no node:
 *    imports) so the 09.1-06 preview panel can import it unchanged.
 */

const MEMBERS = [
  { ordinal: 1, durationSeconds: 1, adoptedPrompt: '角色推门进入房间。', keyframeMediaRef: { mediaId: 'kf-1' } },
  { ordinal: 2, durationSeconds: 3, adoptedPrompt: '角色走到窗边。', keyframeMediaRef: { mediaId: 'kf-2' } },
]

const ACTION_SHEET = { mediaId: 'sheet-1' }

const ASSETS: RemakeReferenceCandidate[] = [
  {
    role: 'character_reference', mediaType: 'image', sourceType: 'character_reference',
    label: '角色 萨姆', usage: 'u', assetId: 'char-sam', mediaId: 'media-char-sam',
  },
  {
    role: 'character_audio_reference', mediaType: 'audio', sourceType: 'character_voice_reference',
    label: '角色 萨姆 声音', usage: 'u', assetId: 'char-sam', mediaId: 'media-voice-sam',
  },
]

describe('buildUnitSubmissionPreview (D-16 assembly)', () => {
  it('returns the ordered member list, reference order, timed prompt, and total duration', () => {
    const preview = buildUnitSubmissionPreview({
      members: MEMBERS,
      actionSheetMediaRef: ACTION_SHEET,
      assetCandidates: ASSETS,
      totalDurationSeconds: 8,
    })

    // Ordered member list with numeric durations.
    expect(preview.members).toEqual([
      { ordinal: 1, durationSeconds: 1, adoptedPrompt: '角色推门进入房间。' },
      { ordinal: 2, durationSeconds: 3, adoptedPrompt: '角色走到窗边。' },
    ])

    // Reference order: per-member keyframe -> action sheet -> assets (image
    // before audio channel).
    expect(preview.orderedReferences.map((ref) => ref.role)).toEqual([
      'shot_keyframe', 'shot_keyframe',
      'action_sheet',
      'character_reference',
      'character_audio_reference',
    ])

    // Timed prompt text (anchors scaled to the normalized total 8s).
    expect(preview.promptText).toContain('0-2s（镜头 1）：角色推门进入房间。')
    expect(preview.promptText).toContain('2-8s（镜头 2）：角色走到窗边。')

    expect(preview.totalDurationSeconds).toBe(8)
    expect(preview.referenceCounts).toEqual({ images: 4, audio: 1 })
  })

  it('normalizes the total duration via deriveDefaultVideoDuration when not supplied', () => {
    const preview = buildUnitSubmissionPreview({
      members: [
        { ordinal: 1, durationSeconds: 1, adoptedPrompt: 'A', keyframeMediaRef: { mediaId: 'kf-1' } },
        { ordinal: 2, durationSeconds: 0.5, adoptedPrompt: 'B', keyframeMediaRef: { mediaId: 'kf-2' } },
      ],
    })
    // sum = 1.5s -> deriveDefaultVideoDuration(1.5, []) rounds up to 2.
    expect(preview.totalDurationSeconds).toBe(2)
    expect(preview.promptText).toContain('总时长约 2 秒')
  })

  it('preview prompt text equals buildUnitTimedPrompt for the same members and total (single source of truth)', () => {
    const total = 8
    const preview = buildUnitSubmissionPreview({
      members: MEMBERS,
      actionSheetMediaRef: ACTION_SHEET,
      assetCandidates: ASSETS,
      totalDurationSeconds: total,
    })
    const expected = buildUnitTimedPrompt(
      MEMBERS.map((m) => ({ ordinal: m.ordinal, durationSeconds: m.durationSeconds, prompt: m.adoptedPrompt })),
      total,
    )
    expect(preview.promptText).toBe(expected)
  })

  it('preview reference order equals buildUnitReferencePlan output (WYSIWYG)', () => {
    const preview = buildUnitSubmissionPreview({
      members: MEMBERS,
      actionSheetMediaRef: ACTION_SHEET,
      assetCandidates: ASSETS,
      totalDurationSeconds: 8,
    })
    const expected = buildUnitReferencePlan({
      memberKeyframes: MEMBERS.map((m) => ({ ordinal: m.ordinal, ...m.keyframeMediaRef })),
      actionSheetMediaRef: ACTION_SHEET,
      assetCandidates: ASSETS,
    })
    expect(preview.orderedReferences).toEqual(expected)
  })

  it('is pure: identical inputs produce an identical output object, and the module is client-safe', async () => {
    const input = {
      members: MEMBERS,
      actionSheetMediaRef: ACTION_SHEET,
      assetCandidates: ASSETS,
      totalDurationSeconds: 8,
    }
    const first = buildUnitSubmissionPreview(input)
    const second = buildUnitSubmissionPreview(input)
    expect(first).toEqual(second)

    const fs = await import('node:fs')
    const source = fs.readFileSync('src/lib/remake-projects/unit/preview.ts', 'utf-8')
    expect(source).not.toContain('node:')
    expect(source).not.toContain('@/lib/prisma')
    expect(source).not.toContain('@/lib/storage')
  })
})
