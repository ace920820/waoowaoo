import { NextRequest, NextResponse } from 'next/server'
import { resolveModelSelection } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import { buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { hasShotGroupVideoOutput } from '@/lib/task/has-output'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { parseModelKeyStrict, type CapabilityValue } from '@/lib/model-config-contract'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toVideoRuntimeSelections(value: unknown): Record<string, CapabilityValue> {
  if (!isRecord(value)) return {}
  const selections: Record<string, CapabilityValue> = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'aspectRatio') continue
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      selections[field] = raw
    }
  }
  return selections
}

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
  const shotGroupId = typeof body.shotGroupId === 'string' ? body.shotGroupId.trim() : ''
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    include: {
      items: {
        select: {
          itemIndex: true,
          title: true,
          prompt: true,
          imageUrl: true,
          sourcePanelId: true,
        },
        orderBy: { itemIndex: 'asc' },
      },
    },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }
  if (!shotGroup.compositeImageUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'SHOT_GROUP_COMPOSITE_REQUIRED',
      field: 'shotGroupId',
      message: 'Shot group composite image is required before generating video.',
    })
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  const requestedModel = typeof body.videoModel === 'string' ? body.videoModel.trim() : ''
  const videoModel = requestedModel || projectModelConfig.videoModel
  if (!videoModel || !parseModelKeyStrict(videoModel)) {
    throw new ApiError('INVALID_PARAMS', { code: 'VIDEO_MODEL_REQUIRED', field: 'videoModel' })
  }

  try {
    await resolveModelSelection(session.user.id, videoModel, 'video')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video model is invalid'
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIDEO_MODEL_INVALID',
      field: 'videoModel',
      message,
    })
  }

  const runtimeSelections = toVideoRuntimeSelections(body?.generationOptions)
  runtimeSelections.generationMode = 'normal'

  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId,
    userId: session.user.id,
    modelType: 'video',
    modelKey: videoModel,
    runtimeSelections,
  })

  const orderedReferences = shotGroup.items.map((item) => ({
    itemIndex: item.itemIndex,
    title: item.title,
    prompt: item.prompt,
    imageUrl: item.imageUrl,
    sourcePanelId: item.sourcePanelId,
  }))
  const billingPayload = {
    shotGroupId,
    templateKey: shotGroup.templateKey,
    groupPrompt: shotGroup.groupPrompt,
    compositeImageUrl: shotGroup.compositeImageUrl,
    orderedReferences,
    videoModel,
    generationOptions: capabilityOptions,
  }
  const hasOutputAtStart = await hasShotGroupVideoOutput(shotGroupId)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId: shotGroup.episodeId,
    type: TASK_TYPE.VIDEO_SHOT_GROUP,
    targetType: 'NovelPromotionShotGroup',
    targetId: shotGroupId,
    payload: withTaskUiPayload({
      ...billingPayload,
      referenceMode: 'composite_image',
    }, {
      intent: hasOutputAtStart ? 'regenerate' : 'generate',
      hasOutputAtStart,
    }),
    dedupeKey: `video_shot_group:${shotGroupId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_SHOT_GROUP, billingPayload),
  })

  return NextResponse.json(result)
})
