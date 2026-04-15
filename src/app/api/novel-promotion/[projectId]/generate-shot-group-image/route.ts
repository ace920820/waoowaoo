import { NextRequest, NextResponse } from 'next/server'
import { resolveModelSelection } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import { hasShotGroupImageOutput } from '@/lib/task/has-output'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { withTaskUiPayload } from '@/lib/task/ui-payload'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const locale = resolveRequiredTaskLocale(request, body)
  const shotGroupId = typeof body.shotGroupId === 'string' ? body.shotGroupId : ''
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const shotGroup = await prisma.novelPromotionShotGroup.findUnique({
    where: { id: shotGroupId },
    select: {
      id: true,
      title: true,
      templateKey: true,
      groupPrompt: true,
      referenceImageUrl: true,
    },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  if (!projectModelConfig.storyboardModel) {
    throw new ApiError('INVALID_PARAMS', { code: 'STORYBOARD_MODEL_NOT_CONFIGURED' })
  }
  try {
    await resolveModelSelection(session.user.id, projectModelConfig.storyboardModel, 'image')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Storyboard image model is invalid'
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_INVALID',
      message,
    })
  }

  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId,
    userId: session.user.id,
    modelType: 'image',
    modelKey: projectModelConfig.storyboardModel,
  })

  const billingPayload = {
    shotGroupId,
    templateKey: shotGroup.templateKey,
    groupPrompt: shotGroup.groupPrompt,
    referenceImageUrl: shotGroup.referenceImageUrl,
    imageModel: projectModelConfig.storyboardModel,
    ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {}),
  }
  const hasOutputAtStart = await hasShotGroupImageOutput(shotGroupId)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.IMAGE_SHOT_GROUP,
    targetType: 'NovelPromotionShotGroup',
    targetId: shotGroupId,
    payload: withTaskUiPayload(billingPayload, {
      intent: hasOutputAtStart ? 'regenerate' : 'generate',
      hasOutputAtStart,
    }),
    dedupeKey: `image_shot_group:${shotGroupId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_SHOT_GROUP, billingPayload),
  })

  return NextResponse.json(result)
})
