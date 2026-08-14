import { buildRemakeVideoUnitTimeAnchors, buildUnitTimedPrompt } from './time-anchors'
import { buildUnitReferencePlan } from './reference-plan'
import { deriveDefaultVideoDuration } from '../video/duration'
import type { RemakeReferenceCandidate, RemakeReferencePlanItem } from '../video/reference-plan'
import type { EffectiveVideoCapabilityDefinition } from '@/lib/model-capabilities/video-effective'

/**
 * D-16 shared WYSIWYG unit submission preview.
 *
 * Pure, client-safe assembler (no Node built-in, prisma or storage imports)
 * that produces EXACTLY the prompt text, reference order, and total duration
 * the server freeze (Plan 09.1-04) will consume — the single assembly contract
 * for both the server freeze and the client preview panel (Plan 09.1-06).
 * Server-only concerns (prisma reads, merged-sheet rendering) stay outside
 * this file and are injected as plain refs.
 *
 * The duration normalization (1) uses `totalDurationSeconds` when supplied;
 * (2) otherwise derives it with `deriveDefaultVideoDuration` over the member
 * duration sum (capability definitions passed as plain data, defaulting to
 * none so the client preview gets the ceil + [1,15s] clamp behavior).
 */

export type UnitPreviewMember = {
  ordinal: number
  durationSeconds: number
  adoptedPrompt: string
  /** Resolved adopted keyframe media for this member (D-06). */
  keyframeMediaRef: { mediaId?: string | null; mediaUrl?: string | null }
}

export type UnitSubmissionPreviewInput = {
  members: UnitPreviewMember[]
  actionSheetMediaRef?: { mediaId?: string | null; mediaUrl?: string | null } | null
  assetCandidates?: RemakeReferenceCandidate[]
  totalDurationSeconds?: number
  durationCapabilityDefinitions?: EffectiveVideoCapabilityDefinition[]
}

export type UnitSubmissionPreview = {
  members: Array<{
    ordinal: number
    durationSeconds: number
    adoptedPrompt: string
  }>
  orderedReferences: RemakeReferencePlanItem[]
  promptText: string
  totalDurationSeconds: number
  referenceCounts: { images: number; audio: number }
}

export function buildUnitSubmissionPreview(
  input: UnitSubmissionPreviewInput,
): UnitSubmissionPreview {
  const totalDurationSeconds =
    input.totalDurationSeconds ??
    deriveDefaultVideoDuration(
      input.members.reduce((acc, member) => acc + member.durationSeconds, 0),
      input.durationCapabilityDefinitions ?? [],
    )

  // (1) Per-member anchors — computed up front so a broken closure fails the
  // preview before it reaches the prompt / refs.
  buildRemakeVideoUnitTimeAnchors(
    input.members.map((member) => ({
      ordinal: member.ordinal,
      durationSeconds: member.durationSeconds,
    })),
    totalDurationSeconds,
  )

  // (2) The D-09 timed prompt — single source of truth for the frozen text.
  const promptText = buildUnitTimedPrompt(
    input.members.map((member) => ({
      ordinal: member.ordinal,
      durationSeconds: member.durationSeconds,
      prompt: member.adoptedPrompt,
    })),
    totalDurationSeconds,
  )

  // (3) The reference order — identical to what the server freezes.
  const orderedReferences = buildUnitReferencePlan({
    memberKeyframes: input.members.map((member) => ({
      ordinal: member.ordinal,
      ...member.keyframeMediaRef,
    })),
    actionSheetMediaRef: input.actionSheetMediaRef,
    assetCandidates: input.assetCandidates ?? [],
  })

  const images = orderedReferences.filter((ref) => ref.mediaType !== 'audio').length
  const audio = orderedReferences.length - images

  return {
    members: input.members.map((member) => ({
      ordinal: member.ordinal,
      durationSeconds: member.durationSeconds,
      adoptedPrompt: member.adoptedPrompt,
    })),
    orderedReferences,
    promptText,
    totalDurationSeconds,
    referenceCounts: { images, audio },
  }
}
