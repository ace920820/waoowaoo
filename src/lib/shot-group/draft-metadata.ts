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
  placeholderReason: 'missing_clip_content' | null
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
  return value === 'missing_clip_content' ? value : null
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

    return {
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
    }
  } catch {
    return null
  }
}

export function mergeShotGroupDraftMetadata(
  value: string | null | undefined,
  draftMetadata: ShotGroupDraftMetadata,
): string {
  let base: Record<string, unknown> = {}

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
    draftMetadata,
  })
}
