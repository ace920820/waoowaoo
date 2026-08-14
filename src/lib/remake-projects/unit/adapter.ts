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

export type UnitMemberView = {
  shotRevisionId: string
  ordinal: number
  shotId: string | null
  sequence: number | null
  label: string | null
  durationSeconds: number
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

  const members = [...unit.members].sort((left, right) => left.ordinal - right.ordinal)
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
