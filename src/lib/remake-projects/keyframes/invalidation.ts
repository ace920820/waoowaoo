import { prisma } from '@/lib/prisma'
import { invalidateRemakeVideoVersions } from '../video/invalidation'
import type { Prisma } from '@prisma/client'


/**
 * Mark every generated keyframe/action-sheet output from a Shot's prior
 * history as stale. Rows are retained for auditability and the write is
 * idempotent for a given revision/reason/output tuple.
 */
export async function invalidateKeyframeOutputsForRevision(input: {
  tx?: unknown
  shotId: string
  revisionId: string
  reason: string
}) {
  const write = async (tx: Prisma.TransactionClient) => {
    const outputs = await tx.remakeOutputVersion.findMany({
      where: {
        shotId: input.shotId,
        OR: [
          { revisionId: null },
          { revisionId: { not: input.revisionId } },
        ],
        kind: { in: ['keyframe_candidate', 'action_sheet'] },
      },
      select: { id: true },
    })

    if (!outputs.length) return { invalidated: 0 }

    await tx.remakeOutputVersion.updateMany({
      where: { id: { in: outputs.map((output: { id: string }) => output.id) } },
      data: { invalidatedAt: new Date(), status: 'invalidated' },
    })

    let created = 0
    for (const output of outputs) {
      const existing = await tx.remakeInvalidation.findFirst({
        where: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          outputVersionId: output.id,
          reason: input.reason,
        },
        select: { id: true },
      })
      if (existing) continue
      await tx.remakeInvalidation.create({
        data: {
          shotId: input.shotId,
          revisionId: input.revisionId,
          outputVersionId: output.id,
          reason: input.reason,
          status: 'needs_review',
        },
      })
      created += 1
    }
    // Also propagate invalidation to video versions that reference these outputs (D-17)
    await invalidateRemakeVideoVersions({
      tx,
      shotId: input.shotId,
      revisionId: input.revisionId,
      reason: input.reason,
    })

    return { invalidated: created }
  }

  return input.tx ? write(input.tx as Prisma.TransactionClient) : prisma.$transaction(write)
}
