import { prisma } from '@/lib/prisma'
import { resolveMediaRef } from '@/lib/media/service'
import {
  REMAKE_KEYFRAME_SLOTS,
  type RemakeKeyframeSlot,
} from '../keyframes/adapter'
import {
  remakeReferenceRoleUsage,
  type RemakeReferenceCandidate,
} from '../video/reference-plan'

/**
 * Unit reference-merge layer (D-06 / D-08).
 *
 *  - `collectUnitMemberKeyframeCandidates`: per-member adopted-keyframe
 *    collection — exactly ONE keyframe per unit member (default middle slot,
 *    falling back to the only adopted slot), resolved to a stable media
 *    reference, returned in ordinal order. DB-backed; mocked in unit tests.
 *  - `dedupeUnitAssetCandidates` / `buildUnitReferencePlan`: pure helpers
 *    extracted to `unit/reference-plan.ts` (client-safe, re-exported here so
 *    this module keeps the full reference-merge API).
 */

export { buildUnitReferencePlan, dedupeUnitAssetCandidates } from './reference-plan'

export type UnitMemberKeyframeCandidate = RemakeReferenceCandidate & {
  ordinal: number
  /** The keyframe slot that produced this member's single adopted frame (D-06). */
  slot: RemakeKeyframeSlot
}

const UNIT_KEYFRAME_ROLE = 'shot_keyframe' as const
const DEFAULT_PREFERRED_SLOT: RemakeKeyframeSlot = 'middle'

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
    let chosenSlot: RemakeKeyframeSlot = preferred
    for (const slot of slotOrder) {
      const track = await prisma.remakeKeyframeTrack.findUnique({
        where: { shotRevisionId_slot: { shotRevisionId: member.shotRevisionId, slot } },
        include: { adoptedCandidate: { include: { outputVersion: true } } },
      })
      const media = track?.adoptedCandidate?.outputVersion?.mediaId
      if (media) {
        rawMedia = media
        chosenSlot = slot
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
      slot: chosenSlot,
      ...stableMedia,
    })
  }
  return candidates
}
