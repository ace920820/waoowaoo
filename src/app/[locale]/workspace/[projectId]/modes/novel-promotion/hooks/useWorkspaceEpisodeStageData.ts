'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type {
  NovelPromotionClip,
  NovelPromotionEpisodeProductionMode,
  NovelPromotionShotGroup,
  NovelPromotionStoryboard,
} from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  episodeProductionMode?: NovelPromotionEpisodeProductionMode | null
  storyboardDefaultMoodPresetId?: string | null
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
  shotGroups?: NovelPromotionShotGroup[]
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    episodeProductionMode: payload?.episodeProductionMode || 'multi_shot',
    storyboardDefaultMoodPresetId: payload?.storyboardDefaultMoodPresetId || null,
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
    shotGroups: payload?.shotGroups || [],
  }
}
