import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createSceneDetectExecutor } from '@/lib/remake-projects/scenedetect/executor'

const bodySchema = z.object({
  operationKey: z.string().trim().min(1).max(200),
  threshold: z.number().finite().positive().max(100).optional(),
}).strict()

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new ApiError('INVALID_PARAMS', { details: 'operationKey and optional threshold are required' })

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { type: true, remakeProject: { select: { currentSource: { select: { sourceRevision: true, status: true } } } } },
  })
  if (!project || project.type !== 'remake' || !project.remakeProject) throw new ApiError('NOT_FOUND')
  const source = project.remakeProject.currentSource
  if (!source || source.status === 'retired') throw new ApiError('INVALID_PARAMS', { details: 'A current source video is required' })

  const executor = createSceneDetectExecutor({ userId: auth.session.user.id, locale: 'zh' })
  const submitted = await executor.submitAnalyze({
    projectId,
    sourceRevision: source.sourceRevision,
    adapterVersion: 'scenedetect-native-v2',
    operationKey: body.data.operationKey,
    detector: 'content',
    ...(body.data.threshold === undefined ? {} : { threshold: body.data.threshold }),
  })
  const task = (submitted as { task?: { id?: string }; id?: string })
  const taskId = task.task?.id || task.id
  if (!taskId) throw new ApiError('INTERNAL_ERROR')
  return NextResponse.json({ taskId, sourceRevision: source.sourceRevision, operationKey: body.data.operationKey }, { status: 202 })
})
