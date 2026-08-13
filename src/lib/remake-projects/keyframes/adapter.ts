import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { parseTimecodeSeconds } from '@/lib/remake-projects/unit/timecode'

export const REMAKE_KEYFRAME_SLOTS = ['start', 'middle', 'end'] as const
export type RemakeKeyframeSlot = typeof REMAKE_KEYFRAME_SLOTS[number]

export type RemakeKeyframeCandidate = {
  id: string
  ordinal: number
  outputVersionId?: string
  mediaId?: string | null
  mediaUrl?: string | null
  status?: string
  eligible: boolean
  invalidated?: boolean
}

export type RemakeKeyframeBatch = {
  id: string
  taskId?: string | null
  operationKey: string
  inputFingerprint?: string
  modelId?: string | null
  options?: Record<string, unknown>
  referenceMediaIds?: string[]
  requestedCandidateCount: number
  createdAt: string
  candidates: RemakeKeyframeCandidate[]
}

export type RemakeKeyframeSlotView = {
  id: string | null
  slot: RemakeKeyframeSlot
  selectedForGeneration: boolean
  eligible: boolean
  reason: string | null
  adoptedCandidateId: string | null
  adoptedCandidate: RemakeKeyframeCandidate | null
  batches: RemakeKeyframeBatch[]
}

export type RemakeShotView = {
  id: string
  stableId: string
  label: string
  sequence: number | null
  revision: number | null
  reviewStatus: string
  prompt: RemakeSnapshot['shots'][number]['promptTracks']
  original: Record<RemakeKeyframeSlot, { mediaId: string | null; mediaUrl: string | null }>
  slots: Record<RemakeKeyframeSlot, RemakeKeyframeSlotView>
  actionSheet: NonNullable<RemakeSnapshot['shots'][number]['keyframeGeneration']>['actionSheet']
  videoPromptStatus: 'approved' | 'missing' | 'needs_review'
  semantics: {
    shotType: string | null
    cameraMove: string | null
    description: string | null
    moodPresetId: string | null
    customMood: string | null
    sceneTag: string | null
    characterTags: string[]
    sceneAssetId: string | null
    characterAssetIds: string[]
    propAssetIds: string[]
  }
  imagePromptStatus: Record<'start' | 'middle' | 'end', 'approved' | 'missing' | 'needs_review'>
  imagePrompts: Record<'start' | 'middle' | 'end', { trackId: string | null; coreText: string | null; negativeConstraints: string[] }>
  videoPrompt: { trackId: string | null; coreText: string | null }
  durationSeconds: number
  videoGeneration: {
    track: {
      id: string | null
      adoptedVersionId: string | null
      hasInvalidated: boolean
      batches: Array<{
        id: string
        operationKey: string
        versions: Array<{
          id: string
          ordinal: number
          mediaUrl: string | null
          status: string
          invalidated: boolean
          note: string | null
        }>
      }>
    } | null
  }
}

/**
 * Resolve one side of a shot time range to seconds. Numeric values pass
 * through; string timecodes (`MM:SS.mmm` / `HH:MM:SS.mmm` / plain seconds)
 * are parsed with the shared client-safe parser. Returns null when the side
 * carries no parseable value (Pitfall 1: never fall back to 3 when parseable
 * timecodes exist).
 */
function timeRangeSideToSeconds(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return parseTimecodeSeconds(value)
  return null
}

function shotDurationSeconds(shot: RemakeSnapshot['shots'][number]): number {
  const start = timeRangeSideToSeconds(shot.timeRange?.start)
  const end = timeRangeSideToSeconds(shot.timeRange?.end)
  if (start === null || end === null) return 3
  return Math.max(0.1, end - start)
}

function asCandidate(candidate: Record<string, unknown>): RemakeKeyframeCandidate {
  const invalidated = Boolean(candidate.invalidated)
  return {
    id: String(candidate.id),
    ordinal: Number(candidate.ordinal ?? 0),
    outputVersionId: typeof candidate.outputVersionId === 'string' ? candidate.outputVersionId : undefined,
    mediaId: typeof candidate.mediaId === 'string' ? candidate.mediaId : null,
    mediaUrl: typeof candidate.mediaUrl === 'string' ? candidate.mediaUrl : null,
    status: typeof candidate.status === 'string' ? candidate.status : undefined,
    eligible: candidate.eligible !== false && !invalidated,
    invalidated,
  }
}

function asBatch(batch: Record<string, unknown>): RemakeKeyframeBatch {
  return {
    id: String(batch.id),
    taskId: typeof batch.taskId === 'string' ? batch.taskId : null,
    operationKey: String(batch.operationKey ?? batch.id),
    inputFingerprint: typeof batch.inputFingerprint === 'string' ? batch.inputFingerprint : undefined,
    modelId: typeof batch.modelId === 'string' ? batch.modelId : null,
    options: batch.options && typeof batch.options === 'object' ? batch.options as Record<string, unknown> : {},
    referenceMediaIds: Array.isArray(batch.referenceMediaIds) ? batch.referenceMediaIds.filter((value): value is string => typeof value === 'string') : [],
    requestedCandidateCount: Number(batch.requestedCandidateCount ?? 0),
    createdAt: String(batch.createdAt ?? ''),
    candidates: Array.isArray(batch.candidates) ? batch.candidates.map((candidate) => asCandidate(candidate as Record<string, unknown>)) : [],
  }
}

export function adaptRemakeShot(shot: RemakeSnapshot['shots'][number]): RemakeShotView {
  const generation = shot.keyframeGeneration
  const tracks = generation?.tracks ?? []
  const prompt = shot.promptTracks ?? []
  const slots = Object.fromEntries(REMAKE_KEYFRAME_SLOTS.map((slot) => {
    const track = tracks.find((candidate) => candidate.slot === slot)
    const batches = (track?.batches ?? []).map((batch) => asBatch(batch as unknown as Record<string, unknown>))
    const adopted = batches.flatMap((batch) => batch.candidates).find((candidate) => candidate.id === track?.adoptedCandidateId) ?? null
    const promptTrack = prompt.find((candidate) => candidate.targetKey === `image:${slot}`)
    const eligible = Boolean(shot.review?.promptEligible && promptTrack?.adoptedVersion && !promptTrack.needsReview && track?.eligible !== false)
    return [slot, {
      id: track?.id ?? null,
      slot,
      selectedForGeneration: Boolean(track?.selectedForGeneration),
      eligible,
      reason: !shot.review?.promptEligible ? shot.review?.reason ?? 'Shot 尚未通过审核' : !promptTrack?.adoptedVersion ? '图片 Prompt 尚未批准' : promptTrack.needsReview ? 'Prompt 已失效，需要复核' : track?.eligible === false ? '当前 revision 已失效' : null,
      adoptedCandidateId: track?.adoptedCandidateId ?? null,
      adoptedCandidate: adopted,
      batches,
    } satisfies RemakeKeyframeSlotView]
  })) as Record<RemakeKeyframeSlot, RemakeKeyframeSlotView>
  const videoTrack = prompt.find((candidate) => candidate.targetKey === 'video')
  const videoPromptStatus = videoTrack?.needsReview ? 'needs_review' : videoTrack?.adoptedVersion ? 'approved' : 'missing'
  return {
    id: shot.id,
    stableId: shot.stableKey,
    label: `镜头${String(shot.sequence ?? 1).padStart(2, '0')}`,
    sequence: shot.sequence,
    revision: shot.currentRevision ?? null,
    reviewStatus: shot.reviewStatus,
    prompt,
    original: {
      start: shot.keyframes?.start ?? { mediaId: null, mediaUrl: null },
      middle: shot.keyframes?.middle ?? { mediaId: null, mediaUrl: null },
      end: shot.keyframes?.end ?? { mediaId: null, mediaUrl: null },
    },
    slots,
    actionSheet: generation?.actionSheet ?? { status: 'waiting', id: null, mediaId: null, fingerprint: null },
    videoPromptStatus,
    semantics: shot.semantics ?? {
      shotType: null,
      cameraMove: null,
      description: null,
      moodPresetId: null,
      customMood: null,
      sceneTag: null,
      characterTags: [],
      sceneAssetId: null,
      characterAssetIds: [],
      propAssetIds: [],
    },
    imagePromptStatus: Object.fromEntries(REMAKE_KEYFRAME_SLOTS.map((slot) => {
      const track = prompt.find((candidate) => candidate.targetKey === `image:${slot}`)
      const status = track?.needsReview ? 'needs_review' : track?.adoptedVersion ? 'approved' : 'missing'
      return [slot, status]
    })) as Record<'start' | 'middle' | 'end', 'approved' | 'missing' | 'needs_review'>,
    imagePrompts: Object.fromEntries(REMAKE_KEYFRAME_SLOTS.map((slot) => {
      const track = prompt.find((candidate) => candidate.targetKey === `image:${slot}`)
      const adopted = track?.adoptedVersion as
        | { coreText?: string | null; negativeConstraints?: unknown }
        | null
        | undefined
      return [slot, {
        trackId: track?.id ?? null,
        coreText: adopted?.coreText ?? null,
        negativeConstraints: Array.isArray(adopted?.negativeConstraints)
          ? adopted.negativeConstraints.filter((item): item is string => typeof item === 'string')
          : [],
      }]
    })) as Record<'start' | 'middle' | 'end', { trackId: string | null; coreText: string | null; negativeConstraints: string[] }>,
    videoPrompt: {
      trackId: videoTrack?.id ?? null,
      coreText: (videoTrack?.adoptedVersion as { coreText?: string | null } | null | undefined)?.coreText ?? null,
    },
    durationSeconds: shotDurationSeconds(shot),
    videoGeneration: (() => {
      const vg = shot.videoGeneration as { track?: { id?: string; adoptedVersionId?: string; hasInvalidated?: boolean; batches?: unknown[] } } | undefined
      const track = vg?.track
      const batches = (track?.batches ?? []) as Array<{
        id?: string
        operationKey?: string
        versions?: Array<{ id?: string; ordinal?: number; mediaUrl?: string | null; status?: string; invalidated?: boolean; note?: string | null }>
      }>
      return {
        track: track
          ? {
              id: track.id ?? null,
              adoptedVersionId: track.adoptedVersionId ?? null,
              hasInvalidated: Boolean(track.hasInvalidated),
              batches: batches.map((batch) => ({
                id: batch.id ?? '',
                operationKey: batch.operationKey ?? batch.id ?? '',
                versions: (batch.versions ?? []).map((v) => ({
                  id: v.id ?? '',
                  ordinal: Number(v.ordinal ?? 0),
                  mediaUrl: v.mediaUrl ?? null,
                  status: v.status ?? 'pending',
                  invalidated: Boolean(v.invalidated),
                  note: v.note ?? null,
                })),
              })),
            }
          : null,
      }
    })(),
  }
}

export function adaptRemakeShots(snapshot: RemakeSnapshot): RemakeShotView[] {
  return snapshot.shots.map(adaptRemakeShot)
}

export function eligibleKeyframeShotCount(shots: Array<{ slots: Record<RemakeKeyframeSlot, { eligible: boolean }> }>) {
  return {
    eligible: shots.filter((shot) => REMAKE_KEYFRAME_SLOTS.some((slot) => shot.slots[slot]?.eligible)).length,
    total: shots.length,
  }
}

export function canSelectRemakeKeyframeSlot(slot: Pick<RemakeKeyframeSlotView, 'eligible' | 'reason'>): boolean {
  return slot.eligible && !slot.reason
}

export function orderedRemakeBatches(batches: RemakeKeyframeBatch[]): RemakeKeyframeBatch[] {
  return [...batches].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}


export type RemakeSourceSlotView = {
  slot: RemakeKeyframeSlot
  originalMediaId: string | null
  originalMediaUrl: string | null
  selectedForGeneration: boolean
  eligible: boolean
  reason: string | null
  prompt: { id: string | null; versionNumber: number | null; status: 'approved' | 'missing' | 'needs_review'; coreText: string | null } | null
}

export function buildSourceSlotView(shot: RemakeShotView, slot: RemakeKeyframeSlot): RemakeSourceSlotView {
  const slotState = shot.slots[slot]
  const promptTrack = (shot.prompt ?? []).find((candidate) => candidate.targetKey === `image:${slot}`)
  const adopted = (promptTrack as Record<string, unknown> | null | undefined)?.adoptedVersion
  const hasAdopted = Boolean(adopted)
  const needsReview = Boolean((promptTrack as Record<string, unknown> | null | undefined)?.needsReview)
  let status: 'approved' | 'missing' | 'needs_review' = 'missing'
  if (hasAdopted) status = needsReview ? 'needs_review' : 'approved'
  const version = adopted ? (adopted as Record<string, unknown>).versionNumber : null
  const coreText = adopted && typeof (adopted as Record<string, unknown>).coreText === 'string'
    ? (adopted as Record<string, unknown>).coreText as string
    : null
  return {
    slot,
    originalMediaId: shot.original[slot].mediaId,
    originalMediaUrl: shot.original[slot].mediaUrl,
    selectedForGeneration: slotState.selectedForGeneration,
    eligible: slotState.eligible,
    reason: slotState.reason,
    prompt: hasAdopted || needsReview
      ? {
          id: (promptTrack as Record<string, unknown>).id as string,
          versionNumber: typeof version === 'number' ? version : null,
          status,
          coreText,
        }
      : null,
  }
}


export type TwoRowSlotColumn = {
  slot: RemakeKeyframeSlot
  rowLabels: {
    original: string
    newFrame: string
  }
  original: {
    mediaId: string | null
    mediaUrl: string | null
  }
  newFrame: {
    isEmpty: boolean
    isAdopted: boolean
    adoptedMediaUrl: string | null
    candidateCount: number
    batchCount: number
    slotViewId: string | null
  } | null
}

export function buildTwoRowLayout(shot: RemakeShotView): TwoRowSlotColumn[] {
  return REMAKE_KEYFRAME_SLOTS.map((slot) => {
    const slotView = shot.slots[slot]
    const batches = slotView.batches
    const totalCandidates = batches.reduce((sum, batch) => sum + batch.candidates.filter((candidate) => candidate.eligible).length, 0)
    const adopted = slotView.adoptedCandidate
    const isEmpty = !slotView.selectedForGeneration || totalCandidates === 0
    let adoptedMediaUrl: string | null = null
    if (adopted?.mediaUrl) {
      adoptedMediaUrl = adopted.mediaUrl
    } else if (adopted?.mediaId) {
      adoptedMediaUrl = `/api/remake-projects/0/scenedetect/media/${adopted.mediaId}`
    }
    return {
      slot,
      rowLabels: {
        original: '原始动作参考',
        newFrame: '新画面参考',
      },
      original: {
        mediaId: shot.original[slot].mediaId,
        mediaUrl: shot.original[slot].mediaUrl,
      },
      newFrame: {
        isEmpty,
        isAdopted: Boolean(slotView.adoptedCandidateId),
        adoptedMediaUrl,
        candidateCount: totalCandidates,
        batchCount: batches.length,
        slotViewId: slotView.id,
      },
    } satisfies TwoRowSlotColumn
  })
}
