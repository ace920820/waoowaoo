import { type Job } from 'bullmq'
import { getArtStylePrompt } from '@/lib/constants'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { buildShotGroupCompositePrompt, buildShotGroupReferencePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { mergeShotGroupDraftMetadata, parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import { buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import type { NovelPromotionDialogueLanguage } from '@/types/project'
import { reportTaskProgress } from '@/lib/workers/shared'
import { resolveNovelData } from './image-task-handler-shared'
import {
  assertTaskActive,
  getProjectModels,
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
} from '@/lib/workers/utils'

const SHOT_GROUP_COMPOSITE_ASPECT_RATIO = '1:1'
const SHOT_GROUP_REFERENCE_ASPECT_RATIO = '4:3'

function normalizeShotGroupDialogueLanguage(value: string | null | undefined): NovelPromotionDialogueLanguage {
  return value === 'en' || value === 'ja' ? value : 'zh'
}

export async function handleShotGroupImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const targetField = payload.targetField === 'reference' ? 'reference' : 'composite'
  const shotGroupId = job.data.targetId
  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(job.data.projectId, shotGroupId),
    include: {
      items: { orderBy: { itemIndex: 'asc' } },
    },
  })
  if (!shotGroup) throw new Error('Shot group not found')

  const [projectData, projectModels] = await Promise.all([
    resolveNovelData(job.data.projectId),
    getProjectModels(job.data.projectId, job.data.userId),
  ])
  const modelKey = projectModels.storyboardModel
  if (!modelKey) throw new Error('Storyboard model not configured')

  const template = getShotGroupTemplateSpec(shotGroup.templateKey)
  const artStyle = getArtStylePrompt(projectModels.artStyle, job.data.locale)
  const draftMetadata = parseShotGroupDraftMetadata(shotGroup.videoReferencesJson)
  const assetReferenceInputs = [
    draftMetadata?.effectiveLocationAsset?.imageUrl,
    ...(draftMetadata?.effectiveCharacterAssets ?? []).map((asset) => asset.imageUrl),
    ...(draftMetadata?.effectivePropAssets ?? []).map((asset) => asset.imageUrl),
  ].filter((value): value is string => Boolean(value))
  const referenceInputs = targetField === 'reference'
    ? assetReferenceInputs.map((value) => toSignedUrlIfCos(value, 3600)).filter((value): value is string => !!value)
    : [toSignedUrlIfCos(shotGroup.referenceImageUrl, 3600)].filter((value): value is string => !!value)
  const normalizedRefs = await normalizeReferenceImagesForGeneration(referenceInputs)
  const prompt = targetField === 'reference'
    ? buildShotGroupReferencePrompt({
      group: {
        ...shotGroup,
        dialogueLanguage: normalizeShotGroupDialogueLanguage(shotGroup.dialogueLanguage),
        items: shotGroup.items,
      },
      artStyle,
      locale: job.data.locale,
      canvasAspectRatio: SHOT_GROUP_REFERENCE_ASPECT_RATIO,
    })
    : buildShotGroupCompositePrompt({
    group: {
      ...shotGroup,
      dialogueLanguage: normalizeShotGroupDialogueLanguage(shotGroup.dialogueLanguage),
      items: shotGroup.items,
    },
    template,
    artStyle,
    locale: job.data.locale,
    canvasAspectRatio: SHOT_GROUP_COMPOSITE_ASPECT_RATIO,
  })
  await reportTaskProgress(job, 18, {
    stage: targetField === 'reference' ? 'generate_shot_group_reference' : 'generate_shot_group_composite',
    templateKey: shotGroup.templateKey,
    slotCount: template.slotCount,
    targetField,
    videoRatio: projectData.videoRatio || null,
  })

  const source = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: modelKey,
    prompt,
    options: {
      referenceImages: normalizedRefs,
      aspectRatio: targetField === 'reference' ? SHOT_GROUP_REFERENCE_ASPECT_RATIO : SHOT_GROUP_COMPOSITE_ASPECT_RATIO,
    },
    allowTaskExternalIdResume: true,
    pollProgress: { start: 28, end: 90 },
  })
  const compositeImageUrl = await uploadImageSourceToCos(source, 'shot-group-composite', shotGroup.id)

  await assertTaskActive(job, 'persist_shot_group_composite')
  const nextVideoReferencesJson = draftMetadata
    ? mergeShotGroupDraftMetadata(shotGroup.videoReferencesJson, {
      ...draftMetadata,
      submittedReferencePrompt: targetField === 'reference'
        ? prompt
        : draftMetadata.submittedReferencePrompt ?? null,
      submittedCompositePrompt: targetField === 'composite'
        ? prompt
        : draftMetadata.submittedCompositePrompt ?? null,
    }, draftMetadata)
    : shotGroup.videoReferencesJson
  await prisma.novelPromotionShotGroup.update({
    where: { id: shotGroup.id },
    data: {
      ...(targetField === 'reference'
        ? { referenceImageUrl: compositeImageUrl }
        : { compositeImageUrl }),
      ...(nextVideoReferencesJson ? { videoReferencesJson: nextVideoReferencesJson } : {}),
    },
  })

  return {
    shotGroupId: shotGroup.id,
    targetField,
    compositeImageUrl,
    templateKey: shotGroup.templateKey,
    slotCount: template.slotCount,
  }
}
