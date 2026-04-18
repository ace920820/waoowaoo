import { type Job } from 'bullmq'
import { getArtStylePrompt } from '@/lib/constants'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { buildShotGroupCompositePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
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
const NANO_BANANA_2_MODEL_KEY = 'google::gemini-3.1-flash-image-preview'

function normalizeShotGroupDialogueLanguage(value: string | null | undefined): NovelPromotionDialogueLanguage {
  return value === 'en' || value === 'ja' ? value : 'zh'
}

function shouldOmitAspectRatioForShotGroupComposite(modelKey: string, referenceImages: string[]) {
  return modelKey === NANO_BANANA_2_MODEL_KEY && referenceImages.length > 0
}

export async function handleShotGroupImageTask(job: Job<TaskJobData>) {
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
  const referenceInputs = [toSignedUrlIfCos(shotGroup.referenceImageUrl, 3600)].filter((value): value is string => !!value)
  const normalizedRefs = await normalizeReferenceImagesForGeneration(referenceInputs)
  const prompt = buildShotGroupCompositePrompt({
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
  const omitAspectRatio = shouldOmitAspectRatioForShotGroupComposite(modelKey, normalizedRefs)

  await reportTaskProgress(job, 18, {
    stage: 'generate_shot_group_composite',
    templateKey: shotGroup.templateKey,
    slotCount: template.slotCount,
    videoRatio: projectData.videoRatio || null,
  })

  const source = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: modelKey,
    prompt,
    options: {
      referenceImages: normalizedRefs,
      ...(omitAspectRatio ? {} : { aspectRatio: SHOT_GROUP_COMPOSITE_ASPECT_RATIO }),
    },
    allowTaskExternalIdResume: true,
    pollProgress: { start: 28, end: 90 },
  })
  const compositeImageUrl = await uploadImageSourceToCos(source, 'shot-group-composite', shotGroup.id)

  await assertTaskActive(job, 'persist_shot_group_composite')
  await prisma.novelPromotionShotGroup.update({
    where: { id: shotGroup.id },
    data: {
      compositeImageUrl,
    },
  })

  return {
    shotGroupId: shotGroup.id,
    compositeImageUrl,
    templateKey: shotGroup.templateKey,
    slotCount: template.slotCount,
  }
}
