import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Mark every generated video version whose input references (keyframes or
 * action sheet) have been invalidated as stale. History and adoption pointers
 * are preserved; only the review flag and output status change.
 *
 * Called from keyframe/action-sheet invalidation when upstream inputs change.
 */
export async function invalidateRemakeVideoVersions(input: {
  tx?: unknown
  shotId: string
  revisionId: string
  reason: string
}) {
  const write = async (tx: Prisma.TransactionClient) => {
    // Find all video batches in the current revision whose orderedReferences
    // include any invalidated output versions from this revision
    const invalidatedOutputs = await tx.remakeOutputVersion.findMany({
      where: {
        shotId: input.shotId,
        OR: [
          { revisionId: null },
          { revisionId: { not: input.revisionId } },
        ],
        kind: { in: ['keyframe_candidate', 'action_sheet'] },
      },
      select: { id: true, mediaId: true },
    })
    const invalidatedMediaIds = invalidatedOutputs
      .map((o: { mediaId: string | null }) => o.mediaId)
      .filter((id): id is string => Boolean(id))

    if (!invalidatedMediaIds.length) return { invalidated: 0 }

    // Find video batches in the current revision
    const currentTracks = await tx.remakeVideoTrack.findMany({
      where: { shotRevisionId: input.revisionId },
      include: {
        batches: {
          include: {
            versions: { include: { outputVersion: true } },
          },
        },
      },
    })

    const versionsToInvalidate: Array<{ id: string; outputVersionId: string }> = []

    for (const track of currentTracks) {
      for (const batch of track.batches) {
        const refs = batch.orderedReferences as Array<{ mediaId: string }> | null
        if (!refs || !Array.isArray(refs)) continue

        const hasStaleRef = refs.some((ref) =>
          invalidatedMediaIds.includes(ref.mediaId),
        )
        if (!hasStaleRef) continue

        for (const version of batch.versions) {
          if (!version.outputVersion.invalidatedAt) {
            versionsToInvalidate.push({
              id: version.id,
              outputVersionId: version.outputVersionId,
            })
          }
        }
      }
    }

    if (!versionsToInvalidate.length) return { invalidated: 0 }

    // Mark output versions as invalidated
    await tx.remakeOutputVersion.updateMany({
      where: {
        id: { in: versionsToInvalidate.map((v) => v.outputVersionId) },
      },
      data: { invalidatedAt: new Date(), status: 'needs_review' },
    })

    // Create invalidation records (idempotent)
    let created = 0
    for (const version of versionsToInvalidate) {
      const existing = await tx.remakeInvalidation.findFirst({
        where: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          videoVersionId: version.id,
          reason: input.reason,
        },
        select: { id: true },
      })
      if (existing) continue
      await tx.remakeInvalidation.create({
        data: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          videoVersionId: version.id,
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
