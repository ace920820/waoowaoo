import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import {
  getVideoUnitDetail,
  updateVideoUnitLabel,
} from '@/lib/remake-projects/unit/service'
import { buildVideoUnitSubmission } from '@/lib/remake-projects/unit/submission'
import { submitTask } from '@/lib/task/submitter'

/**
 * Unit detail / label / generate route (D-02/D-14/D-19/D-21/D-22).
 *
 * The generate action is pinned to THIS file (there is NO separate
 * `[unitId]/generate/route.ts` — I1 from the plan checker): POST with
 * `{ action: 'generate', operationKey, model?, options? }` runs
 * buildVideoUnitSubmission (per-member gate + WYSIWYG freeze) and enqueues the
 * fingerprinted task (submitTask is queue-independent; the worker lands in
 * Plan 09.1-05). Error mapping mirrors the single-shot video route:
 * STALE/MISSING/NOT_APPROVED -> CONFLICT, NOT_FOUND -> 404,
 * INVALID/TOO_LONG/MISMATCH -> INVALID_PARAMS.
 */

const idSchema = z.string().uuid()

const labelSchema = z.object({
  userLabel: z.string().trim().max(200).nullable(),
}).strict()

const generateSchema = z.object({
  action: z.literal('generate'),
  operationKey: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).optional(),
  options: z.record(z.unknown()).default({}),
}).strict()

export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ projectId: string; unitId: string }> }) => {
    const { projectId, unitId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth
    if (!idSchema.safeParse(unitId).success) throw new ApiError('NOT_FOUND')

    const detail = await getVideoUnitDetail({
      projectId,
      userId: auth.session.user.id,
      unitId,
    })
    if (!detail) throw new ApiError('NOT_FOUND')
    return NextResponse.json(detail)
  },
)

export const PATCH = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; unitId: string }> }) => {
    const { projectId, unitId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth
    if (!idSchema.safeParse(unitId).success) throw new ApiError('NOT_FOUND')

    const body = labelSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new ApiError('INVALID_PARAMS')

    try {
      const result = await updateVideoUnitLabel({
        projectId,
        userId: auth.session.user.id,
        unitId,
        userLabel: body.data.userLabel,
      })
      return NextResponse.json({ unit: result })
    } catch (error) {
      if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
        throw new ApiError('NOT_FOUND')
      }
      throw error
    }
  },
)

export const POST = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; unitId: string }> }) => {
    const { projectId, unitId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth
    if (!idSchema.safeParse(unitId).success) throw new ApiError('NOT_FOUND')

    const body = generateSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
      throw new ApiError('INVALID_PARAMS', { details: 'Invalid unit generate request' })
    }

    try {
      const descriptor = await buildVideoUnitSubmission({
        projectId,
        userId: auth.session.user.id,
        unitId,
        operationKey: body.data.operationKey,
        ...(body.data.model ? { model: body.data.model } : {}),
        options: body.data.options,
      })
      const submitted = await submitTask({
        userId: auth.session.user.id,
        locale: 'zh',
        projectId,
        type: descriptor.taskType,
        targetType: descriptor.targetType,
        targetId: descriptor.targetId,
        payload: descriptor.payload,
        dedupeKey: descriptor.dedupeKey,
        maxAttempts: 1,
      })
      return NextResponse.json(
        { taskId: submitted.taskId, inputFingerprint: descriptor.inputFingerprint },
        { status: 202 },
      )
    } catch (error) {
      if (error instanceof Error && /(?:STALE|MISSING|NOT_APPROVED)/.test(error.message)) {
        throw new ApiError('CONFLICT', { details: error.message })
      }
      if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
        throw new ApiError('NOT_FOUND', { details: error.message })
      }
      if (error instanceof Error && /(?:INVALID|TOO_LONG|MISMATCH)/.test(error.message)) {
        throw new ApiError('INVALID_PARAMS', { details: error.message })
      }
      throw error
    }
  },
)
