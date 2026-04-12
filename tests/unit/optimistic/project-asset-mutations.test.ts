import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetSummary } from '@/lib/assets/contracts'
import type { Character, Location, Project } from '@/types/project'
import type { ProjectAssetsData } from '@/lib/query/hooks/useProjectAssets'
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
    invalidateQueryTemplates: vi.fn(),
  }
})

import {
  useDeleteProjectCharacter,
  useSelectProjectCharacterImage,
} from '@/lib/query/mutations/character-base-mutations'
import { useConfirmProjectCharacterSelection } from '@/lib/query/mutations/character-profile-mutations'
import { useConfirmProjectLocationSelection } from '@/lib/query/mutations/location-management-mutations'
import { useSelectProjectLocationImage } from '@/lib/query/mutations/location-image-mutations'

interface SelectProjectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceId: string
    imageIndex: number | null
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface DeleteProjectCharacterMutation {
  onMutate: (characterId: string) => Promise<unknown>
  onError: (error: unknown, characterId: string, context: unknown) => void
}

interface SelectProjectLocationMutation {
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

interface ConfirmProjectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceId: string
  }) => Promise<{ previousAssets: ProjectAssetsData | undefined; previousProject: Project | undefined }>
}

interface ConfirmProjectLocationMutation {
  onMutate: (variables: {
    locationId: string
  }) => Promise<{ previousAssets: ProjectAssetsData | undefined; previousProject: Project | undefined }>
}

function buildCharacter(selectedIndex: number | null): Character {
  return {
    id: 'character-1',
    name: 'Hero',
    appearances: [{
      id: 'appearance-1',
      appearanceIndex: 0,
      changeReason: 'default',
      description: null,
      descriptions: null,
      imageUrl: selectedIndex === null ? null : `img-${selectedIndex}`,
      imageUrls: ['img-0', 'img-1', 'img-2'],
      previousImageUrl: null,
      previousImageUrls: [],
      previousDescription: null,
      previousDescriptions: null,
      selectedIndex,
    }],
  }
}


function buildUnifiedCharacterAsset(selectedIndex: number | null): AssetSummary {
  return {
    id: 'character-1',
    scope: 'project',
    kind: 'character',
    family: 'visual',
    name: 'Hero',
    folderId: null,
    capabilities: {
      canGenerate: true,
      canSelectRender: true,
      canRevertRender: true,
      canModifyRender: true,
      canUploadRender: true,
      canBindVoice: true,
      canCopyFromGlobal: true,
    },
    taskRefs: [],
    taskState: { isRunning: false, lastError: null },
    variants: [{
      id: 'appearance-1',
      index: 0,
      label: 'default',
      description: null,
      selectionState: { selectedRenderIndex: selectedIndex },
      renders: ['img-0', 'img-1', 'img-2'].map((imageUrl, index) => ({
        id: `appearance-1:${index}`,
        index,
        imageUrl,
        media: null,
        isSelected: selectedIndex === index,
        previousImageUrl: null,
        previousMedia: null,
        taskRefs: [],
        taskState: { isRunning: false, lastError: null },
      })),
      taskRefs: [],
      taskState: { isRunning: false, lastError: null },
    }],
    introduction: null,
    profileData: null,
    profileConfirmed: null,
    profileTaskRefs: [],
    profileTaskState: { isRunning: false, lastError: null },
    voice: {
      voiceType: null,
      voiceId: null,
      customVoiceUrl: null,
      media: null,
    },
  }
}

function buildAssets(selectedIndex: number | null): ProjectAssetsData {
  return {
    characters: [buildCharacter(selectedIndex)],
    locations: [{
      id: 'location-1',
      name: 'Cafe',
      summary: null,
      selectedImageId: selectedIndex === null ? null : `location-image-${selectedIndex}`,
      images: [
        { id: 'location-image-0', imageIndex: 0, imageUrl: 'loc-0', isSelected: selectedIndex === 0, previousImageUrl: null, description: null },
        { id: 'location-image-1', imageIndex: 1, imageUrl: 'loc-1', isSelected: selectedIndex === 1, previousImageUrl: null, description: null },
        { id: 'location-image-2', imageIndex: 2, imageUrl: 'loc-2', isSelected: selectedIndex === 2, previousImageUrl: null, description: null },
      ],
    }] as Location[],
    props: [],
  }
}

function buildProject(selectedIndex: number | null): Project {
  return {
    novelPromotionData: {
      characters: [buildCharacter(selectedIndex)],
      locations: buildAssets(selectedIndex).locations,
      props: [],
    },
  } as unknown as Project
}

describe('project asset optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
    vi.mocked(requestJsonWithError).mockReset()
  })

  it('optimistically selects project character image and ignores stale rollback', async () => {
    const projectId = 'project-1'
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'project', projectId, kind: 'character' })
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedCharacterAsset(0)])
    queryClient.seedQuery(assetsKey, buildAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useSelectProjectCharacterImage(projectId) as unknown as SelectProjectCharacterMutation
    const firstVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 1,
    }
    const secondVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 2,
    }

    const firstContext = await mutation.onMutate(firstVariables)
    const afterFirst = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    const afterFirstUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterFirst?.characters[0]?.appearances[0]?.selectedIndex).toBe(1)
    expect(afterFirstUnified?.[0]?.kind).toBe('character')
    if (afterFirstUnified?.[0]?.kind === 'character') {
      expect(afterFirstUnified[0].variants[0]?.selectionState.selectedRenderIndex).toBe(1)
      expect(afterFirstUnified[0].variants[0]?.renders[1]?.isSelected).toBe(true)
    }

    const secondContext = await mutation.onMutate(secondVariables)
    const afterSecond = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    const afterSecondUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterSecond?.characters[0]?.appearances[0]?.selectedIndex).toBe(2)
    if (afterSecondUnified?.[0]?.kind === 'character') {
      expect(afterSecondUnified[0].variants[0]?.selectionState.selectedRenderIndex).toBe(2)
    }

    mutation.onError(new Error('first failed'), firstVariables, firstContext)
    const afterStaleError = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterStaleError?.characters[0]?.appearances[0]?.selectedIndex).toBe(2)

    mutation.onError(new Error('second failed'), secondVariables, secondContext)
    const afterLatestRollback = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    const afterUnifiedRollback = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterLatestRollback?.characters[0]?.appearances[0]?.selectedIndex).toBe(1)
    if (afterUnifiedRollback?.[0]?.kind === 'character') {
      expect(afterUnifiedRollback[0].variants[0]?.selectionState.selectedRenderIndex).toBe(1)
    }
  })

  it('optimistically deletes project character and restores on error', async () => {
    const projectId = 'project-1'
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'project', projectId, kind: 'character' })
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedCharacterAsset(0)])
    queryClient.seedQuery(assetsKey, buildAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useDeleteProjectCharacter(projectId) as unknown as DeleteProjectCharacterMutation
    const context = await mutation.onMutate('character-1')

    const afterDeleteAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterDeleteAssets?.characters).toHaveLength(0)

    const afterDeleteProject = queryClient.getQueryData<Project>(projectKey)
    expect(afterDeleteProject?.novelPromotionData?.characters ?? []).toHaveLength(0)

    mutation.onError(new Error('delete failed'), 'character-1', context)

    const rolledBackAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(rolledBackAssets?.characters).toHaveLength(1)
    expect(rolledBackAssets?.characters[0]?.id).toBe('character-1')
  })

  it('sends confirm flag for project character selection requests', async () => {
    vi.mocked(requestJsonWithError).mockResolvedValue({ success: true })
    const mutation = useSelectProjectCharacterImage('project-1') as unknown as SelectProjectCharacterMutation & {
      mutationFn: (variables: {
        characterId: string
        appearanceId: string
        imageIndex: number | null
        confirm?: boolean
      }) => Promise<unknown>
    }

    await mutation.mutationFn({
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 2,
      confirm: true,
    })

    expect(requestJsonWithError).toHaveBeenCalledWith(
      '/api/assets/character-1/select-render',
      expect.objectContaining({
        body: JSON.stringify({
          scope: 'project',
          kind: 'character',
          projectId: 'project-1',
          appearanceId: 'appearance-1',
          imageIndex: 2,
          confirm: true,
        }),
      }),
      'Failed to select image',
    )
  })

  it('sends confirm flag for project location selection requests', async () => {
    vi.mocked(requestJsonWithError).mockResolvedValue({ success: true })
    const mutation = useSelectProjectLocationImage('project-1') as unknown as SelectProjectLocationMutation

    await mutation.mutationFn({
      locationId: 'location-1',
      imageIndex: 2,
      confirm: true,
    })

    expect(requestJsonWithError).toHaveBeenCalledWith(
      '/api/assets/location-1/select-render',
      expect.objectContaining({
        body: JSON.stringify({
          scope: 'project',
          kind: 'location',
          projectId: 'project-1',
          imageIndex: 2,
          confirm: true,
        }),
      }),
      'Failed to select image',
    )
  })

  it('collapses project character candidates immediately when confirming selection', async () => {
    const projectId = 'project-1'
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'project', projectId, kind: 'character' })
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedCharacterAsset(2)])
    queryClient.seedQuery(assetsKey, buildAssets(2))
    queryClient.seedQuery(projectKey, buildProject(2))

    const mutation = useConfirmProjectCharacterSelection(projectId) as unknown as ConfirmProjectCharacterMutation
    await mutation.onMutate({
      characterId: 'character-1',
      appearanceId: 'appearance-1',
    })

    const afterAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    const afterProject = queryClient.getQueryData<Project>(projectKey)
    const afterUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterAssets?.characters[0]?.appearances[0]?.selectedIndex).toBe(0)
    expect(afterAssets?.characters[0]?.appearances[0]?.imageUrls).toEqual(['img-2'])
    expect(afterProject?.novelPromotionData?.characters?.[0]?.appearances?.[0]?.imageUrls).toEqual(['img-2'])
    expect(afterUnified?.[0]?.kind).toBe('character')
    if (afterUnified?.[0]?.kind === 'character') {
      expect(afterUnified[0].variants[0]?.selectionState.selectedRenderIndex).toBe(0)
      expect(afterUnified[0].variants[0]?.renders).toHaveLength(1)
      expect(afterUnified[0].variants[0]?.renders[0]?.imageUrl).toBe('img-2')
    }
  })

  it('collapses project location candidates immediately when confirming selection', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(assetsKey, buildAssets(2))
    queryClient.seedQuery(projectKey, buildProject(2))

    const mutation = useConfirmProjectLocationSelection(projectId) as unknown as ConfirmProjectLocationMutation
    await mutation.onMutate({ locationId: 'location-1' })

    const afterAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    const afterProject = queryClient.getQueryData<Project>(projectKey)
    expect(afterAssets?.locations[0]?.selectedImageId).toBe('location-image-2')
    expect(afterAssets?.locations[0]?.images).toHaveLength(1)
    expect(afterAssets?.locations[0]?.images[0]?.imageUrl).toBe('loc-2')
    expect(afterProject?.novelPromotionData?.locations?.[0]?.images).toHaveLength(1)
  })
})
