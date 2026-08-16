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
import { validateActionSheetGridShape, type ActionSheetGrid } from '@/lib/remake-projects/unit/action-sheet-layout'

/**
 * On-demand merged action-sheet preview (W5 / D-16 WYSIWYG / Phase 09.3).
 *
 * GET /units/preview
 *   ?unitId=...            renders the saved action-sheet grid layout when the
 *                          unit has one, else the legacy per-member sheet
 *   ?memberShotRevisionIds=a,b,c   legacy per-member rendering
 *   ?unitId=...&grid={json}  renders the DRAFT x-grid layout (drag editor live
 *                          preview) — highest priority, never persisted
 *
 * Always renders via the PURE renderUnitActionSheet WITHOUT persisting anything
 * (the persisted sheet is the worker's job via renderAndPersistUnitActionSheet).
 */

const idSchema = z.string().uuid()

const gridQuerySchema = z.object({
  columns: z.number().int().min(1).max(4),
  cells: z.array(
    z.object({
      shotNumber: z.number().int().positive(),
      slot: z.enum(['start', 'middle', 'end']),
      mediaId: z.string().uuid(),
    }).strict(),
  ).min(2).max(16),
}).strict()

function slotLabel(slot: 'start' | 'middle' | 'end'): string {
  return slot === 'start' ? '首' : slot === 'end' ? '尾' : '中'
}

async function renderGrid(grid: ActionSheetGrid): Promise<Buffer> {
  const sources: UnitActionSheetSource[] = await Promise.all(
    grid.cells.map(async (cell, index) => {
      const media = await getMediaObjectById(cell.mediaId)
      const storageKey = media?.storageKey
      if (!storageKey) throw new ApiError('INVALID_PARAMS', { details: 'REMAKE_ACTION_SHEET_SOURCE_UNAVAILABLE' })
      return {
        ordinal: index + 1,
        mediaId: cell.mediaId,
        timestamp: index * 1000,
        label: `镜头${cell.shotNumber}·${slotLabel(cell.slot)}`,
        buffer: await getObjectBuffer(storageKey),
      }
    }),
  )
  return renderUnitActionSheet(sources, { columns: grid.columns })
}

export const GET = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth

    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId')
    const memberShotRevisionIds = searchParams.get('memberShotRevisionIds')
    const gridParam = searchParams.get('grid')

    // Phase 09.3: draft grid (drag editor live preview) has highest priority.
    if (gridParam) {
      let parsed: unknown
      try {
        parsed = JSON.parse(gridParam)
      } catch {
        throw new ApiError('INVALID_PARAMS', { details: 'grid must be valid JSON' })
      }
      const shape = validateActionSheetGridShape(parsed)
      if (!shape.ok) throw new ApiError('INVALID_PARAMS', { details: shape.reason })
      const gridResult = gridQuerySchema.safeParse(parsed)
      if (!gridResult.success) throw new ApiError('INVALID_PARAMS', { details: 'grid cells invalid' })
      const buffer = await renderGrid(gridResult.data)
      return new Response(new Uint8Array(buffer), { headers: { 'content-type': 'image/jpeg' } })
    }

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

      // Phase 09.3: a saved grid layout renders the composed sheet.
      const savedGrid = (unit as { actionSheetGrid?: unknown }).actionSheetGrid
      if (savedGrid) {
        const shape = validateActionSheetGridShape(savedGrid)
        if (shape.ok) {
          const gridResult = gridQuerySchema.safeParse(savedGrid)
          if (gridResult.success) {
            const buffer = await renderGrid(gridResult.data)
            return new Response(new Uint8Array(buffer), { headers: { 'content-type': 'image/jpeg' } })
          }
        }
      }
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
