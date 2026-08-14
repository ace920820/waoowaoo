import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMediaObjectById } from '@/lib/media/service'
import { getObjectBuffer } from '@/lib/storage'
import { collectUnitMemberKeyframeCandidates } from '@/lib/remake-projects/unit/references'
import {
  renderUnitActionSheet,
  type UnitActionSheetSource,
} from '@/lib/remake-projects/keyframes/action-sheet'

/**
 * On-demand merged action-sheet preview (W5 / D-16 WYSIWYG).
 *
 * GET /units/preview?unitId=...  OR  ?memberShotRevisionIds=a,b,c renders the
 * merged sheet via the PURE renderUnitActionSheet WITHOUT persisting anything —
 * optionally bounded to a 2..9 source set (T-091-17) and ownership-scoped
 * (T-091-14). The persisted sheet is the worker's job (Plan 09.1-05 via
 * renderAndPersistUnitActionSheet); this endpoint never calls the persist
 * helper and never writes a RemakeVideoUnitActionSheet row.
 */

const idSchema = z.string().uuid()

export const GET = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth

    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId')
    const memberShotRevisionIds = searchParams.get('memberShotRevisionIds')

    let members: Array<{ shotRevisionId: string; ordinal: number }>
    if (unitId) {
      if (!idSchema.safeParse(unitId).success) throw new ApiError('INVALID_PARAMS')
      const unit = await prisma.remakeVideoUnit.findFirst({
        where: {
          id: unitId,
          remakeProject: { projectId, project: { userId: auth.session.user.id } },
        },
        include: { members: { orderBy: { ordinal: 'asc' } } },
      })
      if (!unit) throw new ApiError('NOT_FOUND')
      members = unit.members.map((member) => ({
        shotRevisionId: member.shotRevisionId,
        ordinal: member.ordinal,
      }))
    } else if (memberShotRevisionIds) {
      const ids = memberShotRevisionIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
      if (ids.length === 0 || ids.some((id) => !idSchema.safeParse(id).success)) {
        throw new ApiError('INVALID_PARAMS')
      }
      // Ownership-scoped verification: every revision must belong to this project.
      const owned = await prisma.remakeShotRevision.findMany({
        where: {
          id: { in: ids },
          shot: { remakeProject: { projectId, project: { userId: auth.session.user.id } } },
        },
        select: { id: true },
      })
      if (owned.length !== ids.length) throw new ApiError('NOT_FOUND')
      members = ids.map((id, index) => ({ shotRevisionId: id, ordinal: index + 1 }))
    } else {
      throw new ApiError('INVALID_PARAMS')
    }

    // T-091-17: bounded 2..9 source set — the merged renderer rejects outside.
    if (members.length < 2 || members.length > 9) {
      throw new ApiError('INVALID_PARAMS')
    }

    const candidates = await collectUnitMemberKeyframeCandidates({ members })
    const sources: UnitActionSheetSource[] = await Promise.all(
      candidates.map(async (candidate) => {
        const mediaId = candidate.mediaId ?? ''
        const media = await getMediaObjectById(mediaId)
        const storageKey = media?.storageKey ?? candidate.mediaUrl
        if (!storageKey) throw new ApiError('INVALID_PARAMS', { details: 'REMAKE_ACTION_SHEET_SOURCE_UNAVAILABLE' })
        return {
          ordinal: candidate.ordinal,
          mediaId,
          timestamp: candidate.ordinal * 1000,
          buffer: await getObjectBuffer(storageKey),
        }
      }),
    )

    // W5: render on demand via the pure renderer — never persist.
    const buffer = await renderUnitActionSheet(sources)
    return new Response(new Uint8Array(buffer), { headers: { 'content-type': 'image/jpeg' } })
  },
)
