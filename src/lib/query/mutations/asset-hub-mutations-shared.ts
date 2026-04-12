import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { AssetSummary, CharacterAssetSummary } from '@/lib/assets/contracts'
import { queryKeys } from '../keys'
import { invalidateQueryTemplates } from './mutation-shared'

export const GLOBAL_ASSET_PROJECT_ID = 'global-asset-hub'

export type GlobalCharacterLegacySnapshot = {
  queryKey: readonly unknown[]
  data: Array<{
    id: string
    appearances: Array<{
      appearanceIndex: number
      imageUrl: string | null
      imageUrls: string[]
      selectedIndex: number | null
    }>
  }> | undefined
}

export type GlobalUnifiedAssetSnapshot = {
  queryKey: QueryKey
  data: AssetSummary[] | undefined
}

export function invalidateGlobalCharacters(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [
    queryKeys.globalAssets.characters(),
    queryKeys.assets.all('global'),
  ])
}

export function invalidateGlobalLocations(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [
    queryKeys.globalAssets.locations(),
    queryKeys.assets.all('global'),
  ])
}

export function invalidateGlobalVoices(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [
    queryKeys.globalAssets.voices(),
    queryKeys.assets.all('global'),
  ])
}

export function captureGlobalUnifiedAssetSnapshots(queryClient: QueryClient): GlobalUnifiedAssetSnapshot[] {
  return queryClient
    .getQueriesData<AssetSummary[]>({
      queryKey: queryKeys.assets.all('global'),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

export function restoreGlobalUnifiedAssetSnapshots(
  queryClient: QueryClient,
  snapshots: GlobalUnifiedAssetSnapshot[],
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

export function applyCharacterSelectionToUnifiedAssets(
  assets: AssetSummary[] | undefined,
  characterId: string,
  appearanceIndex: number,
  imageIndex: number | null,
  confirm = false,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.kind !== 'character' || asset.id !== characterId) {
      return asset
    }

    const nextVariants = asset.variants.map((variant) => {
      if (variant.index !== appearanceIndex) {
        return variant
      }

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
