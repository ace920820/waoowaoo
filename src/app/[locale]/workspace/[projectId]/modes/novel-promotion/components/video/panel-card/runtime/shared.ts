export const EMPTY_RUNNING_VOICE_LINE_IDS: Set<string> = new Set()

interface ResolveVisibleBaseVideoUrlParams {
  videoUrl?: string | null
  videoGenerationMode?: 'normal' | 'firstlastframe' | null
  isLinked: boolean
  isLastFrame: boolean
}

export function resolveVisibleBaseVideoUrl({
  videoUrl,
  videoGenerationMode,
  isLinked,
  isLastFrame,
}: ResolveVisibleBaseVideoUrlParams): string | undefined {
  if (!videoUrl) return undefined
  if (!isLinked || isLastFrame) return videoUrl
  return videoGenerationMode === 'firstlastframe' ? videoUrl : undefined
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown error'
}
