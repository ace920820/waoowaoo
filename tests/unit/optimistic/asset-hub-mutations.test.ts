import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalCharacter, GlobalLocation } from '@/lib/query/hooks/useGlobalAssets'
import { queryKeys } from '@/lib/query/keys'
import { MockQueryClient } from '../../helpers/mock-query-client'
import { requestJsonWithError } from '@/lib/query/mutations/mutation-shared'

let queryClient = new MockQueryClient()
const useQueryClientMock = vi.fn(() => queryClient)
const useMutationMock = vi.fn((options: unknown) => options)

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useRef: <T,>(value: T) => ({ current: value }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    requestJsonWithError: vi.fn(),
    requestVoidWithError: vi.fn(),
  }
})

vi.mock('@/lib/query/mutations/asset-hub-mutations-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/asset-hub-mutations-shared')>(
    '@/lib/query/mutations/asset-hub-mutations-shared',
  )
  return {
    ...actual,
    invalidateGlobalCharacters: vi.fn(),
    invalidateGlobalLocations: vi.fn(),
  }
})

import {
  useSelectCharacterImage,
} from '@/lib/query/mutations/asset-hub-character-mutations'
import {
  useDeleteLocation as useDeleteAssetHubLocation,
  useSelectLocationImage as useSelectAssetHubLocationImage,
} from '@/lib/query/mutations/asset-hub-location-mutations'

interface SelectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceIndex: number
    imageIndex: number | null
    confirm?: boolean
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface DeleteLocationMutation {
  onMutate: (locationId: string) => Promise<unknown>
  onError: (error: unknown, locationId: string, context: unknown) => void
}

interface SelectLocationMutation {
  mutationFn: (variables: {
    locationId: string
    imageIndex: number | null
    confirm?: boolean
  }) => Promise<unknown>
  onMutate: (variables: {
    locationId: string
    imageIndex: number | null
    confirm?: boolean
  }) => Promise<unknown>
}

function buildGlobalCharacter(selectedIndex: number | null): GlobalCharacter {
  return {
    id: 'character-1',
    name: 'Hero',
    folderId: 'folder-1',
    customVoiceUrl: null,
    appearances: [{
      id: 'appearance-1',
      appearanceIndex: 0,
      changeReason: 'default',
      artStyle: 'realistic',
      description: null,
      descriptionSource: null,
      imageUrl: selectedIndex === null ? null : `img-${selectedIndex}`,
      imageUrls: ['img-0', 'img-1', 'img-2'],
      selectedIndex,
      previousImageUrl: null,
      previousImageUrls: [],
      imageTaskRunning: false,
    }],
  }
}

function buildGlobalLocation(id: string): GlobalLocation {
  return {
    id,
    name: `Location ${id}`,
    summary: null,
    folderId: 'folder-1',
    artStyle: 'realistic',
    images: [
      {
        id: `${id}-img-0`,
        imageIndex: 0,
        description: null,
        imageUrl: 'img-0',
        previousImageUrl: null,
        isSelected: true,
        imageTaskRunning: false,
      },
      {
        id: `${id}-img-1`,
        imageIndex: 1,
        description: null,
        imageUrl: 'img-1',
        previousImageUrl: null,
        isSelected: false,
        imageTaskRunning: false,
      },
    ],
  }
}

describe('asset hub optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
    vi.mocked(requestJsonWithError).mockReset()
  })

  it('updates all character query caches optimistically and ignores stale rollback', async () => {
    const allCharactersKey = queryKeys.globalAssets.characters()
    const folderCharactersKey = queryKeys.globalAssets.characters('folder-1')
    queryClient.seedQuery(allCharactersKey, [buildGlobalCharacter(0)])
    queryClient.seedQuery(folderCharactersKey, [buildGlobalCharacter(0)])

    const mutation = useSelectCharacterImage() as unknown as SelectCharacterMutation
    const firstVariables = {
      characterId: 'character-1',
      appearanceIndex: 0,
      imageIndex: 1,
    }
    const secondVariables = {
      characterId: 'character-1',
      appearanceIndex: 0,
      imageIndex: 2,
    }

    const firstContext = await mutation.onMutate(firstVariables)
    const afterFirstAll = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const afterFirstFolder = queryClient.getQueryData<GlobalCharacter[]>(folderCharactersKey)
    expect(afterFirstAll?.[0]?.appearances[0]?.selectedIndex).toBe(1)
    expect(afterFirstFolder?.[0]?.appearances[0]?.selectedIndex).toBe(1)

    const secondContext = await mutation.onMutate(secondVariables)
    const afterSecondAll = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    expect(afterSecondAll?.[0]?.appearances[0]?.selectedIndex).toBe(2)

    mutation.onError(new Error('first failed'), firstVariables, firstContext)
    const afterStaleError = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    expect(afterStaleError?.[0]?.appearances[0]?.selectedIndex).toBe(2)

    mutation.onError(new Error('second failed'), secondVariables, secondContext)
    const afterLatestRollback = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    expect(afterLatestRollback?.[0]?.appearances[0]?.selectedIndex).toBe(1)
  })

  it('optimistically removes location and restores on error', async () => {
    const allLocationsKey = queryKeys.globalAssets.locations()
    const folderLocationsKey = queryKeys.globalAssets.locations('folder-1')
    queryClient.seedQuery(allLocationsKey, [buildGlobalLocation('loc-1'), buildGlobalLocation('loc-2')])
    queryClient.seedQuery(folderLocationsKey, [buildGlobalLocation('loc-1')])

    const mutation = useDeleteAssetHubLocation() as unknown as DeleteLocationMutation
    const context = await mutation.onMutate('loc-1')

    const afterDeleteAll = queryClient.getQueryData<GlobalLocation[]>(allLocationsKey)
    const afterDeleteFolder = queryClient.getQueryData<GlobalLocation[]>(folderLocationsKey)
    expect(afterDeleteAll?.map((item) => item.id)).toEqual(['loc-2'])
    expect(afterDeleteFolder).toEqual([])

    mutation.onError(new Error('delete failed'), 'loc-1', context)

    const rolledBackAll = queryClient.getQueryData<GlobalLocation[]>(allLocationsKey)
    const rolledBackFolder = queryClient.getQueryData<GlobalLocation[]>(folderLocationsKey)
    expect(rolledBackAll?.map((item) => item.id)).toEqual(['loc-1', 'loc-2'])
    expect(rolledBackFolder?.map((item) => item.id)).toEqual(['loc-1'])
  })

  it('collapses asset hub character candidates immediately when confirming selection', async () => {
    const allCharactersKey = queryKeys.globalAssets.characters()
    queryClient.seedQuery(allCharactersKey, [buildGlobalCharacter(2)])

    const mutation = useSelectCharacterImage() as unknown as SelectCharacterMutation
    await mutation.onMutate({
      characterId: 'character-1',
      appearanceIndex: 0,
      imageIndex: 2,
      confirm: true,
    })

    const afterConfirm = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    expect(afterConfirm?.[0]?.appearances[0]?.selectedIndex).toBe(0)
    expect(afterConfirm?.[0]?.appearances[0]?.imageUrl).toBe('img-2')
    expect(afterConfirm?.[0]?.appearances[0]?.imageUrls).toEqual(['img-2'])
  })

  it('collapses asset hub location candidates immediately when confirming selection', async () => {
    const allLocationsKey = queryKeys.globalAssets.locations()
    queryClient.seedQuery(allLocationsKey, [buildGlobalLocation('loc-1')])

    const mutation = useSelectAssetHubLocationImage() as unknown as SelectLocationMutation
    await mutation.onMutate({
      locationId: 'loc-1',
      imageIndex: 1,
      confirm: true,
    })

    const afterConfirm = queryClient.getQueryData<GlobalLocation[]>(allLocationsKey)
    expect(afterConfirm?.[0]?.images).toHaveLength(1)
    expect(afterConfirm?.[0]?.images[0]?.imageIndex).toBe(0)
    expect(afterConfirm?.[0]?.images[0]?.imageUrl).toBe('img-1')
    expect(afterConfirm?.[0]?.images[0]?.isSelected).toBe(true)
  })

  it('sends confirm flag for asset hub location selection requests', async () => {
    vi.mocked(requestJsonWithError).mockResolvedValue({ success: true })
    const mutation = useSelectAssetHubLocationImage() as unknown as SelectLocationMutation

    await mutation.mutationFn({
      locationId: 'loc-1',
      imageIndex: 1,
      confirm: true,
    })

    expect(requestJsonWithError).toHaveBeenCalledWith(
      '/api/assets/loc-1/select-render',
      expect.objectContaining({
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
          imageIndex: 1,
          confirm: true,
        }),
      }),
      'Failed to select image',
    )
  })
})
