'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { MediaRef, NovelPromotionStoryboard } from '@/types/project'
import { extractErrorMessage } from '@/lib/errors/extract'
import {
  getStoryboardPanels,
  type PanelImageStatus,
  updatePanelImageFieldsInStoryboards,
} from './image-generation-runtime'

interface PanelImageMutationResult {
  panel?: {
    id: string
    storyboardId?: string
    panelIndex?: number
    imageUrl: string | null
    media?: MediaRef | null
    previousImageUrl?: string | null
    previousImageMedia?: MediaRef | null
  }
}

interface UploadPanelImageMutationLike {
  mutateAsync: (payload: { panelId: string; file: File }) => Promise<PanelImageMutationResult>
}

interface RestorePanelImageMutationLike {
  mutateAsync: (payload: { panelId: string }) => Promise<PanelImageMutationResult>
}

interface UsePanelImageManagementParams {
  localStoryboards: NovelPromotionStoryboard[]
  setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
  setModifyingPanels: React.Dispatch<React.SetStateAction<Set<string>>>
  uploadPanelImageMutation: UploadPanelImageMutationLike
  restorePanelImageMutation: RestorePanelImageMutationLike
  onSilentRefresh?: (() => void | Promise<void>) | null
  refreshEpisode: () => void
  refreshStoryboards: () => void
}

function triggerBrowserDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function usePanelImageManagement({
  localStoryboards,
  setLocalStoryboards,
  setModifyingPanels,
  uploadPanelImageMutation,
  restorePanelImageMutation,
  onSilentRefresh,
  refreshEpisode,
  refreshStoryboards,
}: UsePanelImageManagementParams) {
  const t = useTranslations('storyboard')
  const [panelImageStatusById, setPanelImageStatusById] = useState<Record<string, PanelImageStatus>>({})

  const panelNumberById = useMemo(() => {
    const next = new Map<string, number>()
    for (const storyboard of localStoryboards) {
      for (const panel of getStoryboardPanels(storyboard)) {
        next.set(panel.id, panel.panelNumber ?? panel.panelIndex + 1)
      }
    }
    return next
  }, [localStoryboards])

  const downloadPanelImage = useCallback((panelId: string, imageUrl: string | null) => {
    if (!imageUrl) return
    const panelNumber = panelNumberById.get(panelId)
    const filename = panelNumber
      ? `storyboard-panel-${panelNumber}.png`
      : `storyboard-panel-${panelId}.png`
    triggerBrowserDownload(imageUrl, filename)
  }, [panelNumberById])

  const replacePanelImage = useCallback(async (panelId: string, file: File) => {
    setModifyingPanels((previous) => new Set(previous).add(panelId))
    try {
      const result = await uploadPanelImageMutation.mutateAsync({ panelId, file })
      const updatedPanel = result.panel
      if (updatedPanel) {
        setLocalStoryboards((previous) => updatePanelImageFieldsInStoryboards(previous, updatedPanel))
        setPanelImageStatusById((previous) => ({ ...previous, [panelId]: 'manual' }))
      }
      if (onSilentRefresh) await onSilentRefresh()
      refreshEpisode()
      refreshStoryboards()
    } catch (error: unknown) {
      alert(t('messages.replaceImageFailed', {
        error: extractErrorMessage(error, t('common.unknownError')),
      }))
    } finally {
      setModifyingPanels((previous) => {
        const next = new Set(previous)
        next.delete(panelId)
        return next
      })
    }
  }, [onSilentRefresh, refreshEpisode, refreshStoryboards, setLocalStoryboards, setModifyingPanels, t, uploadPanelImageMutation])

  const restorePanelImage = useCallback(async (panelId: string) => {
    setModifyingPanels((previous) => new Set(previous).add(panelId))
    try {
      const result = await restorePanelImageMutation.mutateAsync({ panelId })
      const updatedPanel = result.panel
      if (updatedPanel) {
        setLocalStoryboards((previous) => updatePanelImageFieldsInStoryboards(previous, updatedPanel))
        setPanelImageStatusById((previous) => ({ ...previous, [panelId]: 'restored' }))
      }
      if (onSilentRefresh) await onSilentRefresh()
      refreshEpisode()
      refreshStoryboards()
    } catch (error: unknown) {
      alert(t('messages.restoreImageFailed', {
        error: extractErrorMessage(error, t('common.unknownError')),
      }))
    } finally {
      setModifyingPanels((previous) => {
        const next = new Set(previous)
        next.delete(panelId)
        return next
      })
    }
  }, [onSilentRefresh, refreshEpisode, refreshStoryboards, restorePanelImageMutation, setLocalStoryboards, setModifyingPanels, t])

  const getPanelImageStatus = useCallback((panelId: string) => panelImageStatusById[panelId] ?? null, [panelImageStatusById])

  return {
    downloadPanelImage,
    replacePanelImage,
    restorePanelImage,
    getPanelImageStatus,
  }
}
