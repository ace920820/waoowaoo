import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MultiShotStoryboardStage from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage'
import {
  buildReviewSavePayload,
  syncReviewDraftsFromShotGroups,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection'
import type { NovelPromotionShotGroup } from '@/types/project'
import type { StoryboardMoodPreset } from '@/lib/storyboard-mood-presets'

const mocks = vi.hoisted(() => ({
  useWorkspaceStageRuntimeMock: vi.fn(),
  useWorkspaceEpisodeStageDataMock: vi.fn(),
  useWorkspaceProviderMock: vi.fn(),
  useProjectAssetsMock: vi.fn(),
  useUpdateProjectShotGroupMock: vi.fn(),
  useUploadProjectShotGroupReferenceImageMock: vi.fn(),
  useGenerateProjectShotGroupImageMock: vi.fn(),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')
  >('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')

  return {
    ...actual,
    useWorkspaceStageRuntime: mocks.useWorkspaceStageRuntimeMock,
  }
})

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData', () => ({
  useWorkspaceEpisodeStageData: mocks.useWorkspaceEpisodeStageDataMock,
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceProvider', () => ({
  useWorkspaceProvider: mocks.useWorkspaceProviderMock,
}))

vi.mock('@/lib/query/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/hooks')>('@/lib/query/hooks')
  return {
    ...actual,
    useProjectAssets: mocks.useProjectAssetsMock,
    useUpdateProjectShotGroup: mocks.useUpdateProjectShotGroupMock,
    useUploadProjectShotGroupReferenceImage: mocks.useUploadProjectShotGroupReferenceImageMock,
    useGenerateProjectShotGroupImage: mocks.useGenerateProjectShotGroupImageMock,
  }
})

const moodPresets: StoryboardMoodPreset[] = [
  { id: 'mood-rain', label: '冷雨压迫', prompt: '雨夜、冷光、压迫感' },
  { id: 'mood-city', label: '都市冷感', prompt: '高楼、风感、都市孤独' },
]

function createShotGroup(): NovelPromotionShotGroup {
  return {
    id: 'group-1',
    episodeId: 'episode-1',
    title: '片段 1',
    templateKey: 'grid-9',
    groupPrompt: '镜头从高空压下，人物踏入空旷街口。',
    videoPrompt: '镜头从高空压下，人物踏入空旷街口。',
    includeDialogue: true,
    dialogueLanguage: 'zh',
    videoModel: 'model-1',
    compositeImageUrl: '/shot-group-preview.png',
    referenceImageUrl: '/reference.png',
    videoUrl: null,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    items: new Array(9).fill(null).map((_, index) => ({
      id: `group-1-item-${index + 1}`,
      shotGroupId: 'group-1',
      itemIndex: index + 1,
      title: `镜头 ${index + 1}`,
    })),
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '雨夜街口',
        narrativePrompt: '适合模型直接生成的多镜头段落提示词',
        embeddedDialogue: '“不要再往前了。”',
        shotRhythmGuidance: '先远景建立，再中景推进，最后切角色特写。',
        expectedShotCount: 9,
        sourceStatus: 'ready',
        placeholderReason: null,
        preselectedLocationAsset: {
          assetType: 'location',
          source: 'preselected',
          assetId: 'location-1',
          label: '雨夜街口',
        },
        selectedCharacterAssets: [{
          assetType: 'character',
          source: 'manual',
          assetId: 'character-1',
          label: '林夏',
        }],
        storyboardModeId: 'classic-nine-grid',
        storyboardModeLabel: '经典九宫格',
        storyboardModePromptText: '固定九宫格构图提示词',
        referencePromptText: '用资产图生成一张机舱内的母图，先锁定人物身份、服装和公文包位置。',
        compositePromptText: '基于母图生成九宫格分镜参考表，镜头从建立到特写逐步推进。',
        submittedReferencePrompt: 'FINAL REFERENCE PROMPT',
        submittedCompositePrompt: 'FINAL COMPOSITE PROMPT',
        missingAssetWarnings: [{
          assetType: 'prop',
          code: 'missing_asset_binding',
          message: '物品素材缺失，当前片段将继续使用剧本文本回退生成',
        }],
        storyboardMoodPresetId: 'mood-rain',
        customMood: '潮湿、压迫、冷白霓虹',
      },
    }),
  }
}

function renderStage() {
  Reflect.set(globalThis, 'React', React)
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MultiShotStoryboardStage),
    ),
  )
}

describe('multi-shot asset injection stage', () => {
  beforeEach(() => {
    mocks.useWorkspaceStageRuntimeMock.mockReset()
    mocks.useWorkspaceEpisodeStageDataMock.mockReset()
    mocks.useWorkspaceProviderMock.mockReset()
    mocks.useProjectAssetsMock.mockReset()
    mocks.useUpdateProjectShotGroupMock.mockReset()
    mocks.useUploadProjectShotGroupReferenceImageMock.mockReset()
    mocks.useGenerateProjectShotGroupImageMock.mockReset()

    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      onStageChange: vi.fn(),
      videoModel: 'model-1',
      capabilityOverrides: {},
      userVideoModels: [],
      storyboardMoodPresets: moodPresets,
      storyboardDefaultMoodPresetId: 'mood-city',
    })
    mocks.useWorkspaceProviderMock.mockReturnValue({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      shotGroups: [createShotGroup()],
      clips: [],
      storyboards: [],
      storyboardDefaultMoodPresetId: null,
    })
    mocks.useProjectAssetsMock.mockReturnValue({
      data: {
        locations: [{ id: 'location-1', name: '雨夜街口', summary: null, selectedImageId: null, images: [] }],
        characters: [{ id: 'character-1', name: '林夏', appearances: [] }],
        props: [{ id: 'prop-1', name: '黑伞', summary: null, selectedImageId: null, images: [] }],
      },
    })
    mocks.useUpdateProjectShotGroupMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useUploadProjectShotGroupReferenceImageMock.mockReturnValue({
      isPending: false,
      variables: null,
      mutate: vi.fn(),
    })
    mocks.useGenerateProjectShotGroupImageMock.mockReturnValue({
      isPending: false,
      variables: null,
      mutate: vi.fn(),
    })
  })

  it('renders asset and mood controls plus hover management labels on the review card', () => {
    const html = renderStage()

    expect(html).toContain('辅助参考图提示词')
    expect(html).toContain('分镜模式')
    expect(html).toContain('剧情内容')
    expect(html).toContain('分镜表模板')
    expect(html).toContain('默认建议保持 `9 格`')
    expect(html).toContain('场景')
    expect(html).toContain('角色')
    expect(html).toContain('物品')
    expect(html).toContain('分镜氛围预设')
    expect(html).toContain('自定义氛围')
    expect(html).toContain('辅助参考图')
    expect(html).toContain('分镜参考表')
    expect(html).toContain('生成辅助参考图')
    expect(html).toContain('查看大图')
    expect(html).toContain('重新生成')
    expect(html).toContain('替换上传')
    expect(html).toContain('编辑资产引用')
    expect(html).toContain('移除当前引用')
    expect(html).toContain('显示提示词')
  })

  it('shows warning-but-continue state and distinguishes manual overrides from auto-preselection', () => {
    const html = renderStage()

    expect(html).toContain('缺少 物品 绑定，当前卡片仍可继续生成')
    expect(html).toContain('林夏（手动覆盖）')
    expect(html).toContain('雨夜街口（系统预选）')
  })

  it('builds a save payload that persists manual asset choices and mood fields through draftMetadata', () => {
    const payload = buildReviewSavePayload(createShotGroup(), {
      templateKey: 'grid-9',
      referencePromptText: '先生成废弃站台里的母图，锁定角色服装、站位和风感。',
      compositePromptText: '再基于母图生成九宫格分镜参考表，保证镜头类型完整。',
      storyboardModeId: 'classic-nine-grid',
      selectedLocationAsset: {
        assetType: 'location',
        source: 'manual',
        assetId: 'location-2',
        label: '废弃站台',
      },
      selectedCharacterAssets: [{
        assetType: 'character',
        source: 'manual',
        assetId: 'character-2',
        label: '周沉',
      }],
      selectedPropAssets: [{
        assetType: 'prop',
        source: 'manual',
        assetId: 'prop-9',
        label: '染血信封',
      }],
      storyboardMoodPresetId: 'mood-city',
      customMood: '冷风、空旷、危险逼近',
    })

    expect(payload).toMatchObject({
      shotGroupId: 'group-1',
      templateKey: 'grid-9',
      groupPrompt: '再基于母图生成九宫格分镜参考表，保证镜头类型完整。',
      videoPrompt: '再基于母图生成九宫格分镜参考表，保证镜头类型完整。',
      draftMetadata: expect.objectContaining({
        referencePromptText: '先生成废弃站台里的母图，锁定角色服装、站位和风感。',
        compositePromptText: '再基于母图生成九宫格分镜参考表，保证镜头类型完整。',
        storyboardModeId: 'classic-nine-grid',
        storyboardModeLabel: '经典九宫格',
        storyboardModePromptText: expect.stringContaining('分析输入图像的完整构图'),
        storyboardMoodPresetId: 'mood-city',
        customMood: '冷风、空旷、危险逼近',
        selectedLocationAsset: expect.objectContaining({
          assetId: 'location-2',
          source: 'manual',
        }),
      }),
    })
    expect(payload.draftMetadata?.selectedCharacterAssets).toEqual([
      expect.objectContaining({ assetId: 'character-2', source: 'manual' }),
    ])
    expect(payload.draftMetadata?.selectedPropAssets).toEqual([
      expect.objectContaining({ assetId: 'prop-9', source: 'manual' }),
    ])
  })

  it('keeps synchronized review drafts stable when shot-group source data has not changed', () => {
    const shotGroup = createShotGroup()
    const seeded = syncReviewDraftsFromShotGroups({}, [shotGroup])
    const resynced = syncReviewDraftsFromShotGroups(seeded, [shotGroup])

    expect(resynced).toBe(seeded)
  })

  it('warns that a mother reference image is required before generating the storyboard board', () => {
    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      shotGroups: [{
        ...createShotGroup(),
        referenceImageUrl: null,
        compositeImageUrl: null,
      }],
      clips: [],
      storyboards: [],
      storyboardDefaultMoodPresetId: null,
    })

    const html = renderStage()

    expect(html).toContain('请先上传或生成辅助参考图')
    expect(html).toContain('辅助参考图作为唯一图像参考输入')
  })

  it('shows storyboard board generation when a mother reference image is present', () => {
    const html = renderStage()

    expect(html).toContain('重新生成辅助参考图')
    expect(html).toContain('重新生成分镜参考表')
  })

  it('shows the project default mood preset on review cards when the segment has no override', () => {
    const shotGroup = createShotGroup()
    shotGroup.videoReferencesJson = JSON.stringify({
      draftMetadata: {
        ...JSON.parse(shotGroup.videoReferencesJson || '{}').draftMetadata,
        storyboardMoodPresetId: null,
        customMood: null,
      },
    })

    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      shotGroups: [shotGroup],
      clips: [],
      storyboards: [],
      storyboardDefaultMoodPresetId: null,
    })

    const html = renderStage()

    expect(html).toContain('跟随默认氛围预设（都市冷感）')
    expect(html).toContain('当前：跟随默认氛围预设 都市冷感')
  })

  it('persists inherited mood preset when the review card follows project defaults', () => {
    const payload = buildReviewSavePayload(
      createShotGroup(),
      {
        templateKey: 'grid-9',
        referencePromptText: '母图提示词',
        compositePromptText: '剧情内容',
        storyboardModeId: 'classic-nine-grid',
        selectedLocationAsset: null,
        selectedCharacterAssets: [],
        selectedPropAssets: [],
        storyboardMoodPresetId: '',
        customMood: '',
      },
      null,
      'mood-city',
    )

    expect(payload.draftMetadata?.storyboardMoodPresetId).toBe('mood-city')
  })
})
