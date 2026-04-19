export interface ShotGroupDraftMetadata {
  segmentOrder: number
  clipId: string
  segmentKey: string
  sourceClipId: string
  segmentIndexWithinClip: number
  segmentStartSeconds: number
  segmentEndSeconds: number
  sceneLabel: string
  narrativePrompt: string | null
  embeddedDialogue: string | null
  shotRhythmGuidance: string | null
  expectedShotCount: number
  sourceStatus: 'ready' | 'placeholder'
  placeholderReason: 'missing_clip_content' | 'generation_failed' | null
  selectedLocationAsset?: ShotGroupAssetBindingReference | null
  preselectedLocationAsset?: ShotGroupAssetBindingReference | null
  scriptDerivedLocationAsset?: ShotGroupAssetBindingReference | null
  effectiveLocationAsset?: ShotGroupAssetBindingReference | null
  selectedCharacterAssets?: ShotGroupAssetBindingReference[]
  preselectedCharacterAssets?: ShotGroupAssetBindingReference[]
  scriptDerivedCharacterAssets?: ShotGroupAssetBindingReference[]
  effectiveCharacterAssets?: ShotGroupAssetBindingReference[]
  selectedPropAssets?: ShotGroupAssetBindingReference[]
  preselectedPropAssets?: ShotGroupAssetBindingReference[]
  scriptDerivedPropAssets?: ShotGroupAssetBindingReference[]
  effectivePropAssets?: ShotGroupAssetBindingReference[]
  missingAssetWarnings?: ShotGroupAssetBindingWarning[]
  referencePromptText?: string | null
  compositePromptText?: string | null
  storyboardModeId?: string | null
  storyboardModeLabel?: string | null
  storyboardModePromptText?: string | null
  submittedReferencePrompt?: string | null
  submittedCompositePrompt?: string | null
  storyboardMoodPresetId?: string | null
  customMood?: string | null
}

export type ShotGroupAssetBindingType = 'location' | 'character' | 'prop'
export type ShotGroupAssetBindingSource = 'manual' | 'preselected' | 'scriptDerived'

export interface ShotGroupAssetBindingReference {
  assetType: ShotGroupAssetBindingType
  source: ShotGroupAssetBindingSource
  assetId: string | null
  label: string
  imageId?: string | null
  imageUrl?: string | null
}

export interface ShotGroupAssetBindingWarning {
  assetType: ShotGroupAssetBindingType
  code: 'missing_asset_binding'
  message: string
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
}

function readSourceStatus(value: unknown): ShotGroupDraftMetadata['sourceStatus'] | null {
  return value === 'ready' || value === 'placeholder' ? value : null
}

function readPlaceholderReason(value: unknown): ShotGroupDraftMetadata['placeholderReason'] {
  return value === 'missing_clip_content' || value === 'generation_failed' ? value : null
}

function readAssetBindingType(value: unknown): ShotGroupAssetBindingType | null {
  return value === 'location' || value === 'character' || value === 'prop' ? value : null
}

function readAssetBindingSource(value: unknown): ShotGroupAssetBindingSource | null {
  return value === 'manual' || value === 'preselected' || value === 'scriptDerived' ? value : null
}

function readAssetBindingReference(
  value: unknown,
  assetType: ShotGroupAssetBindingType,
): ShotGroupAssetBindingReference | null {
  const record = asObject(value)
  if (!record) return null

  const source = readAssetBindingSource(record.source)
  const label = readString(record.label)
  const normalizedType = readAssetBindingType(record.assetType) || assetType

  if (!source || !label || normalizedType !== assetType) {
    return null
  }

  return {
    assetType,
    source,
    assetId: readString(record.assetId),
    label,
    imageId: readString(record.imageId),
    imageUrl: readString(record.imageUrl),
  }
}

function readAssetBindingReferences(
  value: unknown,
  assetType: ShotGroupAssetBindingType,
): ShotGroupAssetBindingReference[] {
  return Array.isArray(value)
    ? value
      .map((item) => readAssetBindingReference(item, assetType))
      .filter((item): item is ShotGroupAssetBindingReference => Boolean(item))
    : []
}

function buildMissingAssetWarning(assetType: ShotGroupAssetBindingType): ShotGroupAssetBindingWarning {
  return {
    assetType,
    code: 'missing_asset_binding',
    message: `${resolveAssetTypeLabel(assetType)}素材缺失，当前片段将继续使用剧本文本回退生成`,
  }
}

function resolveAssetTypeLabel(assetType: ShotGroupAssetBindingType): string {
  switch (assetType) {
    case 'location':
      return '场景'
    case 'character':
      return '角色'
    case 'prop':
      return '物品'
  }
}

function resolveSingleEffectiveAsset(
  selected: ShotGroupAssetBindingReference | null,
  preselected: ShotGroupAssetBindingReference | null,
  scriptDerived: ShotGroupAssetBindingReference | null,
): ShotGroupAssetBindingReference | null {
  return selected || preselected || scriptDerived || null
}

function resolveMultiEffectiveAssets(
  selected: ShotGroupAssetBindingReference[],
  preselected: ShotGroupAssetBindingReference[],
  scriptDerived: ShotGroupAssetBindingReference[],
): ShotGroupAssetBindingReference[] {
  if (selected.length > 0) return selected
  if (preselected.length > 0) return preselected
  return scriptDerived
}

function deriveWarning(
  assetType: ShotGroupAssetBindingType,
  hasResolvedAsset: boolean,
  isScriptFallback: boolean,
): ShotGroupAssetBindingWarning | null {
  if (hasResolvedAsset && !isScriptFallback) {
    return null
  }
  return buildMissingAssetWarning(assetType)
}

function readMissingWarnings(value: unknown): ShotGroupAssetBindingWarning[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const record = asObject(item)
    const assetType = readAssetBindingType(record?.assetType)
    if (!assetType) return []
    return [{
      assetType,
      code: 'missing_asset_binding',
      message: readString(record?.message) || buildMissingAssetWarning(assetType).message,
    }]
  })
}

function buildDefaultScriptDerivedLocationAsset(
  sceneLabel: string,
  previous: ShotGroupDraftMetadata | null,
): ShotGroupAssetBindingReference | null {
  if (previous?.scriptDerivedLocationAsset) {
    return previous.scriptDerivedLocationAsset
  }

  return sceneLabel
    ? {
      assetType: 'location',
      source: 'scriptDerived',
      assetId: null,
      label: sceneLabel,
    }
    : null
}

export function normalizeShotGroupDraftMetadata(
  metadata: ShotGroupDraftMetadata,
  previousMetadata?: ShotGroupDraftMetadata | null,
): ShotGroupDraftMetadata {
  const previous = previousMetadata || null
  const selectedLocationAsset = readAssetBindingReference(
    metadata.selectedLocationAsset ?? previous?.selectedLocationAsset,
    'location',
  )
  const preselectedLocationAsset = readAssetBindingReference(
    metadata.preselectedLocationAsset ?? previous?.preselectedLocationAsset,
    'location',
  )
  const scriptDerivedLocationAsset = readAssetBindingReference(
    metadata.scriptDerivedLocationAsset ?? buildDefaultScriptDerivedLocationAsset(metadata.sceneLabel, previous),
    'location',
  )
  const effectiveLocationAsset = resolveSingleEffectiveAsset(
    selectedLocationAsset,
    preselectedLocationAsset,
    scriptDerivedLocationAsset,
  )

  const selectedCharacterAssets = readAssetBindingReferences(
    metadata.selectedCharacterAssets ?? previous?.selectedCharacterAssets,
    'character',
  )
  const preselectedCharacterAssets = readAssetBindingReferences(
    metadata.preselectedCharacterAssets ?? previous?.preselectedCharacterAssets,
    'character',
  )
  const scriptDerivedCharacterAssets = readAssetBindingReferences(
    metadata.scriptDerivedCharacterAssets ?? previous?.scriptDerivedCharacterAssets,
    'character',
  )
  const effectiveCharacterAssets = resolveMultiEffectiveAssets(
    selectedCharacterAssets,
    preselectedCharacterAssets,
    scriptDerivedCharacterAssets,
  )

  const selectedPropAssets = readAssetBindingReferences(
    metadata.selectedPropAssets ?? previous?.selectedPropAssets,
    'prop',
  )
  const preselectedPropAssets = readAssetBindingReferences(
    metadata.preselectedPropAssets ?? previous?.preselectedPropAssets,
    'prop',
  )
  const scriptDerivedPropAssets = readAssetBindingReferences(
    metadata.scriptDerivedPropAssets ?? previous?.scriptDerivedPropAssets,
    'prop',
  )
  const effectivePropAssets = resolveMultiEffectiveAssets(
    selectedPropAssets,
    preselectedPropAssets,
    scriptDerivedPropAssets,
  )

  const warningMap = new Map<ShotGroupAssetBindingType, ShotGroupAssetBindingWarning>()
  for (const warning of readMissingWarnings(metadata.missingAssetWarnings ?? previous?.missingAssetWarnings)) {
    warningMap.set(warning.assetType, warning)
  }

  const derivedWarnings = [
    deriveWarning(
      'location',
      Boolean(effectiveLocationAsset?.assetId),
      Boolean(effectiveLocationAsset && effectiveLocationAsset.source === 'scriptDerived'),
    ),
    deriveWarning(
      'character',
      effectiveCharacterAssets.some((asset) => Boolean(asset.assetId)),
      effectiveCharacterAssets.length > 0 && effectiveCharacterAssets.every((asset) => asset.source === 'scriptDerived'),
    ),
    deriveWarning(
      'prop',
      effectivePropAssets.some((asset) => Boolean(asset.assetId)),
      effectivePropAssets.length > 0 && effectivePropAssets.every((asset) => asset.source === 'scriptDerived'),
    ),
  ].filter((warning): warning is ShotGroupAssetBindingWarning => Boolean(warning))

  for (const warning of derivedWarnings) {
    warningMap.set(warning.assetType, warning)
  }

  for (const assetType of ['location', 'character', 'prop'] as const) {
    const hasResolvedAsset = assetType === 'location'
      ? Boolean(effectiveLocationAsset?.assetId)
      : assetType === 'character'
        ? effectiveCharacterAssets.some((asset) => Boolean(asset.assetId))
        : effectivePropAssets.some((asset) => Boolean(asset.assetId))
    const isScriptFallback = assetType === 'location'
      ? Boolean(effectiveLocationAsset && effectiveLocationAsset.source === 'scriptDerived')
      : assetType === 'character'
        ? effectiveCharacterAssets.length > 0 && effectiveCharacterAssets.every((asset) => asset.source === 'scriptDerived')
        : effectivePropAssets.length > 0 && effectivePropAssets.every((asset) => asset.source === 'scriptDerived')

    if (hasResolvedAsset && !isScriptFallback) {
      warningMap.delete(assetType)
    }
  }

  return {
    ...metadata,
    selectedLocationAsset,
    preselectedLocationAsset,
    scriptDerivedLocationAsset,
    effectiveLocationAsset,
    selectedCharacterAssets,
    preselectedCharacterAssets,
    scriptDerivedCharacterAssets,
    effectiveCharacterAssets,
    selectedPropAssets,
    preselectedPropAssets,
    scriptDerivedPropAssets,
    effectivePropAssets,
    missingAssetWarnings: Array.from(warningMap.values()),
    referencePromptText: readString(metadata.referencePromptText) ?? previous?.referencePromptText ?? null,
    compositePromptText: readString(metadata.compositePromptText) ?? previous?.compositePromptText ?? null,
    storyboardModeId: readString(metadata.storyboardModeId) ?? previous?.storyboardModeId ?? null,
    storyboardModeLabel: readString(metadata.storyboardModeLabel) ?? previous?.storyboardModeLabel ?? null,
    storyboardModePromptText: readString(metadata.storyboardModePromptText) ?? previous?.storyboardModePromptText ?? null,
    submittedReferencePrompt: readString(metadata.submittedReferencePrompt) ?? previous?.submittedReferencePrompt ?? null,
    submittedCompositePrompt: readString(metadata.submittedCompositePrompt) ?? previous?.submittedCompositePrompt ?? null,
    storyboardMoodPresetId: readString(metadata.storyboardMoodPresetId) ?? previous?.storyboardMoodPresetId ?? null,
    customMood: readString(metadata.customMood) ?? previous?.customMood ?? null,
  }
}

export function parseShotGroupDraftMetadata(value: string | null | undefined): ShotGroupDraftMetadata | null {
  if (!value?.trim()) return null

  try {
    const parsed = JSON.parse(value)
    const record = asObject(parsed)
    const metadata = asObject(record?.draftMetadata)
    if (!metadata) return null

    const segmentOrder = readNumber(metadata.segmentOrder)
    const clipId = readString(metadata.clipId)
    const sceneLabel = readString(metadata.sceneLabel)
    const expectedShotCount = readNumber(metadata.expectedShotCount)
    const sourceStatus = readSourceStatus(metadata.sourceStatus)

    if (
      !segmentOrder ||
      !clipId ||
      !sceneLabel ||
      !expectedShotCount ||
      !sourceStatus
    ) {
      return null
    }

    const sourceClipId = readString(metadata.sourceClipId) || clipId
    const segmentIndexWithinClip = readNumber(metadata.segmentIndexWithinClip) || segmentOrder
    const segmentStartSeconds = readNumber(metadata.segmentStartSeconds) ?? ((segmentIndexWithinClip - 1) * 15)
    const segmentEndSeconds = readNumber(metadata.segmentEndSeconds) ?? (segmentStartSeconds + 15)
    const segmentKey = readString(metadata.segmentKey) || `${sourceClipId}:${segmentIndexWithinClip}`

    return normalizeShotGroupDraftMetadata({
      segmentOrder,
      clipId,
      segmentKey,
      sourceClipId,
      segmentIndexWithinClip,
      segmentStartSeconds,
      segmentEndSeconds,
      sceneLabel,
      narrativePrompt: readString(metadata.narrativePrompt),
      embeddedDialogue: readString(metadata.embeddedDialogue),
      shotRhythmGuidance: readString(metadata.shotRhythmGuidance),
      expectedShotCount,
      sourceStatus,
      placeholderReason: readPlaceholderReason(metadata.placeholderReason),
      selectedLocationAsset: readAssetBindingReference(metadata.selectedLocationAsset, 'location'),
      preselectedLocationAsset: readAssetBindingReference(metadata.preselectedLocationAsset, 'location'),
      scriptDerivedLocationAsset: readAssetBindingReference(metadata.scriptDerivedLocationAsset, 'location'),
      effectiveLocationAsset: readAssetBindingReference(metadata.effectiveLocationAsset, 'location'),
      selectedCharacterAssets: readAssetBindingReferences(metadata.selectedCharacterAssets, 'character'),
      preselectedCharacterAssets: readAssetBindingReferences(metadata.preselectedCharacterAssets, 'character'),
      scriptDerivedCharacterAssets: readAssetBindingReferences(metadata.scriptDerivedCharacterAssets, 'character'),
      effectiveCharacterAssets: readAssetBindingReferences(metadata.effectiveCharacterAssets, 'character'),
      selectedPropAssets: readAssetBindingReferences(metadata.selectedPropAssets, 'prop'),
      preselectedPropAssets: readAssetBindingReferences(metadata.preselectedPropAssets, 'prop'),
      scriptDerivedPropAssets: readAssetBindingReferences(metadata.scriptDerivedPropAssets, 'prop'),
      effectivePropAssets: readAssetBindingReferences(metadata.effectivePropAssets, 'prop'),
      missingAssetWarnings: readMissingWarnings(metadata.missingAssetWarnings),
      referencePromptText: readString(metadata.referencePromptText),
      compositePromptText: readString(metadata.compositePromptText),
      storyboardModeId: readString(metadata.storyboardModeId),
      storyboardModeLabel: readString(metadata.storyboardModeLabel),
      storyboardModePromptText: readString(metadata.storyboardModePromptText),
      submittedReferencePrompt: readString(metadata.submittedReferencePrompt),
      submittedCompositePrompt: readString(metadata.submittedCompositePrompt),
      storyboardMoodPresetId: readString(metadata.storyboardMoodPresetId),
      customMood: readString(metadata.customMood),
    })
  } catch {
    return null
  }
}

export function mergeShotGroupDraftMetadata(
  value: string | null | undefined,
  draftMetadata: ShotGroupDraftMetadata,
  previousDraftMetadata?: ShotGroupDraftMetadata | null,
): string {
  let base: Record<string, unknown> = {}
  const fallbackDraftMetadata = previousDraftMetadata ?? parseShotGroupDraftMetadata(value)

  if (value?.trim()) {
    try {
      const parsed = JSON.parse(value)
      const record = asObject(parsed)
      if (record) {
        base = record
      }
    } catch {
      base = {}
    }
  }

  return JSON.stringify({
    ...base,
    draftMetadata: normalizeShotGroupDraftMetadata(draftMetadata, fallbackDraftMetadata),
  })
}
