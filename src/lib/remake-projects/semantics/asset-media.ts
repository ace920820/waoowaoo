import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { prisma } from '@/lib/prisma'

/**
 * Shared resolver for a Remake shot's bound asset-library references
 * (scene / characters / props). Returns stable media ids and raw image urls
 * for the project-scoped NovelPromotion asset container that hosts remake
 * assets, mirroring the shot-group omni-reference priority.
 */

export type ResolvedCharacterAsset = {
  name: string
  imageMediaId: string | null
  imageUrl: string | null
  voiceMediaId: string | null
  voiceUrl: string | null
}

export type ResolvedLocationAsset = {
  name: string
  imageMediaId: string | null
  imageUrl: string | null
}

export function readAssetIdList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
      }
    } catch {
      return []
    }
  }
  if (Array.isArray(value)) {
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
  }
  return []
}

export function readFirstImageUrlFromImageUrls(raw: unknown, selectedIndex?: number | null): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const imageUrls = decodeImageUrlsFromDb(raw, 'characterAppearance.imageUrls')
    if (imageUrls.length === 0) return null
    const preferredIndex = typeof selectedIndex === 'number' && selectedIndex >= 0 ? selectedIndex : 0
    return imageUrls[preferredIndex] || imageUrls[0] || null
  } catch {
    return null
  }
}

export async function resolveShotAssetMedia(input: {
  projectId: string
  sceneAssetId: string | null
  characterAssetIds: string[]
  propAssetIds: string[]
}): Promise<{
  characterById: Map<string, ResolvedCharacterAsset>
  locationById: Map<string, ResolvedLocationAsset>
}> {
  const characterById = new Map<string, ResolvedCharacterAsset>()
  const locationById = new Map<string, ResolvedLocationAsset>()
  const characterIds = input.characterAssetIds
  const locationIds = [...new Set([
    ...(input.sceneAssetId ? [input.sceneAssetId] : []),
    ...input.propAssetIds,
  ])]
  if (characterIds.length === 0 && locationIds.length === 0) {
    return { characterById, locationById }
  }

  const container = await prisma.novelPromotionProject.findUnique({
    where: { projectId: input.projectId },
    select: { id: true },
  })
  if (!container) return { characterById, locationById }

  const [characters, locations] = await Promise.all([
    characterIds.length > 0
      ? prisma.novelPromotionCharacter.findMany({
        where: { id: { in: characterIds }, novelPromotionProjectId: container.id },
        include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
      })
      : Promise.resolve([]),
    locationIds.length > 0
      ? prisma.novelPromotionLocation.findMany({
        where: { id: { in: locationIds }, novelPromotionProjectId: container.id },
        include: { selectedImage: true, images: { orderBy: { imageIndex: 'asc' } } },
      })
      : Promise.resolve([]),
  ])

  for (const character of characters) {
    const appearance = character.appearances[0]
    const imageUrl = appearance?.imageUrl
      || readFirstImageUrlFromImageUrls(appearance?.imageUrls, appearance?.selectedIndex)
      || null
    characterById.set(character.id, {
      name: character.name,
      imageMediaId: appearance?.imageMediaId ?? null,
      imageUrl,
      voiceMediaId: character.customVoiceMediaId ?? null,
      voiceUrl: character.customVoiceUrl ?? null,
    })
  }

  for (const location of locations) {
    const image = location.selectedImage
      || location.images.find((item) => item.isSelected)
      || location.images[0]
      || null
    locationById.set(location.id, {
      name: location.name,
      imageMediaId: image?.imageMediaId ?? null,
      imageUrl: image?.imageUrl ?? null,
    })
  }

  return { characterById, locationById }
}
