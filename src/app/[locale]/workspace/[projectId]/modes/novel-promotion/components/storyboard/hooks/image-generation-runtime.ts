import type { MediaRef, NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'

export interface StoryboardImageMutationResult {
  async?: boolean
  imageUrl?: string
}

export type PanelImageStatus = 'manual' | 'restored' | null

interface PanelImageUpdate {
  id: string
  imageUrl: string | null
  media?: MediaRef | null
  previousImageUrl?: string | null
  previousImageMedia?: MediaRef | null
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.message === 'Failed to fetch'
}

export function getStoryboardPanels(storyboard: NovelPromotionStoryboard): NovelPromotionPanel[] {
  return Array.isArray(storyboard.panels) ? storyboard.panels : []
}

export function updatePanelImageUrlInStoryboards(
  storyboards: NovelPromotionStoryboard[],
  storyboardId: string,
  panelIndex: number,
  imageUrl: string,
): NovelPromotionStoryboard[] {
  return storyboards.map((storyboard) => {
    if (storyboard.id !== storyboardId) return storyboard
    const panels = getStoryboardPanels(storyboard)
    const updatedPanels = panels.map((panel, index) =>
      index === panelIndex ? { ...panel, imageUrl } : panel,
    )
    return { ...storyboard, panels: updatedPanels }
  })
}

export function updatePanelImageFieldsInStoryboards(
  storyboards: NovelPromotionStoryboard[],
  update: PanelImageUpdate,
): NovelPromotionStoryboard[] {
  return storyboards.map((storyboard) => {
    const panels = getStoryboardPanels(storyboard)
    let changed = false
    const updatedPanels = panels.map((panel) => {
      if (panel.id !== update.id) return panel
      changed = true
      return {
        ...panel,
        imageUrl: update.imageUrl,
        media: update.media ?? panel.media,
        previousImageUrl: update.previousImageUrl ?? null,
        previousImageMedia: update.previousImageMedia ?? null,
        candidateImages: null,
      }
    })
    return changed ? { ...storyboard, panels: updatedPanels } : storyboard
  })
}

function createPanelMap(storyboards: NovelPromotionStoryboard[]): Map<string, NovelPromotionPanel> {
  const panelMap = new Map<string, NovelPromotionPanel>()
  for (const storyboard of storyboards) {
    const panels = getStoryboardPanels(storyboard)
    for (const panel of panels) {
      panelMap.set(panel.id, panel)
    }
  }
  return panelMap
}

export function reconcileSubmittingPanelImageIds(
  previousIds: Set<string>,
  storyboards: NovelPromotionStoryboard[],
): Set<string> {
  const panelMap = createPanelMap(storyboards)
  let changed = false
  const next = new Set(previousIds)

  for (const panelId of previousIds) {
    const panel = panelMap.get(panelId)
    if (!panel) {
      next.delete(panelId)
      changed = true
      continue
    }

    const isTaskRunning = Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning)
    const hasError = Boolean((panel as { imageErrorMessage?: string | null }).imageErrorMessage)
    if (isTaskRunning || hasError) {
      next.delete(panelId)
      changed = true
    }
  }

  return changed ? next : previousIds
}

export function reconcileModifyingPanelIds(
  previousIds: Set<string>,
  storyboards: NovelPromotionStoryboard[],
): Set<string> {
  const panelMap = createPanelMap(storyboards)
  let changed = false
  const next = new Set(previousIds)

  for (const panelId of previousIds) {
    const panel = panelMap.get(panelId)
    if (!panel) {
      next.delete(panelId)
      changed = true
      continue
    }

    const isTaskRunning = Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning)
    const taskIntent = (panel as NovelPromotionPanel & { imageTaskIntent?: string }).imageTaskIntent
    const hasError = Boolean((panel as { imageErrorMessage?: string | null }).imageErrorMessage)
    if ((isTaskRunning && taskIntent === 'modify') || hasError) {
      next.delete(panelId)
      changed = true
    }
  }

  return changed ? next : previousIds
}
