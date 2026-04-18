'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import { NovelPromotionStoryboard, NovelPromotionClip, NovelPromotionPanel } from '@/types/project'
import { PanelEditData } from '../../PanelEditForm'
import {
  normalizeStoryboardMoodText,
  resolveStoryboardMoodHierarchy,
  type StoryboardMoodPreset,
} from '@/lib/storyboard-mood-presets'
import {
  computeStoryboardStartIndex,
  computeTotalPanels,
  formatClipTitle,
  getStoryboardPanels,
  sortStoryboardsByClipOrder,
} from './storyboard-state-utils'

export interface StoryboardPanel {
  id: string
  clipId: string
  panelIndex: number
  panel_number: number
  shot_type: string
  camera_move: string | null
  description: string
  characters: { name: string; appearance: string; slot?: string }[]
  location?: string
  srt_range?: string
  duration?: number
  video_prompt?: string
  source_text?: string
  candidateImages?: string
  imageUrl?: string | null
  previousImageUrl?: string | null
  photographyRules?: string | null  // 单镜头摄影规则JSON
  actingNotes?: string | null       // 演技指导数据JSON
  storyboardMoodPresetId?: string | null
  customMood?: string | null
  effectiveMoodPresetId?: string | null
  effectiveMoodPresetLabel?: string | null
  imageTaskRunning?: boolean  // 任务态运行状态（由 tasks 派生）
  effectiveMoodSummary?: string | null
  effectiveMoodSource?: string | null
}

interface UseStoryboardStateProps {
  projectId: string
  episodeId: string
  initialStoryboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  storyboardMoodPresets: StoryboardMoodPreset[]
  projectDefaultMoodPresetId: string | null
  episodeDefaultMoodPresetId: string | null
}

export function useStoryboardState({
  projectId,
  episodeId,
  initialStoryboards,
  clips,
  storyboardMoodPresets,
  projectDefaultMoodPresetId,
  episodeDefaultMoodPresetId,
}: UseStoryboardStateProps) {
  const queryClient = useQueryClient()
  const localStoryboards = useMemo(
    () => sortStoryboardsByClipOrder(initialStoryboards, clips),
    [clips, initialStoryboards],
  )

  const setLocalStoryboards = useCallback<React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>>(
    (nextStoryboardsOrUpdater) => {
      const resolveNextStoryboards = (previousStoryboards: NovelPromotionStoryboard[]) => (
        typeof nextStoryboardsOrUpdater === 'function'
          ? (nextStoryboardsOrUpdater as (previous: NovelPromotionStoryboard[]) => NovelPromotionStoryboard[])(previousStoryboards)
          : nextStoryboardsOrUpdater
      )

      queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const episode = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(episode.storyboards) ? episode.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...episode,
          storyboards: nextStoryboards,
        }
      })

      queryClient.setQueryData(queryKeys.storyboards.all(episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const payload = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(payload.storyboards) ? payload.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...payload,
          storyboards: nextStoryboards,
        }
      })
    },
    [episodeId, projectId, queryClient],
  )

  const [expandedClips, setExpandedClips] = useState<Set<string>>(new Set())

  const [panelEdits, setPanelEdits] = useState<Record<string, PanelEditData>>({})
  // Keep latest panel edits for async callbacks without adding unstable deps.
  const panelEditsRef = useRef<Record<string, PanelEditData>>({})
  panelEditsRef.current = panelEdits

  const getClipInfo = (clipId: string) => clips.find(c => c.id === clipId)

  const resolvePanelEffectiveMood = useCallback((
    storyboardClipId: string,
    panelMood: {
      storyboardMoodPresetId?: string | null
      customMood?: string | null
    },
  ) => {
    const clipMood = clips.find((clip) => clip.id === storyboardClipId)
    return resolveStoryboardMoodHierarchy({
      projectPresets: storyboardMoodPresets,
      projectDefault: {
        presetId: projectDefaultMoodPresetId,
      },
      episodeDefault: {
        presetId: episodeDefaultMoodPresetId,
      },
      clipApplied: {
        presetId: clipMood?.storyboardMoodPresetId ?? null,
        customMood: clipMood?.customMood ?? null,
      },
      panelOverride: {
        presetId: panelMood.storyboardMoodPresetId ?? null,
        customMood: panelMood.customMood ?? null,
      },
    })
  }, [episodeDefaultMoodPresetId, projectDefaultMoodPresetId, storyboardMoodPresets, clips])

  const getPanelImages = (storyboard: NovelPromotionStoryboard): Array<string | null> => {
    const panels = getStoryboardPanels(storyboard)
    if (panels.length > 0) {
      return panels.map((p) => p.imageUrl || null)
    }
    return []
  }

  const getTextPanels = (storyboard: NovelPromotionStoryboard): StoryboardPanel[] => {
    const panels = getStoryboardPanels(storyboard)
    const sortedPanels = [...panels].sort((a: NovelPromotionPanel, b: NovelPromotionPanel) =>
      (a.panelIndex || 0) - (b.panelIndex || 0)
    )
    return sortedPanels.map((p) => {
      const parsedChars = p.characters ? JSON.parse(p.characters) : []
      const characters = Array.isArray(parsedChars)
        ? parsedChars.flatMap((item): Array<{ name: string; appearance: string; slot?: string }> => {
          if (
            typeof item !== 'object'
            || item === null
            || typeof (item as { name?: unknown }).name !== 'string'
            || typeof (item as { appearance?: unknown }).appearance !== 'string'
          ) {
            return []
          }
          const candidate = item as { name: string; appearance: string; slot?: unknown }
          return [{
            name: candidate.name,
            appearance: candidate.appearance,
            slot: typeof candidate.slot === 'string' ? candidate.slot : undefined,
          }]
        })
        : []
      const effectiveMood = resolvePanelEffectiveMood(storyboard.clipId, {
        storyboardMoodPresetId: p.storyboardMoodPresetId ?? null,
        customMood: p.customMood ?? null,
      })
      return {
        id: p.id,
        clipId: storyboard.clipId,
        panelIndex: p.panelIndex,
        panel_number: p.panelNumber ?? p.panelIndex + 1,
        shot_type: p.shotType ?? '',
        camera_move: p.cameraMove,
        description: p.description ?? '',
        location: p.location || undefined,
        characters,
        srt_range: p.srtStart && p.srtEnd ? `${p.srtStart}-${p.srtEnd}` : undefined,
        duration: p.duration ?? undefined,
        video_prompt: p.videoPrompt || undefined,
        source_text: p.srtSegment || undefined,
        candidateImages: p.candidateImages || undefined,
        imageUrl: p.imageUrl,
        previousImageUrl: p.previousImageUrl,
        photographyRules: p.photographyRules,
        actingNotes: p.actingNotes,
        storyboardMoodPresetId: p.storyboardMoodPresetId ?? null,
        customMood: normalizeStoryboardMoodText(p.customMood),
        effectiveMoodPresetId: effectiveMood.preset?.id ?? null,
        effectiveMoodPresetLabel: effectiveMood.preset?.label ?? null,
        imageTaskRunning: p.imageTaskRunning || false,
        effectiveMoodSummary: effectiveMood.summary,
        effectiveMoodSource: effectiveMood.source,
      }
    })
  }

  const derivePanelEditData = useCallback((
    panel: StoryboardPanel,
    overrides?: Partial<PanelEditData>,
  ): PanelEditData => {
    const normalizedCustomMood = normalizeStoryboardMoodText(
      overrides?.customMood ?? panel.customMood,
    )
    const effectiveMood = resolvePanelEffectiveMood(panel.clipId, {
      storyboardMoodPresetId: overrides?.storyboardMoodPresetId ?? panel.storyboardMoodPresetId ?? null,
      customMood: normalizedCustomMood,
    })

    return {
      id: panel.id,
      panelIndex: overrides?.panelIndex ?? panel.panelIndex,
      panelNumber: overrides?.panelNumber ?? panel.panel_number,
      shotType: overrides?.shotType ?? panel.shot_type,
      cameraMove: overrides?.cameraMove ?? panel.camera_move,
      description: overrides?.description ?? panel.description,
      location: (overrides?.location ?? panel.location) || null,
      characters: (overrides?.characters ?? panel.characters) || [],
      srtStart: overrides?.srtStart ?? null,
      srtEnd: overrides?.srtEnd ?? null,
      duration: (overrides?.duration ?? panel.duration) || null,
      videoPrompt: (overrides?.videoPrompt ?? panel.video_prompt) || null,
      photographyRules: overrides?.photographyRules ?? panel.photographyRules ?? null,
      actingNotes: overrides?.actingNotes ?? panel.actingNotes ?? null,
      sourceText: overrides?.sourceText ?? panel.source_text,
      storyboardMoodPresetId: overrides?.storyboardMoodPresetId ?? panel.storyboardMoodPresetId ?? null,
      customMood: normalizedCustomMood,
      effectiveMoodPresetId: effectiveMood.preset?.id ?? null,
      effectiveMoodPresetLabel: effectiveMood.preset?.label ?? null,
      effectiveMoodSummary: effectiveMood.summary,
      effectiveMoodSource: effectiveMood.source,
    }
  }, [resolvePanelEffectiveMood])

  const getPanelEditData = (panel: StoryboardPanel): PanelEditData => {
    return derivePanelEditData(panel, panelEdits[panel.id])
  }

  const updatePanelEdit = (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => {
    setPanelEdits(prev => {
      const nextData = derivePanelEditData(panel, {
        ...prev[panelId],
        ...updates,
      })
      return {
        ...prev,
        [panelId]: nextData,
      }
    })
  }

  const toggleExpandedClip = (storyboardId: string) => {
    setExpandedClips(prev => {
      const next = new Set(prev)
      if (next.has(storyboardId)) {
        next.delete(storyboardId)
      } else {
        next.add(storyboardId)
      }
      return next
    })
  }

  const sortedStoryboards = [...localStoryboards].sort((a, b) => {
    const clipIndexA = clips.findIndex(c => c.id === a.clipId)
    const clipIndexB = clips.findIndex(c => c.id === b.clipId)
    return clipIndexA - clipIndexB
  })

  const totalPanels = computeTotalPanels(localStoryboards)
  const storyboardStartIndex = computeStoryboardStartIndex(sortedStoryboards)

  return {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEdits,
    setPanelEdits,
    panelEditsRef,
    getClipInfo,
    getPanelImages,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex
  }
}
