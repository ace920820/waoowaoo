/**
 * Client-safe unit view projection for the 成片页 (D-16/D-17/D-18).
 *
 * Pure adapter — no node: / prisma / storage imports, safe for the browser.
 * Consumes the `units` array already projected by getRemakeProjectSnapshot
 * (Plan 09.1-06 Task 1) and produces the shape the RemakeVideoUnitPanel
 * renders: ordered members with durations, track batches/versions, and the
 * adoption pointer.
 */

import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

export type RemakeKeyframeSlotName = 'start' | 'middle' | 'end'

/** 该成员某个 slot 的已采用关键帧引用（无采用时 mediaId/mediaUrl 为 null）。 */
export type UnitMemberKeyframeOption = {
  slot: RemakeKeyframeSlotName
  mediaId: string | null
  mediaUrl: string | null
}

export type UnitMemberView = {
  shotRevisionId: string
  ordinal: number
  shotId: string | null
  sequence: number | null
  label: string | null
  durationSeconds: number
  /** 引用的已采用关键帧 slot（null = 默认 middle 策略） */
  keyframeSlot: RemakeKeyframeSlotName | null
  /** 每个 slot 的已采用关键帧（用于展示 + 编辑切换） */
  keyframeOptions: UnitMemberKeyframeOption[]
}

type UnitSlotTrack = NonNullable<RemakeSnapshot['shots'][number]['keyframeGeneration']>['tracks'][number]

/**
 * Resolve a slot track's adopted candidate ref from the snapshot projection
 * (adoptedCandidateId points into batches[].candidates).
 */
function adoptedKeyframeRef(track: UnitSlotTrack): { mediaId: string | null; mediaUrl: string | null } {
  const adoptedId = track.adoptedCandidateId
  if (!adoptedId) return { mediaId: null, mediaUrl: null }
  for (const batch of track.batches) {
    const candidate = batch.candidates.find((entry) => entry.id === adoptedId)
    if (candidate) {
      return { mediaId: candidate.mediaId ?? null, mediaUrl: candidate.mediaUrl ?? null }
    }
  }
  return { mediaId: null, mediaUrl: null }
}

function keyframeOptionsForShot(
  snapshot: RemakeSnapshot,
  shotId: string | null,
): UnitMemberKeyframeOption[] {
  if (!shotId) return []
  const shot = snapshot.shots.find((entry) => entry.id === shotId)
  const tracks = shot?.keyframeGeneration?.tracks ?? []
  const bySlot = new Map(tracks.map((track) => [track.slot, track]))
  const slots: RemakeKeyframeSlotName[] = ['start', 'middle', 'end']
  return slots.map((slot) => {
    const track = bySlot.get(slot)
    const ref = track ? adoptedKeyframeRef(track) : { mediaId: null, mediaUrl: null }
    return { slot, mediaId: ref.mediaId, mediaUrl: ref.mediaUrl }
  })
}

export type UnitVersionView = {
  id: string
  ordinal: number
  mediaUrl: string | null
  status: string
  invalidated: boolean
  note: string | null
}

export type UnitBatchView = {
  id: string
  operationKey: string
  modelId: string | null
  createdAt?: string
  versions: UnitVersionView[]
}

export type UnitView = {
  id: string
  userLabel: string | null
  dissolvedAt: string | null
  dissolvedReason: string | null
  members: UnitMemberView[]
  track: {
    id: string
    adoptedVersionId: string | null
    hasInvalidated: boolean
    batches: UnitBatchView[]
  } | null
  actionSheets: Array<{
    id: string
    mediaId: string | null
    mediaUrl: string | null
    fingerprint: string | null
    status: string
  }>
  /** Latest unit generation task for the unit, if any. */
  latestTask: RemakeSnapshot['tasks'][number] | null
  /** True when a generation task is queued/processing/running (D-19 freeze). */
  hasPendingGeneration: boolean
  /** True when any batch is committed (D-19 freeze). */
  hasCommittedBatch: boolean
}

export function adaptRemakeUnit(
  snapshot: RemakeSnapshot,
  unitId: string,
): UnitView | null {
  const unit = (snapshot.units ?? []).find((entry) => entry.id === unitId)
  if (!unit) return null

  const members = [...unit.members]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((member) => ({
      shotRevisionId: member.shotRevisionId,
      ordinal: member.ordinal,
      shotId: member.shotId,
      sequence: member.sequence,
      label: member.label,
      durationSeconds: member.durationSeconds,
      keyframeSlot: (member.keyframeSlot as RemakeKeyframeSlotName | null | undefined) ?? null,
      keyframeOptions: keyframeOptionsForShot(snapshot, member.shotId),
    }))
  const track = unit.track
  const batches = track?.batches ?? []
  const hasCommittedBatch = batches.length > 0

  const latestTask =
    snapshot.tasks
      .filter((task) => task.type === 'remake_video_unit_generate' && task.targetId === unitId)
      .sort((left, right) => (left.createdAt > right.createdAt ? -1 : 1))[0] ?? null
  const hasPendingGeneration = Boolean(
    latestTask && ['queued', 'processing', 'running'].includes(latestTask.status),
  )

  return {
    id: unit.id,
    userLabel: unit.userLabel,
    dissolvedAt: unit.dissolvedAt ?? null,
    dissolvedReason: unit.dissolvedReason ?? null,
    members,
    track: track
      ? {
          id: track.id,
          adoptedVersionId: track.adoptedVersionId,
          hasInvalidated: track.hasInvalidated,
          batches: batches.map((batch) => ({
            id: batch.id,
            operationKey: batch.operationKey,
            modelId: batch.modelId ?? null,
            createdAt: batch.createdAt,
            versions: [...batch.versions].sort((left, right) => left.ordinal - right.ordinal),
          })),
        }
      : null,
    actionSheets: unit.actionSheets,
    latestTask,
    hasPendingGeneration,
    hasCommittedBatch,
  }
}

/** Map shotId -> unitId for the 由 unit 交付 member status (D-18). */
export function buildShotToUnitMap(snapshot: RemakeSnapshot): Map<string, string> {
  const map = new Map<string, string>()
  for (const unit of snapshot.units ?? []) {
    for (const member of unit.members) {
      if (member.shotId) map.set(member.shotId, unit.id)
    }
  }
  return map
}

/**
 * Unit badge tones for the shot overview (Phase 09.2): 浅蓝 / 浅棕 / 浅绿
 * rotate by unit order (units are createdAt-asc), so adjacent units always
 * differ. Shared with the unit-management switcher chips.
 */
export const UNIT_TONES = [
  { key: 'sky', badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-400' },
  { key: 'amber', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  { key: 'emerald', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
] as const

export type UnitTone = (typeof UNIT_TONES)[number]['key']

export function unitToneForIndex(index: number): (typeof UNIT_TONES)[number] {
  return UNIT_TONES[index % UNIT_TONES.length]!
}

export type ShotUnitBadge = {
  unitId: string
  unitNumber: number
  toneKey: UnitTone
  badgeClass: string
  dotClass: string
}

/**
 * Phase 09.2: shotId -> unit badge info (#N + tone) for the shot overview.
 * Units are numbered by the server's createdAt-asc order (1-based); dissolved
 * units have no members, so they produce no entries.
 */
export function buildShotUnitBadgeMap(snapshot: RemakeSnapshot): Map<string, ShotUnitBadge> {
  const map = new Map<string, ShotUnitBadge>()
  const units = snapshot.units ?? []
  units.forEach((unit, index) => {
    const tone = unitToneForIndex(index)
    const badge: ShotUnitBadge = {
      unitId: unit.id,
      unitNumber: index + 1,
      toneKey: tone.key,
      badgeClass: tone.badge,
      dotClass: tone.dot,
    }
    for (const member of unit.members) {
      if (member.shotId) map.set(member.shotId, badge)
    }
  })
  return map
}
