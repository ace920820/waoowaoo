import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { buildKeyframeGenerationSubmission } from '@/lib/remake-projects/keyframes/service'
import { submitTask } from '@/lib/task/submitter'

const generateSchema = z.object({
  action: z.literal('generate'),
  shotId: z.string().uuid(),
  slot: z.enum(['start', 'middle', 'end']),
  operationKey: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(4),
  model: z.string().trim().min(1),
  options: z.record(z.unknown()).default({}),
  referenceMediaIds: z.array(z.string().uuid()).max(20).default([]),
}).strict()

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const body = generateSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new ApiError('INVALID_PARAMS', { details: 'Invalid Remake keyframe generation request' })

  try {
    const descriptor = await buildKeyframeGenerationSubmission({ projectId, userId: auth.session.user.id, ...body.data })
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
    return NextResponse.json({ taskId: submitted.taskId }, { status: 202 })
  } catch (error) {
    if (error instanceof Error && /(?:STALE|MISMATCH|NOT_FOUND|INVALID)/.test(error.message)) {
      throw new ApiError(error.message.includes('STALE') ? 'CONFLICT' : 'INVALID_PARAMS', { details: error.message })
    }
    throw error
  }
})
