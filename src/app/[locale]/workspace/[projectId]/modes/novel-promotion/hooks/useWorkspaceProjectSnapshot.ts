'use client'

import { useMemo } from 'react'
import type { NovelPromotionWorkspaceProps } from '../types'
import type { CapabilitySelections } from '@/lib/model-config-contract'
import { normalizeStoryboardMoodPresets } from '@/lib/storyboard-mood-presets'
import type { NovelPromotionEpisodeProductionMode } from '@/types/project'

function parseCapabilitySelections(raw: unknown): CapabilitySelections {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CapabilitySelections
  }
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CapabilitySelections
  } catch {
    return {}
  }
}

export function useWorkspaceProjectSnapshot({
  project,
  episode,
  urlStage,
  episodeProductionMode,
}: Pick<NovelPromotionWorkspaceProps, 'project' | 'episode' | 'urlStage'> & {
  episodeProductionMode?: NovelPromotionEpisodeProductionMode | null
}) {
  return useMemo(() => {
    const projectData = project.novelPromotionData
    const capabilityOverrides = parseCapabilitySelections(projectData?.capabilityOverrides)
    const resolvedEpisodeProductionMode = episodeProductionMode || episode?.episodeProductionMode || 'multi_shot'
    const normalizedStage = (() => {
      if (urlStage === 'editor') return 'videos'
      if (urlStage === 'storyboard' && resolvedEpisodeProductionMode === 'multi_shot') {
        return 'multi-shot-storyboard'
      }
      if (urlStage === 'multi-shot-storyboard' && resolvedEpisodeProductionMode === 'traditional') {
        return 'storyboard'
      }
      return urlStage || 'config'
    })()

    return {
      projectData,
      projectCharacters: projectData?.characters || [],
      projectLocations: projectData?.locations || [],
      storyboardMoodPresets: normalizeStoryboardMoodPresets(projectData?.storyboardMoodPresets),
      storyboardDefaultMoodPresetId: projectData?.storyboardDefaultMoodPresetId || null,
      episodeStoryboards: episode?.storyboards || [],
      currentStage: normalizedStage,
      globalAssetText: projectData?.globalAssetText || '',
      novelText: episode?.novelText || '',
      analysisModel: projectData?.analysisModel,
      characterModel: projectData?.characterModel,
      locationModel: projectData?.locationModel,
      storyboardModel: projectData?.storyboardModel,
      editModel: projectData?.editModel,
      videoModel: projectData?.videoModel,
      audioModel: projectData?.audioModel,
      videoRatio: projectData?.videoRatio,
      capabilityOverrides,
      ttsRate: projectData?.ttsRate,
      artStyle: projectData?.artStyle,
    }
  }, [
    episodeProductionMode,
    episode?.episodeProductionMode,
    episode?.novelText,
    episode?.storyboards,
    project.novelPromotionData,
    urlStage,
  ])
}
