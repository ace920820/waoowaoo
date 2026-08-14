import { prisma } from '@/lib/prisma'
import { resolveMediaRef } from '@/lib/media/service'
import {
  REMAKE_KEYFRAME_SLOTS,
  type RemakeKeyframeSlot,
} from '../keyframes/adapter'
import {
  buildRemakeReferencePlan,
  remakeReferenceRoleLabel,
  remakeReferenceRoleUsage,
  type RemakeReferenceCandidate,
  type RemakeReferencePlanItem,
} from '../video/reference-plan'

/**
 * Unit reference-merge layer (D-06 / D-08).
 *
 *  - `collectUnitMemberKeyframeCandidates`: per-member adopted-keyframe
 *    collection — exactly ONE keyframe per unit member (default middle slot,
 *    falling back to the only adopted slot), resolved to a stable media
 *    reference, returned in ordinal order. DB-backed; mocked in unit tests.
 *  - `dedupeUnitAssetCandidates`: cross-member asset dedup keyed by
 *    (role, assetId) keeping the first occurrence — the same character/scene/
 *    prop/voice appearing in several members is included exactly once.
 *  - `buildUnitReferencePlan`: assembles candidates in the order
 *    shot_keyframes (ordinal) -> action_sheet -> characters -> scene -> props ->
 *    audio and delegates sorting/truncation to the existing
 *    `buildRemakeReferencePlan`, so the 9-image / 3-audio caps and the
 *    keyframe > action sheet > characters > scene > props > voice degrade are
 *    single-sourced (T-091-05: member keyframes are emitted before assets, so
 *    degrade never drops a required frame).
 */

export type UnitMemberKeyframeCandidate = RemakeReferenceCandidate & {
  ordinal: number
}

const UNIT_KEYFRAME_ROLE = 'shot_keyframe' as const
const DEFAULT_PREFERRED_SLOT: RemakeKeyframeSlot = 'middle'

function referenceMediaFields(
  mediaId: string | null | undefined,
  url: string | null | undefined,
): Pick<RemakeReferenceCandidate, 'mediaId' | 'mediaUrl'> {
  if (mediaId) return { mediaId }
  if (url) return { mediaUrl: url }
  return {}
}

/**
 * Normalize a raw media reference (MediaObject uuid OR storage key / COS url)
 * into a stable MediaObject id while keeping the raw value as `mediaUrl` —
 * the same resolution `resolveKeyframeReferenceCandidates` performs for the
 * single-shot path.
 */
async function resolveStableMediaRef(
  raw: string,
): Promise<{ mediaId?: string; mediaUrl?: string }> {
  const media = await resolveMediaRef(raw, raw)
  const result: { mediaId?: string; mediaUrl?: string } = { mediaUrl: raw }
  if (media?.id) result.mediaId = media.id
  return result
}

/**
 * D-06: collect exactly one adopted keyframe per unit member.
 *
 * For each member, the preferred slot (default `middle`) is tried first; when
 * it has no adopted keyframe the remaining slots are tried in canonical order
 * (start -> middle -> end) and the first adopted one wins. A member with no
 * adopted keyframe at all fails with a per-member error
 * `REMAKE_VIDEO_UNIT_MEMBER_KEYFRAME_MISSING:{ordinal}` (D-21 gate material).
 *
 * T-091-06: media is only ever collected from adopted DB rows, never from
 * client-supplied URLs.
 */
export async function collectUnitMemberKeyframeCandidates(params: {
  members: Array<{
    shotRevisionId: string
    ordinal: number
    preferredSlot?: RemakeKeyframeSlot
  }>
}): Promise<UnitMemberKeyframeCandidate[]> {
  const candidates: UnitMemberKeyframeCandidate[] = []
  for (const member of params.members) {
    const preferred = member.preferredSlot ?? DEFAULT_PREFERRED_SLOT
    const slotOrder: RemakeKeyframeSlot[] = [
      preferred,
      ...REMAKE_KEYFRAME_SLOTS.filter((slot) => slot !== preferred),
    ]

    let rawMedia: string | null = null
    for (const slot of slotOrder) {
      const track = await prisma.remakeKeyframeTrack.findUnique({
        where: { shotRevisionId_slot: { shotRevisionId: member.shotRevisionId, slot } },
        include: { adoptedCandidate: { include: { outputVersion: true } } },
      })
      const media = track?.adoptedCandidate?.outputVersion?.mediaId
      if (media) {
        rawMedia = media
        break
      }
    }

    if (!rawMedia) {
      throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_KEYFRAME_MISSING:${member.ordinal}`)
    }
    const stableMedia = await resolveStableMediaRef(rawMedia)
    if (!stableMedia.mediaId && !stableMedia.mediaUrl) {
      throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_KEYFRAME_MISSING:${member.ordinal}`)
    }

    candidates.push({
      role: UNIT_KEYFRAME_ROLE,
      mediaType: 'image',
      sourceType: UNIT_KEYFRAME_ROLE,
      label: `镜头 ${member.ordinal} 关键帧`,
      usage: remakeReferenceRoleUsage(UNIT_KEYFRAME_ROLE),
      ordinal: member.ordinal,
      ...stableMedia,
    })
  }
  return candidates
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
      role: UNIT_KEYFRAME_ROLE,
      mediaType: 'image',
      sourceType: UNIT_KEYFRAME_ROLE,
      label: `镜头 ${member.ordinal} 关键帧`,
      usage: remakeReferenceRoleUsage(UNIT_KEYFRAME_ROLE),
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
