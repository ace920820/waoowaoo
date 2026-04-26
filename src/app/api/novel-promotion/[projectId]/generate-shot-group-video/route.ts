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
import {
  deriveShotGroupModeFlags,
  resolveShotGroupModeForModel,
  resolveShotGroupReferenceMode,
  sanitizeShotGroupGenerationOptions,
  normalizeShotGroupVideoReferenceSettings,
} from '@/lib/shot-group/video-config'

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

type ShotGroupAdvancedFields = {
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
}
type ShotGroupItemFields = {
  items: Array<{
    itemIndex: number
    title: string | null
    prompt: string | null
    imageUrl: string | null
    sourcePanelId: string | null
  }>
}

function parseShotGroupVideoConfig(value: string | null | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
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
  }) as (Awaited<ReturnType<typeof prisma.novelPromotionShotGroup.findFirst>> & ShotGroupAdvancedFields & ShotGroupItemFields) | null
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
  const savedConfig = parseShotGroupVideoConfig(shotGroup.videoReferencesJson)
  const requestedModel = typeof body.videoModel === 'string' ? body.videoModel.trim() : ''
  const savedModel = typeof savedConfig.videoModel === 'string' ? savedConfig.videoModel.trim() : ''
  const videoModel = requestedModel || savedModel || shotGroup.videoModel || projectModelConfig.videoModel
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

  const savedGenerationOptions = sanitizeShotGroupGenerationOptions(savedConfig.generationOptions)
  const runtimeSelections = {
    ...savedGenerationOptions,
    ...toVideoRuntimeSelections(body?.generationOptions),
  }
  runtimeSelections.generationMode = 'normal'
  runtimeSelections.generateAudio = typeof runtimeSelections.generateAudio === 'boolean'
    ? runtimeSelections.generateAudio
    : shotGroup.generateAudio

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
  const mode = resolveShotGroupModeForModel({
    mode: body.mode ?? savedConfig.mode,
    omniReferenceEnabled: shotGroup.omniReferenceEnabled,
    smartMultiFrameEnabled: shotGroup.smartMultiFrameEnabled,
    modelKey: videoModel,
  })
  const modeFlags = deriveShotGroupModeFlags(mode)
  const referenceMode = resolveShotGroupReferenceMode({
    mode,
    omniReferenceEnabled: modeFlags.omniReferenceEnabled,
    smartMultiFrameEnabled: modeFlags.smartMultiFrameEnabled,
    modelKey: videoModel,
  })
  const videoReferenceSettings = normalizeShotGroupVideoReferenceSettings(savedConfig.videoReferenceSettings)
  const billingPayload = {
    shotGroupId,
    templateKey: shotGroup.templateKey,
    groupPrompt: shotGroup.groupPrompt,
    videoPrompt: shotGroup.videoPrompt,
    compositeImageUrl: shotGroup.compositeImageUrl,
    orderedReferences,
    generateAudio: Boolean(capabilityOptions.generateAudio),
    bgmEnabled: false,
    includeDialogue: shotGroup.includeDialogue,
    dialogueLanguage: shotGroup.dialogueLanguage,
    mode,
    ...modeFlags,
    videoModel,
    generationOptions: capabilityOptions,
    videoReferenceSettings,
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
      referenceMode,
    }, {
      intent: hasOutputAtStart ? 'regenerate' : 'generate',
      hasOutputAtStart,
    }),
    dedupeKey: `video_shot_group:${shotGroupId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_SHOT_GROUP, billingPayload),
  })

  return NextResponse.json(result)
})
