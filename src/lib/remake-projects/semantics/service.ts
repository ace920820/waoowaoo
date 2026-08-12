import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'

export type RemakeShotSemantics = {
  shotType: string | null
  cameraMove: string | null
  description: string | null
  moodPresetId: string | null
  customMood: string | null
  sceneTag: string | null
  characterTags: string[]
  sceneAssetId: string | null
  characterAssetIds: string[]
  propAssetIds: string[]
}

export async function updateRemakeShotSemantics(input: {
  projectId: string
  shotId: string
  userId: string
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  moodPresetId?: string | null
  customMood?: string | null
  sceneTag?: string | null
  characterTags?: string[] | null
  sceneAssetId?: string | null
  characterAssetIds?: string[] | null
  propAssetIds?: string[] | null
}): Promise<{ semantics: RemakeShotSemantics } | null> {
  const shot = await prisma.remakeShot.findUnique({
    where: { id: input.shotId },
    include: { remakeProject: { select: { project: { select: { id: true, userId: true, type: true } } } } },
  })
  if (!shot) return null
  const project = shot.remakeProject?.project
  if (!project || project.userId !== input.userId || project.type !== 'remake') return null
  // `shot.remakeProjectId` is the remake_projects row id, NOT the owning project id.
  // Compare against the owning project id (projects.id) resolved via the relation.
  if (project.id !== input.projectId) return null

  // Validate asset ownership: all referenced assets must belong to this project's asset library.
  // This prevents global/asset-center assets or cross-project assets from being bound to remake shots.
  const novelProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId: input.projectId },
    select: { id: true },
  })
  if (!novelProject) {
    // No asset container yet; any asset reference would be invalid.
    if (input.sceneAssetId || (input.characterAssetIds?.length) || (input.propAssetIds?.length)) {
      throw new ApiError('INVALID_PARAMS', { details: 'Project asset library not initialized' })
    }
  } else {
    const novelProjectId = novelProject.id

    // Validate scene asset
    if (input.sceneAssetId) {
      const scene = await prisma.novelPromotionLocation.findFirst({
        where: { id: input.sceneAssetId, novelPromotionProjectId: novelProjectId, assetKind: 'location' },
        select: { id: true },
      })
      if (!scene) throw new ApiError('INVALID_PARAMS', { details: 'Scene asset not found in project library' })
    }

    // Validate character assets
    if (input.characterAssetIds?.length) {
      const count = await prisma.novelPromotionCharacter.count({
        where: { id: { in: input.characterAssetIds }, novelPromotionProjectId: novelProjectId },
      })
      if (count !== input.characterAssetIds.length) {
        throw new ApiError('INVALID_PARAMS', { details: 'One or more character assets not found in project library' })
      }
    }

    // Validate prop assets
    if (input.propAssetIds?.length) {
      const count = await prisma.novelPromotionLocation.count({
        where: { id: { in: input.propAssetIds }, novelPromotionProjectId: novelProjectId, assetKind: 'prop' },
      })
      if (count !== input.propAssetIds.length) {
        throw new ApiError('INVALID_PARAMS', { details: 'One or more prop assets not found in project library' })
      }
    }
  }

  const data: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(input, 'shotType')) data.shotType = input.shotType
  if (Object.prototype.hasOwnProperty.call(input, 'cameraMove')) data.cameraMove = input.cameraMove
  if (Object.prototype.hasOwnProperty.call(input, 'description')) data.description = input.description
  if (Object.prototype.hasOwnProperty.call(input, 'moodPresetId')) data.moodPresetId = input.moodPresetId
  if (Object.prototype.hasOwnProperty.call(input, 'customMood')) data.customMood = input.customMood
  if (Object.prototype.hasOwnProperty.call(input, 'sceneTag')) data.sceneTag = input.sceneTag
  if (Object.prototype.hasOwnProperty.call(input, 'characterTags')) {
    data.characterTags = input.characterTags ? JSON.stringify(input.characterTags) : null
  }
  if (Object.prototype.hasOwnProperty.call(input, 'sceneAssetId')) data.sceneAssetId = input.sceneAssetId
  if (Object.prototype.hasOwnProperty.call(input, 'characterAssetIds')) {
    data.characterAssetIds = input.characterAssetIds ? JSON.stringify(input.characterAssetIds) : null
  }
  if (Object.prototype.hasOwnProperty.call(input, 'propAssetIds')) {
    data.propAssetIds = input.propAssetIds ? JSON.stringify(input.propAssetIds) : null
  }

  const updated = await prisma.remakeShot.update({
    where: { id: input.shotId },
    data,
  })

  return {
    semantics: {
      shotType: updated.shotType ?? null,
      cameraMove: updated.cameraMove ?? null,
      description: updated.description ?? null,
      moodPresetId: updated.moodPresetId ?? null,
      customMood: updated.customMood ?? null,
      sceneTag: updated.sceneTag ?? null,
      characterTags: parseTags(updated.characterTags),
    sceneAssetId: updated.sceneAssetId ?? null,
    characterAssetIds: parseTags(updated.characterAssetIds),
    propAssetIds: parseTags(updated.propAssetIds),
    },
  }
}

function parseTags(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
