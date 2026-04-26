import { type Job } from 'bullmq'
import { getArtStylePrompt } from '@/lib/constants'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { buildShotGroupCompositePrompt, buildShotGroupReferencePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { mergeShotGroupDraftMetadata, parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import type { ShotGroupAssetBindingReference, ShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
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

function readFirstImageUrlFromImageUrls(raw: string | null | undefined, selectedIndex?: number | null): string | null {
  if (!raw) return null
  try {
    const imageUrls = decodeImageUrlsFromDb(raw, 'characterAppearance.imageUrls')
    if (imageUrls.length === 0) return null
    const preferredIndex = typeof selectedIndex === 'number' && selectedIndex >= 0 ? selectedIndex : 0
    return imageUrls[preferredIndex] || imageUrls[0] || null
  } catch {
    return null
  }
}

function mergeHydratedAssetReference(
  asset: ShotGroupAssetBindingReference | null | undefined,
  imageByAssetId: Map<string, { imageId: string | null; imageUrl: string | null }>,
): ShotGroupAssetBindingReference | null {
  if (!asset) return null
  if (asset.imageUrl || !asset.assetId) return asset
  const hydrated = imageByAssetId.get(asset.assetId)
  if (!hydrated?.imageUrl) return asset
  return {
    ...asset,
    imageId: asset.imageId || hydrated.imageId,
    imageUrl: hydrated.imageUrl,
  }
}

function mergeHydratedAssetReferences(
  assets: ShotGroupAssetBindingReference[] | undefined,
  imageByAssetId: Map<string, { imageId: string | null; imageUrl: string | null }>,
): ShotGroupAssetBindingReference[] {
  return (assets ?? []).map((asset) => mergeHydratedAssetReference(asset, imageByAssetId) || asset)
}

function collectMissingAssetIds(
  assets: Array<ShotGroupAssetBindingReference | null | undefined>,
): string[] {
  return [...new Set(assets
    .filter((asset): asset is ShotGroupAssetBindingReference => Boolean(asset?.assetId && !asset.imageUrl))
    .map((asset) => asset.assetId)
    .filter((assetId): assetId is string => Boolean(assetId)))]
}

async function hydrateShotGroupDraftAssetImageUrls(
  projectId: string,
  draftMetadata: ShotGroupDraftMetadata | null,
): Promise<ShotGroupDraftMetadata | null> {
  if (!draftMetadata) return draftMetadata

  const characterIds = collectMissingAssetIds([
    ...(draftMetadata.selectedCharacterAssets ?? []),
    ...(draftMetadata.preselectedCharacterAssets ?? []),
    ...(draftMetadata.scriptDerivedCharacterAssets ?? []),
    ...(draftMetadata.effectiveCharacterAssets ?? []),
  ])
  const locationIds = collectMissingAssetIds([
    draftMetadata.selectedLocationAsset,
    draftMetadata.preselectedLocationAsset,
    draftMetadata.scriptDerivedLocationAsset,
    draftMetadata.effectiveLocationAsset,
  ])
  const propIds = collectMissingAssetIds([
    ...(draftMetadata.selectedPropAssets ?? []),
    ...(draftMetadata.preselectedPropAssets ?? []),
    ...(draftMetadata.scriptDerivedPropAssets ?? []),
    ...(draftMetadata.effectivePropAssets ?? []),
  ])

  if (characterIds.length === 0 && locationIds.length === 0 && propIds.length === 0) {
    return draftMetadata
  }

  const [characters, locations, props] = await Promise.all([
    characterIds.length > 0
      ? prisma.novelPromotionCharacter.findMany({
        where: { id: { in: characterIds }, novelPromotionProjectId: projectId },
        include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
      })
      : [],
    locationIds.length > 0
      ? prisma.novelPromotionLocation.findMany({
        where: { id: { in: locationIds }, novelPromotionProjectId: projectId, assetKind: { not: 'prop' } },
        include: { selectedImage: true, images: { orderBy: { imageIndex: 'asc' } } },
      })
      : [],
    propIds.length > 0
      ? prisma.novelPromotionLocation.findMany({
        where: { id: { in: propIds }, novelPromotionProjectId: projectId, assetKind: 'prop' },
        include: { selectedImage: true, images: { orderBy: { imageIndex: 'asc' } } },
      })
      : [],
  ])

  const characterImageByAssetId = new Map(characters.flatMap((character) => {
    const appearance = character.appearances[0]
    const imageUrl = appearance?.imageUrl || readFirstImageUrlFromImageUrls(appearance?.imageUrls, appearance?.selectedIndex) || null
    return imageUrl ? [[character.id, { imageId: appearance?.id || null, imageUrl }]] : []
  }))
  const toLocationImageEntry = (asset: typeof locations[number]) => {
    const selected = asset.selectedImage || asset.images.find((image) => image.isSelected) || asset.images[0] || null
    return selected?.imageUrl ? [[asset.id, { imageId: selected.id || null, imageUrl: selected.imageUrl }]] as const : []
  }
  const locationImageByAssetId = new Map(locations.flatMap(toLocationImageEntry))
  const propImageByAssetId = new Map(props.flatMap(toLocationImageEntry))

  return {
    ...draftMetadata,
    selectedLocationAsset: mergeHydratedAssetReference(draftMetadata.selectedLocationAsset, locationImageByAssetId),
    preselectedLocationAsset: mergeHydratedAssetReference(draftMetadata.preselectedLocationAsset, locationImageByAssetId),
    scriptDerivedLocationAsset: mergeHydratedAssetReference(draftMetadata.scriptDerivedLocationAsset, locationImageByAssetId),
    effectiveLocationAsset: mergeHydratedAssetReference(draftMetadata.effectiveLocationAsset, locationImageByAssetId),
    selectedCharacterAssets: mergeHydratedAssetReferences(draftMetadata.selectedCharacterAssets, characterImageByAssetId),
    preselectedCharacterAssets: mergeHydratedAssetReferences(draftMetadata.preselectedCharacterAssets, characterImageByAssetId),
    scriptDerivedCharacterAssets: mergeHydratedAssetReferences(draftMetadata.scriptDerivedCharacterAssets, characterImageByAssetId),
    effectiveCharacterAssets: mergeHydratedAssetReferences(draftMetadata.effectiveCharacterAssets, characterImageByAssetId),
    selectedPropAssets: mergeHydratedAssetReferences(draftMetadata.selectedPropAssets, propImageByAssetId),
    preselectedPropAssets: mergeHydratedAssetReferences(draftMetadata.preselectedPropAssets, propImageByAssetId),
    scriptDerivedPropAssets: mergeHydratedAssetReferences(draftMetadata.scriptDerivedPropAssets, propImageByAssetId),
    effectivePropAssets: mergeHydratedAssetReferences(draftMetadata.effectivePropAssets, propImageByAssetId),
  }
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
  const draftMetadata = await hydrateShotGroupDraftAssetImageUrls(
    job.data.projectId,
    parseShotGroupDraftMetadata(shotGroup.videoReferencesJson),
  )
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
