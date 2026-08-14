import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { updateVideoUnitMembers } from '@/lib/remake-projects/unit/service'

/**
 * Unit member mutation route (D-19). PATCH add/remove/reorder/keyframe-slot
 * succeeds only while no queued/processing generation task exists;
 * updateVideoUnitMembers diffs the member set (D-04 uniqueness re-checked
 * in-transaction) and invalidates the unit's old versions on any change.
 * In-flight -> 409 CONFLICT.
 */

const idSchema = z.string().uuid()

const membersSchema = z.object({
  members: z.array(
    z.object({
      shotRevisionId: z.string().uuid(),
      ordinal: z.number().int().min(1),
      keyframeSlot: z.enum(['start', 'middle', 'end']).optional().nullable(),
    }).strict(),
  ).min(2),
}).strict()

export const PATCH = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; unitId: string }> }) => {
    const { projectId, unitId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth
    if (!idSchema.safeParse(unitId).success) throw new ApiError('NOT_FOUND')

    const body = membersSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new ApiError('INVALID_PARAMS')

    try {
      const result = await updateVideoUnitMembers({
        projectId,
        userId: auth.session.user.id,
        unitId,
        members: body.data.members,
      })
      return NextResponse.json({ unitId, members: result.members })
    } catch (error) {
      if (error instanceof Error && /(?:FROZEN|IN_FLIGHT|ALREADY_ASSIGNED)/.test(error.message)) {
        throw new ApiError('CONFLICT', { details: error.message })
      }
      if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
        throw new ApiError('NOT_FOUND', { details: error.message })
      }
      throw error
    }
  },
)
