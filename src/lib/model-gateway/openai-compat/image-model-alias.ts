export type OpenAICompatImageQualityAlias = 'high' | 'medium' | 'low' | 'auto'

const GPT_IMAGE_2_ALIAS_PATTERN = /^gpt-image-2-(high|medium|low|auto)$/

export function parseGptImage2QualityAlias(modelId: string | undefined): OpenAICompatImageQualityAlias | null {
  const normalized = (modelId || '').trim()
  const match = normalized.match(GPT_IMAGE_2_ALIAS_PATTERN)
  return match ? (match[1] as OpenAICompatImageQualityAlias) : null
}

export function resolveOpenAICompatImageModelAlias(modelId: string | undefined): {
  modelId: string | undefined
  quality: OpenAICompatImageQualityAlias | null
} {
  const quality = parseGptImage2QualityAlias(modelId)
  if (!quality) {
    return { modelId, quality: null }
  }
  return { modelId: 'gpt-image-2', quality }
}

export function getGptImage2AliasDisplayName(modelId: string): string | null {
  const quality = parseGptImage2QualityAlias(modelId)
  if (!quality) return null
  return `GPT Image 2 (${quality})`
}
