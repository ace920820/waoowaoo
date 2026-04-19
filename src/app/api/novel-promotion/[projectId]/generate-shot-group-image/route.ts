import { NextRequest, NextResponse } from 'next/server'
import { resolveModelSelection } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import { buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
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
  const targetField = body.targetField === 'reference' ? 'reference' : 'composite'
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    select: {
      id: true,
      title: true,
      templateKey: true,
      groupPrompt: true,
      referenceImageUrl: true,
      videoReferencesJson: true,
    },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }

  const draftMetadata = parseShotGroupDraftMetadata(shotGroup.videoReferencesJson)
  const assetReferenceImages = [
    draftMetadata?.effectiveLocationAsset?.imageUrl,
    ...(draftMetadata?.effectiveCharacterAssets ?? []).map((asset) => asset.imageUrl),
    ...(draftMetadata?.effectivePropAssets ?? []).map((asset) => asset.imageUrl),
  ].filter((value): value is string => Boolean(value))

  if (targetField === 'composite' && !shotGroup.referenceImageUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'SHOT_GROUP_REFERENCE_IMAGE_REQUIRED',
      field: 'referenceImageUrl',
      message: locale === 'en'
        ? 'A mother/reference image is required before generating the storyboard board.'
        : '生成分镜参考表前必须先提供辅助参考图。',
    })
  }
  if (targetField === 'reference' && assetReferenceImages.length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'SHOT_GROUP_ASSET_IMAGES_REQUIRED',
      field: 'videoReferencesJson',
      message: locale === 'en'
        ? 'At least one selected asset image is required before generating a mother reference image.'
        : '生成辅助参考图前，至少需要一个已绑定的角色、场景或物品资产图。',
    })
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
    targetField,
    templateKey: shotGroup.templateKey,
    groupPrompt: shotGroup.groupPrompt,
    referenceImageUrl: shotGroup.referenceImageUrl,
    assetReferenceImages,
    assetBindings: {
      location: draftMetadata?.effectiveLocationAsset ?? null,
      characters: draftMetadata?.effectiveCharacterAssets ?? [],
      props: draftMetadata?.effectivePropAssets ?? [],
      warnings: draftMetadata?.missingAssetWarnings ?? [],
    },
    storyboardMood: {
      presetId: draftMetadata?.storyboardMoodPresetId ?? null,
      customMood: draftMetadata?.customMood ?? null,
    },
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
      targetField,
      hasOutputAtStart,
    }),
    dedupeKey: `image_shot_group:${shotGroupId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_SHOT_GROUP, billingPayload),
  })

  return NextResponse.json(result)
})
