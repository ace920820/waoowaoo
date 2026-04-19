import { parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'

export type StageArtifactReadiness = {
  hasStory: boolean
  hasScript: boolean
  hasStoryboard: boolean
  hasVideo: boolean
  hasVoice: boolean
}

type EpisodeClipLike = {
  screenplay?: string | null
  [key: string]: unknown
}

type StoryboardPanelLike = {
  videoUrl?: string | null
  [key: string]: unknown
}

type StoryboardLike = {
  panels?: StoryboardPanelLike[] | null
  [key: string]: unknown
}

type ShotGroupLike = {
  compositeImageUrl?: string | null
  videoReferencesJson?: string | null
  videoUrl?: string | null
  [key: string]: unknown
}

type EpisodeLike = {
  episodeProductionMode?: string | null
  novelText?: string | null
  clips?: unknown[] | null
  storyboards?: unknown[] | null
  shotGroups?: unknown[] | null
  voiceLines?: unknown[] | null
}

type EpisodeStageDataLike = Pick<EpisodeLike, 'episodeProductionMode' | 'clips' | 'storyboards' | 'shotGroups'>

function hasNonEmptyText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function isEpisodeClipLike(value: unknown): value is EpisodeClipLike {
  return typeof value === 'object' && value !== null
}

function isStoryboardPanelLike(value: unknown): value is StoryboardPanelLike {
  return typeof value === 'object' && value !== null
}

function isStoryboardLike(value: unknown): value is StoryboardLike {
  return typeof value === 'object' && value !== null
}

function isShotGroupLike(value: unknown): value is ShotGroupLike {
  return typeof value === 'object' && value !== null
}

function hasDraftSegmentKey(value: string | null | undefined) {
  const strictMetadata = parseShotGroupDraftMetadata(value)
  if (hasNonEmptyText(strictMetadata?.segmentKey)) return true
  if (!hasNonEmptyText(value)) return false

  try {
    const parsed = JSON.parse(value)
    const record = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
    const metadata = record?.draftMetadata
    return typeof metadata === 'object'
      && metadata !== null
      && !Array.isArray(metadata)
      && hasNonEmptyText((metadata as Record<string, unknown>).segmentKey as string | null | undefined)
  } catch {
    return false
  }
}

export function hasScriptArtifacts(clips: unknown[] | null | undefined) {
  if (!Array.isArray(clips) || clips.length === 0) return false
  return clips.some((clip) => isEpisodeClipLike(clip) && hasNonEmptyText(clip.screenplay))
}

export function hasStoryboardArtifacts(
  storyboards: unknown[] | null | undefined,
  shotGroups?: unknown[] | null | undefined,
) {
  const hasPanels = Array.isArray(storyboards) && storyboards.some((storyboard) => isStoryboardLike(storyboard)
    && Array.isArray(storyboard.panels)
    && storyboard.panels.some((panel) => isStoryboardPanelLike(panel)))
  if (hasPanels) return true
  if (!Array.isArray(shotGroups) || shotGroups.length === 0) return false
  return shotGroups.some((shotGroup) => {
    if (!isShotGroupLike(shotGroup)) return false
    if (hasNonEmptyText(shotGroup.compositeImageUrl)) return true

    return hasDraftSegmentKey(shotGroup.videoReferencesJson)
  })
}

export function hasVideoArtifacts(
  storyboards: unknown[] | null | undefined,
  shotGroups?: unknown[] | null | undefined,
) {
  const hasPanelVideos = Array.isArray(storyboards) && storyboards.some((storyboard) => isStoryboardLike(storyboard)
    && Array.isArray(storyboard.panels)
    && storyboard.panels.some((panel) => isStoryboardPanelLike(panel) && hasNonEmptyText(panel.videoUrl)))
  if (hasPanelVideos) return true
  if (!Array.isArray(shotGroups) || shotGroups.length === 0) return false
  return shotGroups.some((shotGroup) => isShotGroupLike(shotGroup) && hasNonEmptyText(shotGroup.videoUrl))
}

export function resolveEpisodeStageArtifacts(episode: EpisodeLike | null | undefined): StageArtifactReadiness {
  return {
    hasStory: hasNonEmptyText(episode?.novelText),
    hasScript: hasScriptArtifacts(episode?.clips),
    hasStoryboard: hasStoryboardArtifacts(episode?.storyboards, episode?.shotGroups),
    hasVideo: hasVideoArtifacts(episode?.storyboards, episode?.shotGroups),
    hasVoice: Array.isArray(episode?.voiceLines) && episode.voiceLines.length > 0,
  }
}

export function resolveStageArtifactsEpisodeData(
  episode: EpisodeLike | null | undefined,
  liveEpisodeStageData: EpisodeStageDataLike | null | undefined,
): EpisodeLike | null | undefined {
  if (!episode && !liveEpisodeStageData) return undefined

  return {
    ...episode,
    episodeProductionMode: liveEpisodeStageData?.episodeProductionMode || episode?.episodeProductionMode,
    clips: Array.isArray(liveEpisodeStageData?.clips) && liveEpisodeStageData.clips.length > 0
      ? liveEpisodeStageData.clips
      : episode?.clips,
    storyboards: Array.isArray(liveEpisodeStageData?.storyboards) && liveEpisodeStageData.storyboards.length > 0
      ? liveEpisodeStageData.storyboards
      : episode?.storyboards,
    shotGroups: Array.isArray(liveEpisodeStageData?.shotGroups) && liveEpisodeStageData.shotGroups.length > 0
      ? liveEpisodeStageData.shotGroups
      : episode?.shotGroups,
  }
}
