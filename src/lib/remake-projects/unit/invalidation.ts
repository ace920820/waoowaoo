import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { videoUnitInputSnapshotSchema } from './contracts'

/**
 * D-22: propagate upstream keyframe/prompt invalidation to unit versions.
 *
 * Mirrors `invalidateRemakeVideoVersions` (video/invalidation.ts) for the unit
 * granularity: finds invalidated keyframe/action-sheet media ids for the shot,
 * scans unit batches whose `orderedReferences.mediaId` intersect OR whose
 * frozen snapshot member `promptVersionId` is an invalidated prompt version,
 * marks their output versions needs_review, and creates idempotent
 * `RemakeInvalidation` rows carrying unitVersionId/unitBatchId. Adoption
 * pointers and history are preserved.
 */
export async function invalidateRemakeVideoUnitVersions(input: {
  tx?: unknown
  shotId: string
  revisionId: string
  reason: string
}) {
  const write = async (tx: Prisma.TransactionClient) => {
    const invalidatedOutputs = await tx.remakeOutputVersion.findMany({
      where: {
        shotId: input.shotId,
        OR: [{ revisionId: null }, { revisionId: { not: input.revisionId } }],
        kind: { in: ['keyframe_candidate', 'action_sheet'] },
      },
      select: { id: true, mediaId: true },
    })
    const invalidatedMediaIds = invalidatedOutputs
      .map((output: { mediaId: string | null }) => output.mediaId)
      .filter((id): id is string => Boolean(id))

    const invalidatedPromptVersions = await tx.remakePromptVersion.findMany({
      where: { invalidatedAt: { not: null }, track: { shotId: input.shotId } },
      select: { id: true },
    })
    const invalidatedPromptVersionIds = invalidatedPromptVersions.map(
      (prompt: { id: string }) => prompt.id,
    )

    // Unit members reference revisions of this shot — find the owning units.
    const shotRevisions = await tx.remakeShotRevision.findMany({
      where: { shotId: input.shotId },
      select: { id: true },
    })
    const unitMembers = await tx.remakeVideoUnitMember.findMany({
      where: { shotRevisionId: { in: shotRevisions.map((revision) => revision.id) } },
      select: { unitId: true },
    })
    const unitIds = [...new Set(unitMembers.map((member) => member.unitId))]
    if (!unitIds.length) return { invalidated: 0 }

    const unitBatches = await tx.remakeVideoUnitBatch.findMany({
      where: { track: { unitId: { in: unitIds } } },
      include: { versions: { include: { outputVersion: true } } },
    })

    const versionsToInvalidate: Array<{
      id: string
      outputVersionId: string
      batchId: string
    }> = []
    for (const batch of unitBatches) {
      const refs = batch.orderedReferences as Array<{ mediaId: string }> | null
      const parsed = videoUnitInputSnapshotSchema.safeParse(batch.inputSnapshot)
      const memberPromptVersionIds = parsed.success
        ? parsed.data.members.map((member) => member.promptVersionId)
        : []
      const hasStaleRef =
        Array.isArray(refs) && refs.some((ref) => invalidatedMediaIds.includes(ref.mediaId))
      const hasStalePrompt = memberPromptVersionIds.some((id) =>
        invalidatedPromptVersionIds.includes(id),
      )
      if (!hasStaleRef && !hasStalePrompt) continue

      for (const version of batch.versions) {
        // T-091-12: only completed unit versions are marked needs_review
        if (version.outputVersion.invalidatedAt || version.outputVersion.status !== 'completed') {
          continue
        }
        versionsToInvalidate.push({
          id: version.id,
          outputVersionId: version.outputVersionId,
          batchId: batch.id,
        })
      }
    }

    if (!versionsToInvalidate.length) return { invalidated: 0 }

    await tx.remakeOutputVersion.updateMany({
      where: { id: { in: versionsToInvalidate.map((version) => version.outputVersionId) } },
      data: { invalidatedAt: new Date(), status: 'needs_review' },
    })

    let created = 0
    for (const version of versionsToInvalidate) {
      const existing = await tx.remakeInvalidation.findFirst({
        where: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          unitVersionId: version.id,
          reason: input.reason,
        },
        select: { id: true },
      })
      if (existing) continue
      await tx.remakeInvalidation.create({
        data: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          unitBatchId: version.batchId,
          unitVersionId: version.id,
          reason: input.reason,
          status: 'needs_review',
        },
      })
      created += 1
    }

    return { invalidated: created }
  }

  return input.tx
    ? write(input.tx as Prisma.TransactionClient)
    : prisma.$transaction(write)
}
