import {
  buildRemakeReferencePlan,
  remakeReferenceRoleLabel,
  remakeReferenceRoleUsage,
  type RemakeReferenceCandidate,
  type RemakeReferencePlanItem,
} from '../video/reference-plan'

/**
 * Pure unit reference-plan helpers (D-06 / D-08).
 *
 * This module intentionally has NO `node:` / prisma / storage imports so the
 * D-16 preview assembler (`unit/preview.ts`) and the client preview panel
 * (Plan 09.1-06) can import it unchanged. The DB-backed per-member keyframe
 * collection lives in `unit/references.ts`, which re-exports these functions.
 */

function referenceMediaFields(
  mediaId: string | null | undefined,
  url: string | null | undefined,
): Pick<RemakeReferenceCandidate, 'mediaId' | 'mediaUrl'> {
  if (mediaId) return { mediaId }
  if (url) return { mediaUrl: url }
  return {}
}

/**
 * D-08: collapse the same asset id across members to one candidate per
 * (role, assetId) — a character contributes one `character_reference` AND one
 * `character_audio_reference` (two distinct roles, same asset), while the same
 * character/scene/prop/voice appearing in several members is included once.
 * Candidates without an asset id (keyframes / action sheet) pass through.
 */
export function dedupeUnitAssetCandidates(
  candidates: RemakeReferenceCandidate[],
): RemakeReferenceCandidate[] {
  const seen = new Set<string>()
  const result: RemakeReferenceCandidate[] = []
  for (const candidate of candidates) {
    if (!candidate.assetId) {
      result.push(candidate)
      continue
    }
    const key = `${candidate.role}:${candidate.assetId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

/**
 * D-06/D-08: build the unit reference plan.
 *
 * Candidates are assembled in priority order — member shot_keyframes (by
 * ordinal), the merged action sheet, then the deduped assets — and delegated
 * to `buildRemakeReferencePlan` for stable sorting, contiguous ordinals and
 * the 9-image / 3-audio caps. Member keyframes sort before every asset role,
 * so cap truncation can never drop a required member frame (T-091-05).
 */
export function buildUnitReferencePlan(input: {
  memberKeyframes: Array<{
    ordinal: number
    mediaId?: string | null
    mediaUrl?: string | null
  }>
  actionSheetMediaRef?: { mediaId?: string | null; mediaUrl?: string | null } | null
  assetCandidates: RemakeReferenceCandidate[]
}): RemakeReferencePlanItem[] {
  const candidates: RemakeReferenceCandidate[] = []

  const orderedKeyframes = [...input.memberKeyframes].sort(
    (left, right) => left.ordinal - right.ordinal,
  )
  for (const member of orderedKeyframes) {
    const media = referenceMediaFields(member.mediaId, member.mediaUrl)
    if (!media.mediaId && !media.mediaUrl) continue
    candidates.push({
      role: 'shot_keyframe',
      mediaType: 'image',
      sourceType: 'shot_keyframe',
      label: `镜头 ${member.ordinal} 关键帧`,
      usage: remakeReferenceRoleUsage('shot_keyframe'),
      ...media,
    })
  }

  if (input.actionSheetMediaRef) {
    const media = referenceMediaFields(
      input.actionSheetMediaRef.mediaId,
      input.actionSheetMediaRef.mediaUrl,
    )
    if (media.mediaId || media.mediaUrl) {
      candidates.push({
        role: 'action_sheet',
        mediaType: 'image',
        sourceType: 'action_sheet',
        label: remakeReferenceRoleLabel('action_sheet'),
        usage: remakeReferenceRoleUsage('action_sheet'),
        ...media,
      })
    }
  }

  candidates.push(...input.assetCandidates)
  return buildRemakeReferencePlan(candidates)
}
