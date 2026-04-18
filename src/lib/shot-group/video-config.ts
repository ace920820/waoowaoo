import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'

export type ShotGroupVideoMode = 'omni-reference' | 'smart-multi-frame'
export type ShotGroupVideoGenerationOptions = Record<string, CapabilityValue>

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
