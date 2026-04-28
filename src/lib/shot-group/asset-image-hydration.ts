import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { prisma } from '@/lib/prisma'
import type { ShotGroupAssetBindingReference, ShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'

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

export async function hydrateShotGroupDraftAssetImageUrls(
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
