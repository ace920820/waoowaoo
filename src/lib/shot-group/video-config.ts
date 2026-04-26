import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import { parseModelKeyStrict } from '@/lib/model-config-contract'

export type ShotGroupVideoMode = 'omni-reference' | 'smart-multi-frame'
export type ShotGroupVideoGenerationOptions = Record<string, CapabilityValue>
export type ShotGroupReferenceMode = 'ark_content_multireference' | 'ark_content_multireference_smart' | 'composite_image_mvp'

export type ShotGroupVideoReferenceSettings = {
  includeConceptImage: boolean
  includeCharacterImages: boolean
  selectedCharacterAssetIds: string[]
  includeLocationImage: boolean
  includePropImages: boolean
  includeShotImages: boolean
  includeCharacterAudio: boolean
  selectedAudioCharacterAssetIds: string[]
}

export const DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS: ShotGroupVideoReferenceSettings = {
  includeConceptImage: true,
  includeCharacterImages: true,
  selectedCharacterAssetIds: [],
  includeLocationImage: true,
  includePropImages: true,
  includeShotImages: false,
  includeCharacterAudio: false,
  selectedAudioCharacterAssetIds: [],
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
    : []
}

export function normalizeShotGroupVideoReferenceSettings(value: unknown): ShotGroupVideoReferenceSettings {
  const record = isRecord(value) ? value : {}
  return {
    includeConceptImage: typeof record.includeConceptImage === 'boolean'
      ? record.includeConceptImage
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includeConceptImage,
    includeCharacterImages: typeof record.includeCharacterImages === 'boolean'
      ? record.includeCharacterImages
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includeCharacterImages,
    selectedCharacterAssetIds: readStringArray(record.selectedCharacterAssetIds),
    includeLocationImage: typeof record.includeLocationImage === 'boolean'
      ? record.includeLocationImage
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includeLocationImage,
    includePropImages: typeof record.includePropImages === 'boolean'
      ? record.includePropImages
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includePropImages,
    includeShotImages: typeof record.includeShotImages === 'boolean'
      ? record.includeShotImages
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includeShotImages,
    includeCharacterAudio: typeof record.includeCharacterAudio === 'boolean'
      ? record.includeCharacterAudio
      : DEFAULT_SHOT_GROUP_VIDEO_REFERENCE_SETTINGS.includeCharacterAudio,
    selectedAudioCharacterAssetIds: readStringArray(record.selectedAudioCharacterAssetIds),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function normalizeShotGroupVideoMode(input: {
  mode?: unknown
  omniReferenceEnabled?: unknown
  smartMultiFrameEnabled?: unknown
}): ShotGroupVideoMode {
  if (input.mode === 'smart-multi-frame') return 'smart-multi-frame'
  if (input.mode === 'omni-reference') return 'omni-reference'
  if (input.smartMultiFrameEnabled === true && input.omniReferenceEnabled !== true) {
    return 'smart-multi-frame'
  }
  return 'omni-reference'
}

export function deriveShotGroupModeFlags(mode: ShotGroupVideoMode) {
  return {
    omniReferenceEnabled: mode === 'omni-reference',
    smartMultiFrameEnabled: mode === 'smart-multi-frame',
  }
}

export function supportsShotGroupMultiReferenceModes(modelKey: string | null | undefined) {
  return parseModelKeyStrict(modelKey || '')?.provider === 'ark'
}

export function resolveShotGroupModeForModel(input: {
  mode?: unknown
  omniReferenceEnabled?: unknown
  smartMultiFrameEnabled?: unknown
  modelKey?: string | null
}): ShotGroupVideoMode {
  const normalized = normalizeShotGroupVideoMode(input)
  if (!supportsShotGroupMultiReferenceModes(input.modelKey)) {
    return 'omni-reference'
  }
  return normalized
}

export function resolveShotGroupReferenceMode(input: {
  mode?: unknown
  omniReferenceEnabled?: unknown
  smartMultiFrameEnabled?: unknown
  modelKey?: string | null
}): ShotGroupReferenceMode {
  const mode = resolveShotGroupModeForModel(input)
  if (!supportsShotGroupMultiReferenceModes(input.modelKey)) {
    return 'composite_image_mvp'
  }
  return mode === 'smart-multi-frame'
    ? 'ark_content_multireference_smart'
    : 'ark_content_multireference'
}

export function sanitizeShotGroupGenerationOptions(
  value: unknown,
): ShotGroupVideoGenerationOptions {
  if (!isRecord(value)) return {}
  const next: ShotGroupVideoGenerationOptions = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'aspectRatio' || field === 'generationMode') continue
    if (!isCapabilityValue(raw)) continue
    next[field] = raw
  }
  return next
}

export function readShotGroupCapabilitySelection(
  capabilityOverrides: CapabilitySelections | undefined,
  modelKey: string,
): ShotGroupVideoGenerationOptions {
  if (!modelKey || !capabilityOverrides) return {}
  const rawSelection = capabilityOverrides[modelKey]
  if (!isRecord(rawSelection)) return {}
  return sanitizeShotGroupGenerationOptions(rawSelection)
}
