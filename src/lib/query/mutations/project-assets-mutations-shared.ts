import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { AssetSummary, CharacterAssetSummary, LocationAssetSummary } from '@/lib/assets/contracts'
import { queryKeys } from '../keys'
import { invalidateQueryTemplates } from './mutation-shared'

export type ProjectUnifiedAssetSnapshot = {
  queryKey: QueryKey
  data: AssetSummary[] | undefined
}

export function invalidateProjectAssetCaches(queryClient: QueryClient, projectId: string) {
  return invalidateQueryTemplates(queryClient, [
    queryKeys.assets.all('project', projectId),
    queryKeys.projectAssets.all(projectId),
    queryKeys.projectData(projectId),
  ])
}

export function captureProjectUnifiedAssetSnapshots(queryClient: QueryClient, projectId: string): ProjectUnifiedAssetSnapshot[] {
  return queryClient
    .getQueriesData<AssetSummary[]>({
      queryKey: queryKeys.assets.all('project', projectId),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

export function restoreProjectUnifiedAssetSnapshots(
  queryClient: QueryClient,
  snapshots: ProjectUnifiedAssetSnapshot[],
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

export function applyCharacterSelectionToUnifiedProjectAssets(
  assets: AssetSummary[] | undefined,
  characterId: string,
  appearanceId: string,
  imageIndex: number | null,
  confirm = false,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.kind !== 'character' || asset.id !== characterId) return asset

    const nextVariants = asset.variants.map((variant) => {
      if (variant.id !== appearanceId) return variant

      const nextRenders = variant.renders.map((render) => ({
        ...render,
        isSelected: imageIndex !== null && render.index === imageIndex,
      }))

      if (!confirm || imageIndex === null) {
        return {
          ...variant,
          renders: nextRenders,
          selectionState: {
            selectedRenderIndex: imageIndex,
          },
        }
      }

      const selectedRender = nextRenders.find((render) => render.index === imageIndex)
      if (!selectedRender) {
        return {
          ...variant,
          renders: nextRenders,
          selectionState: {
            selectedRenderIndex: imageIndex,
          },
        }
      }

      return {
        ...variant,
        renders: [
          {
            ...selectedRender,
            index: 0,
            isSelected: true,
          },
        ],
        selectionState: {
          selectedRenderIndex: 0,
        },
      }
    })

    const nextAsset: CharacterAssetSummary = {
      ...asset,
      variants: nextVariants,
    }
    return nextAsset
  })
}

export function applyLocationSelectionToUnifiedProjectAssets(
  assets: AssetSummary[] | undefined,
  locationId: string,
  imageIndex: number | null,
  confirm = false,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.kind !== 'location' || asset.id !== locationId) return asset

    const nextVariants = asset.variants.map((variant) => ({
      ...variant,
      renders: variant.renders.map((render) => ({
        ...render,
        isSelected: imageIndex !== null && variant.index === imageIndex,
      })),
    }))

    const selectedVariant = typeof imageIndex === 'number'
      ? nextVariants.find((variant) => variant.index === imageIndex) || null
      : null

    if (!confirm || !selectedVariant) {
      const nextAsset: LocationAssetSummary = {
        ...asset,
        variants: nextVariants,
        selectedVariantId: selectedVariant?.id ?? null,
      }
      return nextAsset
    }

    const collapsedVariant = {
      ...selectedVariant,
      index: 0,
      renders: selectedVariant.renders.map((render, renderIndex) => ({
        ...render,
        index: renderIndex,
        isSelected: true,
      })),
    }

    const nextAsset: LocationAssetSummary = {
      ...asset,
      variants: [collapsedVariant],
      selectedVariantId: collapsedVariant.id,
    }
    return nextAsset
  })
}
