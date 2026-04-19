'use client'

import { useMemo } from 'react'
import type { WorkspaceStageRuntimeValue } from '../WorkspaceStageRuntimeContext'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from '../components/video'
import type { StoryboardMoodPreset } from '@/lib/storyboard-mood-presets'

interface UseWorkspaceStageRuntimeParams {
  assetsLoading: boolean
  isSubmittingTTS: boolean
  isTransitioning: boolean
  isConfirmingAssets: boolean
  isStartingStoryToScript: boolean
  isStartingScriptToStoryboard: boolean
  videoRatio: string | undefined
  artStyle: string | undefined
  storyboardMoodPresets: StoryboardMoodPreset[]
  storyboardDefaultMoodPresetId: string | null | undefined
  episodeProductionMode: 'multi_shot' | 'traditional'
  videoModel: string | undefined
  capabilityOverrides: CapabilitySelections
  userVideoModels: Array<{
    value: string
    label: string
    provider?: string
    providerName?: string
    capabilities?: ModelCapabilities
    videoPricingTiers?: VideoPricingTier[]
  }> | undefined
  handleUpdateEpisode: (key: string, value: unknown) => Promise<void>
  handleUpdateConfig: (key: string, value: unknown) => Promise<void>
  runWithRebuildConfirm: (action: 'storyToScript' | 'scriptToStoryboard' | 'switchEpisodeProductionMode', operation: () => Promise<void>) => Promise<void>
  runStoryToScriptFlow: () => Promise<void>
  runScriptToStoryboardFlow: () => Promise<void>
  handleUpdateClip: (clipId: string, updates: Record<string, unknown>) => Promise<void>
  openAssetLibrary: (characterId?: string | null, refreshAssets?: boolean) => void
  handleStageChange: (stage: string) => void
  handleGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
    },
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => Promise<void>
  handleGenerateAllVideos: (options?: BatchVideoGenerationParams) => Promise<void>
  handleUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt' | 'dialogueOverride',
  ) => Promise<void>
  handleUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
}

export function useWorkspaceStageRuntime({
  assetsLoading,
  isSubmittingTTS,
  isTransitioning,
  isConfirmingAssets,
  isStartingStoryToScript,
  isStartingScriptToStoryboard,
  videoRatio,
  artStyle,
  storyboardMoodPresets,
  storyboardDefaultMoodPresetId,
  episodeProductionMode,
  videoModel,
  capabilityOverrides,
  userVideoModels,
  handleUpdateEpisode,
  handleUpdateConfig,
  runWithRebuildConfirm,
  runStoryToScriptFlow,
  runScriptToStoryboardFlow,
  handleUpdateClip,
  openAssetLibrary,
  handleStageChange,
  handleGenerateVideo,
  handleGenerateAllVideos,
  handleUpdateVideoPrompt,
  handleUpdatePanelVideoModel,
}: UseWorkspaceStageRuntimeParams) {
  const resolvedUserVideoModels = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )

  return useMemo<WorkspaceStageRuntimeValue>(() => ({
    assetsLoading,
    isSubmittingTTS,
    isTransitioning,
    isConfirmingAssets,
    isStartingStoryToScript,
    isStartingScriptToStoryboard,
    videoRatio,
    artStyle,
    storyboardMoodPresets,
    storyboardDefaultMoodPresetId,
    episodeProductionMode,
    videoModel,
    capabilityOverrides,
    userVideoModels: resolvedUserVideoModels,
    onNovelTextChange: (value) => handleUpdateEpisode('novelText', value),
    onEpisodeDefaultMoodPresetChange: (value) => handleUpdateEpisode('storyboardDefaultMoodPresetId', value),
    onEpisodeProductionModeChange: async (value) => {
      if (value === episodeProductionMode) return
      await runWithRebuildConfirm('switchEpisodeProductionMode', async () => {
        await handleUpdateEpisode('episodeProductionMode', value)
      })
    },
    onVideoRatioChange: (value) => handleUpdateConfig('videoRatio', value),
    onArtStyleChange: (value) => handleUpdateConfig('artStyle', value),
    onRunStoryToScript: () => runWithRebuildConfirm('storyToScript', runStoryToScriptFlow),
    onClipUpdate: (clipId, data) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('onClipUpdate requires a plain object payload')
      }
      return handleUpdateClip(clipId, data as Record<string, unknown>)
    },
    onOpenAssetLibrary: () => openAssetLibrary(),
    onRunScriptToStoryboard: () =>
      episodeProductionMode === 'traditional'
        ? runWithRebuildConfirm('scriptToStoryboard', runScriptToStoryboardFlow)
        : Promise.resolve(handleStageChange('videos')),
    onStageChange: handleStageChange,
    onGenerateVideo: handleGenerateVideo,
    onGenerateAllVideos: handleGenerateAllVideos,
    onUpdateVideoPrompt: handleUpdateVideoPrompt,
    onUpdatePanelVideoModel: handleUpdatePanelVideoModel,
    onOpenAssetLibraryForCharacter: (characterId, refreshAssets) => openAssetLibrary(characterId, refreshAssets),
  }), [
    artStyle,
    assetsLoading,
    handleGenerateAllVideos,
    handleGenerateVideo,
    handleStageChange,
    handleUpdateClip,
    handleUpdateConfig,
    handleUpdateEpisode,
    handleUpdatePanelVideoModel,
    handleUpdateVideoPrompt,
    isConfirmingAssets,
    isStartingScriptToStoryboard,
    isStartingStoryToScript,
    isSubmittingTTS,
    isTransitioning,
    openAssetLibrary,
    runScriptToStoryboardFlow,
    runStoryToScriptFlow,
    runWithRebuildConfirm,
    resolvedUserVideoModels,
    capabilityOverrides,
    episodeProductionMode,
    videoModel,
    videoRatio,
    storyboardMoodPresets,
    storyboardDefaultMoodPresetId,
  ])
}
