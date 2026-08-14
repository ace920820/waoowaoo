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
  userLabel?: string
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
      data: {
        remakeProjectId: [...remakeProjectIds][0],
        ...(input.userLabel ? { userLabel: input.userLabel } : {}),
      },
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
      dissolvedAt: unit.dissolvedAt,
      dissolvedReason: unit.dissolvedReason,
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
 * D-14: update the user-facing unit label (ownership-scoped). `null` clears it.
 */
export async function updateVideoUnitLabel(input: {
  projectId: string
  userId: string
  unitId: string
  userLabel: string | null
}) {
  const unit = await prisma.remakeVideoUnit.findFirst({
    where: {
      id: input.unitId,
      remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
    },
    select: { id: true },
  })
  if (!unit) throw new Error('REMAKE_VIDEO_UNIT_NOT_FOUND')
  const updated = await prisma.remakeVideoUnit.update({
    where: { id: unit.id },
    data: { userLabel: input.userLabel },
  })
  return { id: updated.id, userLabel: updated.userLabel }
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
  members: Array<{
    shotRevisionId: string
    ordinal: number
    /** 该成员引用哪个 slot 的已采用关键帧（start|middle|end）；省略 = 保持原值（新建时 null=默认 middle 策略） */
    keyframeSlot?: 'start' | 'middle' | 'end' | null
  }>
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

    // D-19 (revised): a pending/running generation task freezes members
    // immediately; committed batches NO LONGER freeze members — after a
    // member change the unit's existing versions are invalidated (needs_review)
    // and the user can regenerate.
    const pendingTask = await client.task.findFirst({
      where: {
        targetType: 'remake_unit',
        targetId: input.unitId,
        status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
      },
      select: { id: true },
    })
    if (pendingTask) throw new Error('REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT')

    const existing = await client.remakeVideoUnitMember.findMany({
      where: { unitId: input.unitId },
      orderBy: { ordinal: 'asc' },
    })
    const submitted = [...input.members]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((member, index) => ({
        shotRevisionId: member.shotRevisionId,
        ordinal: index + 1,
        keyframeSlot: member.keyframeSlot ?? null,
      }))
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
          keyframeSlot: member.keyframeSlot ?? undefined,
        })),
      })
    }
    let orderChanged = false
    let slotChanged = false
    for (const member of submitted) {
      const existingMember = existingByShot.get(member.shotRevisionId)
      if (!existingMember) continue
      if (existingMember.ordinal !== member.ordinal) {
        orderChanged = true
        await client.remakeVideoUnitMember.update({
          where: { id: existingMember.id },
          data: { ordinal: member.ordinal },
        })
      }
      // keyframeSlot change counts as a member change → invalidates old versions
      if ((existingMember.keyframeSlot ?? null) !== member.keyframeSlot) {
        slotChanged = true
        await client.remakeVideoUnitMember.update({
          where: { id: existingMember.id },
          data: { keyframeSlot: member.keyframeSlot },
        })
      }
    }

    // 成员集合/顺序/引用关键帧实际变化时，失效该 unit 自身的旧视频版本（needs_review）。
    // 只碰 unit batch 里的 versions；成员镜头的关键帧/Prompt/其他产物不受影响。
    const membersChanged = removed.length > 0 || added.length > 0 || orderChanged || slotChanged
    let invalidatedCount = 0
    if (membersChanged) {
      const unitBatches = await client.remakeVideoUnitBatch.findMany({
        where: { track: { unitId: input.unitId } },
        include: { versions: { include: { outputVersion: true } } },
      })
      const versionIds: Array<{ id: string; outputVersionId: string; batchId: string }> = []
      for (const batch of unitBatches) {
        for (const version of batch.versions) {
          if (version.outputVersion.invalidatedAt || version.outputVersion.status !== 'completed') {
            continue
          }
          versionIds.push({
            id: version.id,
            outputVersionId: version.outputVersionId,
            batchId: batch.id,
          })
        }
      }
      invalidatedCount = versionIds.length
      if (versionIds.length > 0) {
        await client.remakeOutputVersion.updateMany({
          where: { id: { in: versionIds.map((version) => version.outputVersionId) } },
          data: { invalidatedAt: new Date(), status: 'needs_review' },
        })
        const unitTrack = await client.remakeVideoUnitTrack.findUnique({
          where: { unitId: input.unitId },
          select: { id: true },
        })
        // RemakeInvalidation.shotId is required — anchor on the unit's first
        // remaining member's shot (resolved via its revision), or the first
        // removed member's shot when the unit is left empty.
        const anchorRevision = await client.remakeShotRevision.findFirst({
          where: {
            id: { in: submitted.map((member) => member.shotRevisionId) },
          },
          select: { shotId: true },
        })
        const anchorShotId = anchorRevision?.shotId ?? null
        for (const version of versionIds) {
          const existingInvalidation = await client.remakeInvalidation.findFirst({
            where: {
              shotId: anchorShotId ?? undefined,
              unitTrackId: unitTrack?.id ?? null,
              unitVersionId: version.id,
              reason: 'unit_members_changed',
            },
            select: { id: true },
          })
          if (existingInvalidation) continue
          await client.remakeInvalidation.create({
            data: {
              shotId: anchorShotId ?? '',
              unitTrackId: unitTrack?.id ?? null,
              unitBatchId: version.batchId,
              unitVersionId: version.id,
              reason: 'unit_members_changed',
              status: 'needs_review',
            },
          })
        }
      }
    }

    return {
      unitId: input.unitId,
      members: await client.remakeVideoUnitMember.findMany({
        where: { unitId: input.unitId },
        orderBy: { ordinal: 'asc' },
      }),
      invalidated: invalidatedCount,
    }
  })
}

/**
 * D-19 (revised): soft-delete dissolve a unit. Generated assets
 * (tracks/batches/versions/outputVersions/actionSheets) are ALL preserved and
 * remain viewable; the unit is marked dissolvedAt and its member associations
 * are removed so the shots regain single-shot / re-merge capability (D-04
 * release). A pending/running generation task blocks the dissolve.
 */
export async function dissolveVideoUnit(input: {
  projectId: string
  userId: string
  unitId: string
  reason?: string
}) {
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const unit = await client.remakeVideoUnit.findFirst({
      where: {
        id: input.unitId,
        remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
      },
      select: { id: true, dissolvedAt: true },
    })
    if (!unit) throw new Error('REMAKE_VIDEO_UNIT_NOT_FOUND')
    if (unit.dissolvedAt) {
      // Idempotent: already dissolved.
      return { unitId: input.unitId, dissolvedAt: unit.dissolvedAt }
    }

    const pendingTask = await client.task.findFirst({
      where: {
        targetType: 'remake_unit',
        targetId: input.unitId,
        status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
      },
      select: { id: true },
    })
    if (pendingTask) throw new Error('REMAKE_VIDEO_UNIT_GENERATION_IN_FLIGHT')

    // Release member associations (assets stay in batch inputSnapshot for audit).
    await client.remakeVideoUnitMember.deleteMany({ where: { unitId: input.unitId } })

    const updated = await client.remakeVideoUnit.update({
      where: { id: unit.id },
      data: {
        dissolvedAt: new Date(),
        ...(input.reason ? { dissolvedReason: input.reason.slice(0, 2000) } : {}),
      },
    })
    return { unitId: updated.id, dissolvedAt: updated.dissolvedAt }
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

/**
 * D-17/D-22: append an immutable unit batch/version after generation,
 * mirroring appendVideoGenerationBatch: fingerprint re-verification, unit
 * currentness re-assertion, track ensure-on-first-batch, trackId_operationKey
 * idempotent dedup, and a unitBatchId-linked provenance record.
 */
export async function appendVideoUnitBatch(input: {
  taskId: string
  operationKey: string
  inputSnapshot: VideoUnitInputSnapshot
  inputFingerprint: string
  mediaId: string
}) {
  const snapshot = videoUnitInputSnapshotSchema.parse(input.inputSnapshot)
  if (input.inputFingerprint !== unitInputFingerprint(snapshot)) {
    throw new Error('REMAKE_VIDEO_UNIT_FINGERPRINT_INVALID')
  }
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    await assertVideoUnitSubmissionCurrent(snapshot, client)

    const existingTrack = await client.remakeVideoUnitTrack.findUnique({
      where: { unitId: snapshot.unitId },
      select: { id: true },
    })
    const track =
      existingTrack ??
      (await client.remakeVideoUnitTrack.create({
        data: { unitId: snapshot.unitId },
      }))

    const existing = await client.remakeVideoUnitBatch.findUnique({
      where: {
        trackId_operationKey: { trackId: track.id, operationKey: input.operationKey },
      },
      include: { versions: { orderBy: { ordinal: 'asc' }, select: { id: true } } },
    })
    if (existing) {
      return { batchId: existing.id, versionIds: existing.versions.map((v) => v.id) }
    }

    // Open Question 1 resolution: batch promptVersionId = first member's.
    const firstMember = snapshot.members[0]
    const firstRevision = await client.remakeShotRevision.findUnique({
      where: { id: firstMember.shotRevisionId },
      select: { shotId: true },
    })
    if (!firstRevision) throw new Error('REMAKE_VIDEO_UNIT_INPUT_STALE')

    const batch = await client.remakeVideoUnitBatch.create({
      data: {
        trackId: track.id,
        promptVersionId: firstMember.promptVersionId,
        taskId: input.taskId,
        operationKey: input.operationKey,
        inputFingerprint: input.inputFingerprint,
        inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
        modelId: snapshot.model.id,
        modelOptions: JSON.parse(JSON.stringify(snapshot.options)),
        orderedReferences: JSON.parse(JSON.stringify(snapshot.orderedReferences)),
        versions: {
          create: {
            ordinal: 1,
            outputVersion: {
              create: {
                shotId: firstRevision.shotId,
                revisionId: firstMember.shotRevisionId,
                mediaId: input.mediaId,
                kind: 'video_candidate_unit',
                fingerprint: `${input.operationKey}:${input.inputFingerprint}:1`,
                taskId: input.taskId,
                inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
                status: 'completed',
              },
            },
          },
        },
      },
    })
    const versions = await client.remakeVideoUnitVersion.findMany({
      where: { batchId: batch.id },
      orderBy: { ordinal: 'asc' },
      select: { id: true },
    })
    await client.remakeProvenanceRecord.create({
      data: {
        shotId: firstRevision.shotId,
        unitBatchId: batch.id,
        schema: 'remake-video-unit-generation@1',
        executor: 'video-worker',
        payload: JSON.stringify({
          inputFingerprint: input.inputFingerprint,
          model: snapshot.model.id,
          durationSeconds: snapshot.durationSeconds,
          referenceCount: snapshot.orderedReferences.length,
        }),
      },
    })
    return { batchId: batch.id, versionIds: versions.map((v) => v.id) }
  })
}

/**
 * D-17: adopt a unit version — sets the unit-track adoption pointer, writes an
 * append-only adoption event, requires explicit confirmReplace when replacing,
 * rejects non-completed/invalidated versions, and re-checks input currentness
 * (every frozen member revision must still be active/current).
 */
export async function adoptVideoUnitVersion(input: {
  projectId: string
  userId: string
  trackId: string
  versionId: string
  confirmReplace?: boolean
}) {
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const track = await client.remakeVideoUnitTrack.findFirst({
      where: {
        id: input.trackId,
        unit: {
          remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
        },
      },
      include: { adoptedVersion: true },
    })
    if (!track) throw new Error('REMAKE_VIDEO_UNIT_TRACK_NOT_FOUND')

    // Replacing an existing adoption requires explicit confirmation (D-15)
    if (track.adoptedVersionId && track.adoptedVersionId !== input.versionId && !input.confirmReplace) {
      throw new Error('REMAKE_VIDEO_UNIT_REPLACE_CONFIRM_REQUIRED')
    }

    const version = await client.remakeVideoUnitVersion.findFirst({
      where: {
        id: input.versionId,
        batch: { trackId: track.id },
        outputVersion: { invalidatedAt: null, status: 'completed' },
      },
      include: { batch: true, outputVersion: true },
    })
    if (!version) throw new Error('REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND')

    // D-17 stale-input check: every frozen member revision still active/current
    const snapshot = videoUnitInputSnapshotSchema.parse(version.batch.inputSnapshot)
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
    }

    // No-op if already adopted
    if (track.adoptedVersionId === version.id) {
      return { id: track.id, adoptedVersionId: track.adoptedVersionId }
    }

    const previousId = track.adoptedVersionId
    const updated = await client.remakeVideoUnitTrack.update({
      where: { id: track.id },
      data: { adoptedVersionId: version.id },
    })
    await client.remakeVideoUnitAdoptionEvent.create({
      data: {
        trackId: track.id,
        previousVersionId: previousId,
        nextVersionId: version.id,
        reviewerId: input.userId,
      },
    })
    return { id: updated.id, adoptedVersionId: updated.adoptedVersionId }
  })
}

/** D-17: attach/replace the review note on an owned unit version. */
export async function setVideoUnitReviewNote(input: {
  projectId: string
  userId: string
  versionId: string
  note: string
}) {
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const version = await client.remakeVideoUnitVersion.findFirst({
      where: {
        id: input.versionId,
        batch: {
          track: {
            unit: {
              remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
            },
          },
        },
      },
    })
    if (!version) throw new Error('REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND')
    const updated = await client.remakeVideoUnitVersion.update({
      where: { id: version.id },
      data: { note: input.note.slice(0, 2000), reviewerId: input.userId },
    })
    return { id: updated.id, note: updated.note }
  })
}

/** D-17: reconfirm the adopted unit version — clears needs_review unit
 * invalidation rows and the output invalidatedAt idempotently, and records an
 * append-only reconfirmation event. */
export async function reconfirmVideoUnitVersion(input: {
  projectId: string
  userId: string
  trackId: string
  versionId: string
}) {
  return await prisma.$transaction(async (tx) => {
    const client = tx as Client
    const track = await client.remakeVideoUnitTrack.findFirst({
      where: {
        id: input.trackId,
        unit: {
          remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
        },
      },
      include: { adoptedVersion: true },
    })
    if (!track) throw new Error('REMAKE_VIDEO_UNIT_TRACK_NOT_FOUND')

    // Only the currently adopted version can be reconfirmed (D-19)
    if (track.adoptedVersionId !== input.versionId) {
      throw new Error('REMAKE_VIDEO_UNIT_RECONFIRM_NOT_ADOPTED')
    }

    const version = await client.remakeVideoUnitVersion.findFirst({
      where: { id: input.versionId, batch: { trackId: track.id } },
      include: { outputVersion: true },
    })
    if (!version) throw new Error('REMAKE_VIDEO_UNIT_VERSION_NOT_FOUND')

    await client.remakeInvalidation.updateMany({
      where: { unitVersionId: version.id, status: 'needs_review' },
      data: { status: 'reconfirmed' },
    })

    if (version.outputVersion.invalidatedAt) {
      await client.remakeOutputVersion.update({
        where: { id: version.outputVersionId },
        data: { invalidatedAt: null, status: 'completed' },
      })
    }

    await client.remakeVideoUnitAdoptionEvent.create({
      data: {
        trackId: track.id,
        previousVersionId: version.id,
        nextVersionId: version.id,
        reviewerId: input.userId,
      },
    })

    return { id: track.id, adoptedVersionId: track.adoptedVersionId, reconfirmed: true }
  })
}

/**
 * Track-scoped unit version history (ownership-filtered), mirroring
 * getVideoTrackDetail's shape for the unit variants.
 */
export async function getVideoUnitTrackDetail(input: {
  projectId: string
  userId: string
  trackId: string
}) {
  const track = await prisma.remakeVideoUnitTrack.findFirst({
    where: {
      id: input.trackId,
      unit: {
        remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
      },
    },
    include: {
      adoptedVersion: true,
      batches: {
        orderBy: { createdAt: 'desc' },
        include: {
          versions: { orderBy: { ordinal: 'asc' }, include: { outputVersion: true } },
        },
      },
      adoptionEvents: { orderBy: { createdAt: 'desc' } },
      unit: { select: { id: true } },
    },
  })
  if (!track) return null
  return {
    track: {
      id: track.id,
      unitId: track.unit.id,
      adoptedVersionId: track.adoptedVersionId,
    },
    history: track.batches.map((batch) => ({
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
}
