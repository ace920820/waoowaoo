import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'
import { parseTimecodeSeconds } from './timecode'
import {
  unitInputFingerprint,
  videoUnitInputSnapshotSchema,
  type VideoUnitInputSnapshot,
} from './contracts'

type Client = typeof prisma

/**
 * Unit CRUD / member-freeze / submission-currentness service (D-04 / D-19 /
 * D-22). Mirrors the single-shot video service's ownership queries
 * (remakeProject.projectId + project.userId, exactly like getVideoTrackDetail)
 * and its transaction pattern (T-091-13).
 *
 * Members freeze at generate-submit (D-19): `updateVideoUnitMembers` rejects
 * any mutation while a queued/processing unit task exists
 * (REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT) or once the first batch is
 * committed (REMAKE_VIDEO_UNIT_MEMBERS_FROZEN). `assertVideoUnitSubmissionCurrent`
 * stays the append-time backstop for races (D-22).
 */

/** Best-effort JSON parse of the shot-revision payload text column. */
function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** One side of a shot time range → seconds (Pitfall 1: no silent 3s fallback
 * when a parseable timecode exists). */
function timeRangeSideToSeconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return parseTimecodeSeconds(value)
  return null
}

/** Member duration from the shot-revision payload time range, mirroring the
 * keyframe adapter's projection (numeric wins, then parsed timecodes, else 3). */
function memberDurationSeconds(payload: unknown): number {
  const parsed = parseObject(payload)
  const start = timeRangeSideToSeconds(parsed.startTimecode ?? parsed.startTime ?? null)
  const end = timeRangeSideToSeconds(parsed.endTimecode ?? parsed.endTime ?? null)
  if (start === null || end === null) return 3
  return Math.max(0.1, end - start)
}

/**
 * D-02/D-04: create a unit from >= 2 shot revisions in submitted order.
 * Each member must be the shot's active/current revision and must not already
 * belong to any unit; all members must belong to the same remake project.
 * Runs entirely inside one transaction (T-091-09 in-transaction re-checks).
 */
export async function createVideoUnit(input: {
  projectId: string
  userId: string
  memberShotRevisionIds: string[]
}): Promise<{ unitId: string }> {
  const memberShotRevisionIds = [...new Set(input.memberShotRevisionIds)]
  if (memberShotRevisionIds.length < 2) {
    throw new Error('REMAKE_VIDEO_UNIT_MIN_MEMBERS')
  }
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const project = await client.project.findFirst({
      where: { id: input.projectId, userId: input.userId, type: 'remake' },
      select: { id: true },
    })
    if (!project) throw new Error('REMAKE_VIDEO_UNIT_PROJECT_NOT_FOUND')

    const revisions = await client.remakeShotRevision.findMany({
      where: { id: { in: memberShotRevisionIds } },
      include: {
        shot: { select: { id: true, currentRevision: true, remakeProjectId: true } },
      },
    })
    if (revisions.length !== memberShotRevisionIds.length) {
      throw new Error('REMAKE_VIDEO_UNIT_SHOT_REVISION_NOT_FOUND')
    }
    const remakeProjectIds = new Set(revisions.map((revision) => revision.shot.remakeProjectId))
    if (remakeProjectIds.size !== 1) {
      throw new Error('REMAKE_VIDEO_UNIT_PROJECT_MISMATCH')
    }
    for (const revision of revisions) {
      if (
        revision.lifecycleState !== 'active' ||
        revision.shot.currentRevision !== revision.revision
      ) {
        throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_NOT_CURRENT:${revision.id}`)
      }
    }

    // D-04: a shot revision belongs to at most one unit (DB unique backs this up)
    const alreadyAssigned = await client.remakeVideoUnitMember.findMany({
      where: { shotRevisionId: { in: memberShotRevisionIds } },
      select: { shotRevisionId: true },
    })
    if (alreadyAssigned.length) {
      throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED:${alreadyAssigned[0].shotRevisionId}`)
    }

    const unit = await client.remakeVideoUnit.create({
      data: { remakeProjectId: [...remakeProjectIds][0] },
    })
    await client.remakeVideoUnitMember.createMany({
      data: memberShotRevisionIds.map((shotRevisionId, index) => ({
        unitId: unit.id,
        shotRevisionId,
        ordinal: index + 1,
      })),
    })
    return { unitId: unit.id }
  })
}

/**
 * Ownership-scoped unit detail: members (ordinal + shot info + durationSeconds),
 * the unit track with batches/versions + adoptedVersion, and adoption events.
 * Mirrors getVideoTrackDetail's include shape for the unit variants.
 */
export async function getVideoUnitDetail(input: {
  projectId: string
  userId: string
  unitId: string
}) {
  const unit = await prisma.remakeVideoUnit.findFirst({
    where: {
      id: input.unitId,
      remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
    },
    include: {
      members: { orderBy: { ordinal: 'asc' } },
      tracks: {
        include: {
          adoptedVersion: true,
          batches: {
            orderBy: { createdAt: 'desc' },
            include: {
              versions: { orderBy: { ordinal: 'asc' }, include: { outputVersion: true } },
            },
          },
          adoptionEvents: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  })
  if (!unit) return null

  const revisionIds = unit.members.map((member) => member.shotRevisionId)
  const revisions = await prisma.remakeShotRevision.findMany({
    where: { id: { in: revisionIds } },
    include: { shot: { select: { id: true, stableKey: true, sequence: true } } },
  })
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]))

  const track = unit.tracks[0] ?? null // @@unique([unitId]) — at most one track
  return {
    unit: {
      id: unit.id,
      remakeProjectId: unit.remakeProjectId,
      userLabel: unit.userLabel,
      createdAt: unit.createdAt,
    },
    members: unit.members.map((member) => {
      const revision = revisionById.get(member.shotRevisionId)
      return {
        ordinal: member.ordinal,
        shotRevisionId: member.shotRevisionId,
        shotId: revision?.shot.id ?? null,
        stableKey: revision?.shot.stableKey ?? null,
        sequence: revision?.shot.sequence ?? null,
        durationSeconds: revision ? memberDurationSeconds(revision.payload) : null,
      }
    }),
    track: track
      ? {
          id: track.id,
          adoptedVersionId: track.adoptedVersionId,
          batches: track.batches.map((batch) => ({
            id: batch.id,
            taskId: batch.taskId,
            operationKey: batch.operationKey,
            modelId: batch.modelId,
            options: batch.modelOptions,
            orderedReferences: batch.orderedReferences,
            createdAt: batch.createdAt,
            versions: batch.versions.map((version) => ({
              id: version.id,
              ordinal: version.ordinal,
              outputVersionId: version.outputVersionId,
              mediaId: version.outputVersion.mediaId,
              status: version.outputVersion.status,
              invalidated: Boolean(version.outputVersion.invalidatedAt),
              note: version.note ?? null,
            })),
          })),
          adoptionEvents: track.adoptionEvents.map((event) => ({
            id: event.id,
            previousVersionId: event.previousVersionId,
            nextVersionId: event.nextVersionId,
            createdAt: event.createdAt,
          })),
        }
      : null,
  }
}

/**
 * D-19: mutate (add/remove/reorder) unit members. Members freeze at
 * generate-submit — the mutation is rejected while a queued/processing unit
 * task exists (REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT) or after the first
 * committed batch (REMAKE_VIDEO_UNIT_MEMBERS_FROZEN). New members are checked
 * against D-04 uniqueness inside the transaction.
 */
export async function updateVideoUnitMembers(input: {
  projectId: string
  userId: string
  unitId: string
  members: Array<{ shotRevisionId: string; ordinal: number }>
}) {
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const unit = await client.remakeVideoUnit.findFirst({
      where: {
        id: input.unitId,
        remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
      },
      select: { id: true },
    })
    if (!unit) throw new Error('REMAKE_VIDEO_UNIT_NOT_FOUND')

    // D-19: a pending/running generation task freezes members immediately
    const pendingTask = await client.task.findFirst({
      where: {
        targetType: 'remake_unit',
        targetId: input.unitId,
        status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
      },
      select: { id: true },
    })
    if (pendingTask) throw new Error('REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT')

    // D-19: the first committed batch freezes members for good
    const committedBatch = await client.remakeVideoUnitBatch.findFirst({
      where: { track: { unitId: input.unitId } },
      select: { id: true },
    })
    if (committedBatch) throw new Error('REMAKE_VIDEO_UNIT_MEMBERS_FROZEN')

    const existing = await client.remakeVideoUnitMember.findMany({
      where: { unitId: input.unitId },
      orderBy: { ordinal: 'asc' },
    })
    const submitted = [...input.members]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((member, index) => ({ shotRevisionId: member.shotRevisionId, ordinal: index + 1 }))
    const submittedIds = new Set(submitted.map((member) => member.shotRevisionId))
    const existingByShot = new Map(existing.map((member) => [member.shotRevisionId, member]))

    const removed = existing.filter((member) => !submittedIds.has(member.shotRevisionId))
    if (removed.length) {
      await client.remakeVideoUnitMember.deleteMany({
        where: { id: { in: removed.map((member) => member.id) } },
      })
    }

    // D-04: added members must not already belong to another unit
    for (const member of submitted) {
      if (existingByShot.has(member.shotRevisionId)) continue
      const duplicate = await client.remakeVideoUnitMember.findUnique({
        where: { shotRevisionId: member.shotRevisionId },
        select: { id: true },
      })
      if (duplicate) {
        throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED:${member.shotRevisionId}`)
      }
    }
    const added = submitted.filter((member) => !existingByShot.has(member.shotRevisionId))
    if (added.length) {
      await client.remakeVideoUnitMember.createMany({
        data: added.map((member) => ({
          unitId: input.unitId,
          shotRevisionId: member.shotRevisionId,
          ordinal: member.ordinal,
        })),
      })
    }
    for (const member of submitted) {
      const existingMember = existingByShot.get(member.shotRevisionId)
      if (!existingMember || existingMember.ordinal === member.ordinal) continue
      await client.remakeVideoUnitMember.update({
        where: { id: existingMember.id },
        data: { ordinal: member.ordinal },
      })
    }

    return {
      unitId: input.unitId,
      members: await client.remakeVideoUnitMember.findMany({
        where: { unitId: input.unitId },
        orderBy: { ordinal: 'asc' },
      }),
    }
  })
}

/**
 * D-22: verify a frozen unit snapshot is still current before appending —
 * the unit exists, the frozen member set matches the DB (same ordinals /
 * shotRevisionIds), every member's shot revision is still active/current, and
 * every member's adopted keyframe is unchanged. Any mismatch throws
 * REMAKE_VIDEO_UNIT_INPUT_STALE (races are additionally covered by the
 * fingerprint check in appendVideoUnitBatch).
 */
export async function assertVideoUnitSubmissionCurrent(
  snapshotLike: unknown,
  client: Client = prisma,
): Promise<void> {
  const snapshot = videoUnitInputSnapshotSchema.parse(snapshotLike)

  const unit = await client.remakeVideoUnit.findUnique({
    where: { id: snapshot.unitId },
    select: { id: true, remakeProjectId: true },
  })
  if (!unit || unit.remakeProjectId !== snapshot.remakeProjectId) {
    throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')
  }

  const frozenMembers = await client.remakeVideoUnitMember.findMany({
    where: { unitId: snapshot.unitId },
    orderBy: { ordinal: 'asc' },
  })
  if (frozenMembers.length !== snapshot.members.length) {
    throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')
  }
  for (let index = 0; index < snapshot.members.length; index += 1) {
    const expected = snapshot.members[index]
    const actual = frozenMembers[index]
    if (actual.ordinal !== expected.ordinal || actual.shotRevisionId !== expected.shotRevisionId) {
      throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')
    }
  }

  for (const member of snapshot.members) {
    const revision = await client.remakeShotRevision.findUnique({
      where: { id: member.shotRevisionId },
      include: { shot: { select: { currentRevision: true } } },
    })
    if (
      !revision ||
      revision.lifecycleState !== 'active' ||
      revision.shot.currentRevision !== revision.revision
    ) {
      throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')
    }
    const track = await client.remakeKeyframeTrack.findUnique({
      where: {
        shotRevisionId_slot: {
          shotRevisionId: member.shotRevisionId,
          slot: member.selectedKeyframe.slot,
        },
      },
      include: { adoptedCandidate: { include: { outputVersion: true } } },
    })
    if (track?.adoptedCandidate?.outputVersion?.mediaId !== member.selectedKeyframe.mediaId) {
      throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')
    }
  }
}

/** Fingerprint helper re-export so callers freeze the same D-22 hash. */
export { unitInputFingerprint }
export type { VideoUnitInputSnapshot }
