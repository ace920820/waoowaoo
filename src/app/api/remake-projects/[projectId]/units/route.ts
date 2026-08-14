import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { createVideoUnit } from '@/lib/remake-projects/unit/service'

/**
 * Authenticated unit create endpoint (D-02/D-04). Strict Zod body:
 * memberShotRevisionIds (>= 2) + optional userLabel. The D-04 unique
 * membership constraint is enforced by createVideoUnit inside its transaction
 * (T-091-14: ownership-scoped, T-091-09: in-transaction re-checks).
 */

const createSchema = z.object({
  memberShotRevisionIds: z.array(z.string().uuid()).min(2),
  userLabel: z.string().trim().max(200).optional(),
}).strict()

export const POST = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth

    const body = createSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
      throw new ApiError('INVALID_PARAMS', { details: 'Invalid unit create request' })
    }

    try {
      const result = await createVideoUnit({
        projectId,
        userId: auth.session.user.id,
        memberShotRevisionIds: body.data.memberShotRevisionIds,
        ...(body.data.userLabel ? { userLabel: body.data.userLabel } : {}),
      })
      return NextResponse.json(
        {
          unitId: result.unitId,
          members: body.data.memberShotRevisionIds.map((shotRevisionId, index) => ({
            shotRevisionId,
            ordinal: index + 1,
          })),
        },
        { status: 201 },
      )
    } catch (error) {
      if (error instanceof Error && /ALREADY_ASSIGNED/.test(error.message)) {
        throw new ApiError('CONFLICT', { details: error.message })
      }
      if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
        throw new ApiError('NOT_FOUND', { details: error.message })
      }
      if (error instanceof Error && /MISMATCH|MIN_MEMBERS|NOT_CURRENT/.test(error.message)) {
        throw new ApiError('INVALID_PARAMS', { details: error.message })
      }
      throw error
    }
  },
)
