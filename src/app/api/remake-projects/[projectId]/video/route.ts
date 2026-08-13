import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { buildVideoGenerationSubmission } from '@/lib/remake-projects/video/service'
import { submitTask } from '@/lib/task/submitter'

const generateSchema = z.object({
  action: z.literal('generate'),
  shotId: z.string().uuid(),
  operationKey: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).optional(),
  options: z.record(z.unknown()).default({}),
  selectedSlots: z.array(z.enum(['start', 'middle', 'end'])).min(1).max(3),
  includeActionSheet: z.boolean().default(false),
  includeCharacterImages: z.boolean().default(true),
  includeLocationImage: z.boolean().default(true),
  includePropImages: z.boolean().default(true),
  includeCharacterAudio: z.boolean().default(false),
  shotDurationSeconds: z.number().min(0.1),
}).strict()

const requestSchema = generateSchema

export const POST = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = await context.params
    const auth = await requireProjectAuthLight(projectId)
    if (isErrorResponse(auth)) return auth

    const body = requestSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
      throw new ApiError('INVALID_PARAMS', {
        details: 'Invalid Remake video generation request',
      })
    }

    try {
      const descriptor = await buildVideoGenerationSubmission({
        projectId,
        userId: auth.session.user.id,
        ...body.data,
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
      if (error instanceof Error && /(?:STALE|MISMATCH|NOT_FOUND|INVALID|NOT_APPROVED)/.test(error.message)) {
        throw new ApiError(
          /(?:STALE|NOT_APPROVED)/.test(error.message) ? 'CONFLICT' : 'INVALID_PARAMS',
          {
            details: error.message,
            message: error.message === 'REMAKE_VIDEO_PROMPT_NOT_APPROVED'
              ? 'Video Prompt 已因镜头重新分析而需要复核，请在 Prompt 分析页重新分析并审核，或编辑后保存并采用。'
              : error.message,
          },
        )
      }
      throw error
    }
  },
)
