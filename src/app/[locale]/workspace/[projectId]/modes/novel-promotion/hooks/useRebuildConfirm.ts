'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { logWarn as _ulogWarn } from '@/lib/logging/core'

type RebuildActionType = 'storyToScript' | 'scriptToStoryboard' | 'switchEpisodeProductionMode'

interface RebuildConfirmContext {
  actionType: RebuildActionType
  storyboardCount: number
  panelCount: number
  shotGroupCount: number
  videoArtifactCount: number
}

interface DownstreamCheckResult {
  shouldConfirm: boolean
  storyboardCount: number
  panelCount: number
  shotGroupCount: number
  videoArtifactCount: number
}

type StoryboardStats = {
  storyboardCount: number
  panelCount: number
  shotGroupCount: number
  videoArtifactCount: number
}

export function hasDownstreamStoryboardData(stats: StoryboardStats): boolean {
  return (
    stats.storyboardCount > 0 ||
    stats.panelCount > 0 ||
    stats.shotGroupCount > 0 ||
    stats.videoArtifactCount > 0
  )
}

interface StoryboardLike {
  panels?: unknown[] | null
}

interface ShotGroupLike {
  compositeImageUrl?: string | null
  videoUrl?: string | null
}

interface UseRebuildConfirmParams {
  episodeId?: string
  episodeStoryboards?: StoryboardLike[]
  episodeShotGroups?: ShotGroupLike[]
  getProjectStoryboardStats: (episodeId: string) => Promise<StoryboardStats>
  t: (key: string, values?: Record<string, string | number | Date>) => string
}

export function useRebuildConfirm({
  episodeId,
  episodeStoryboards,
  episodeShotGroups,
  getProjectStoryboardStats,
  t,
}: UseRebuildConfirmParams) {
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)
  const [rebuildConfirmContext, setRebuildConfirmContext] = useState<RebuildConfirmContext | null>(null)
  const [pendingActionType, setPendingActionType] = useState<RebuildActionType | null>(null)
  const pendingRebuildActionRef = useRef<(() => Promise<void>) | null>(null)

  const getFallbackStoryboardStats = useCallback(() => {
    const storyboards = Array.isArray(episodeStoryboards) ? episodeStoryboards : []
    const shotGroups = Array.isArray(episodeShotGroups) ? episodeShotGroups : []
    const storyboardCount = storyboards.length
    const panelCount = storyboards.reduce((sum: number, storyboard) => {
      const panels = Array.isArray(storyboard?.panels) ? storyboard.panels.length : 0
      return sum + panels
    }, 0)
    const shotGroupCount = shotGroups.length
    const videoArtifactCount =
      storyboards.reduce((sum: number, storyboard) => {
        const panels = Array.isArray(storyboard?.panels) ? storyboard.panels : []
        return sum + panels.filter((panel) => {
          const videoUrl = (panel as { videoUrl?: string | null })?.videoUrl
          return typeof videoUrl === 'string' && videoUrl.trim().length > 0
        }).length
      }, 0) +
      shotGroups.reduce((sum: number, shotGroup) => {
        const hasComposite = typeof shotGroup?.compositeImageUrl === 'string' && shotGroup.compositeImageUrl.trim().length > 0
        const hasVideo = typeof shotGroup?.videoUrl === 'string' && shotGroup.videoUrl.trim().length > 0
        return sum + Number(hasComposite) + Number(hasVideo)
      }, 0)
    return { storyboardCount, panelCount, shotGroupCount, videoArtifactCount }
  }, [episodeShotGroups, episodeStoryboards])

  const checkStoryboardDownstreamData = useCallback(async (): Promise<DownstreamCheckResult> => {
    if (!episodeId) {
      return { shouldConfirm: false, storyboardCount: 0, panelCount: 0, shotGroupCount: 0, videoArtifactCount: 0 }
    }

    try {
      const { storyboardCount, panelCount, shotGroupCount, videoArtifactCount } = await getProjectStoryboardStats(episodeId)
      return {
        shouldConfirm: hasDownstreamStoryboardData({ storyboardCount, panelCount, shotGroupCount, videoArtifactCount }),
        storyboardCount,
        panelCount,
        shotGroupCount,
        videoArtifactCount,
      }
    } catch (error) {
      _ulogWarn('[RebuildConfirm] Failed to check downstream storyboards, fallback to local cache', error)
      const fallbackStats = getFallbackStoryboardStats()
      return {
        shouldConfirm: hasDownstreamStoryboardData(fallbackStats),
        storyboardCount: fallbackStats.storyboardCount,
        panelCount: fallbackStats.panelCount,
        shotGroupCount: fallbackStats.shotGroupCount,
        videoArtifactCount: fallbackStats.videoArtifactCount,
      }
    }
  }, [episodeId, getFallbackStoryboardStats, getProjectStoryboardStats])

  const runWithRebuildConfirm = useCallback(async (
    actionType: RebuildActionType,
    action: () => Promise<void>
  ) => {
    if (pendingActionType === actionType) return

    setPendingActionType(actionType)
    try {
      const downstream = await checkStoryboardDownstreamData()
      if (!downstream.shouldConfirm) {
        try {
          await action()
        } finally {
          setPendingActionType((current) => (current === actionType ? null : current))
        }
        return
      }

      pendingRebuildActionRef.current = async () => {
        try {
          await action()
        } finally {
          setPendingActionType((current) => (current === actionType ? null : current))
        }
      }
      setRebuildConfirmContext({
        actionType,
        storyboardCount: downstream.storyboardCount,
        panelCount: downstream.panelCount,
        shotGroupCount: downstream.shotGroupCount,
        videoArtifactCount: downstream.videoArtifactCount,
      })
      setShowRebuildConfirm(true)
    } catch (error) {
      setPendingActionType((current) => (current === actionType ? null : current))
      throw error
    }
  }, [checkStoryboardDownstreamData, pendingActionType])

  const handleCancelRebuildConfirm = useCallback(() => {
    const currentActionType = rebuildConfirmContext?.actionType ?? pendingActionType
    pendingRebuildActionRef.current = null
    setShowRebuildConfirm(false)
    setRebuildConfirmContext(null)
    if (currentActionType) {
      setPendingActionType((current) => (current === currentActionType ? null : current))
    }
  }, [pendingActionType, rebuildConfirmContext])

  const handleAcceptRebuildConfirm = useCallback(() => {
    const pendingAction = pendingRebuildActionRef.current
    pendingRebuildActionRef.current = null
    setShowRebuildConfirm(false)
    setRebuildConfirmContext(null)
    if (pendingAction) {
      void pendingAction()
      return
    }
    setPendingActionType(null)
  }, [])

  const rebuildConfirmTitle = useMemo(() => {
    if (!rebuildConfirmContext) return ''
    if (rebuildConfirmContext.actionType === 'storyToScript') {
      return t('rebuildConfirm.storyToScript.title')
    }
    if (rebuildConfirmContext.actionType === 'switchEpisodeProductionMode') {
      return t('rebuildConfirm.switchEpisodeProductionMode.title')
    }
    return t('rebuildConfirm.scriptToStoryboard.title')
  }, [rebuildConfirmContext, t])

  const rebuildConfirmMessage = useMemo(() => {
    if (!rebuildConfirmContext) return ''
    const values = {
      storyboardCount: rebuildConfirmContext.storyboardCount,
      panelCount: rebuildConfirmContext.panelCount,
      shotGroupCount: rebuildConfirmContext.shotGroupCount,
      videoArtifactCount: rebuildConfirmContext.videoArtifactCount,
    }
    if (rebuildConfirmContext.actionType === 'storyToScript') {
      return t('rebuildConfirm.storyToScript.message', values)
    }
    if (rebuildConfirmContext.actionType === 'switchEpisodeProductionMode') {
      return t('rebuildConfirm.switchEpisodeProductionMode.message', values)
    }
    return t('rebuildConfirm.scriptToStoryboard.message', values)
  }, [rebuildConfirmContext, t])

  return {
    showRebuildConfirm,
    rebuildConfirmTitle,
    rebuildConfirmMessage,
    pendingActionType,
    runWithRebuildConfirm,
    handleCancelRebuildConfirm,
    handleAcceptRebuildConfirm,
  }
}
