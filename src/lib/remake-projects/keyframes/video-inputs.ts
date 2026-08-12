import type { RemakeShotView } from './adapter'

export type RemakeVideoInputState = {
  shotId: string
  videoPrompt: 'approved' | 'missing' | 'needs_review'
  mainImages: Array<{ slot: 'start' | 'middle' | 'end'; mediaId: string; source: 'adopted' }>
  missingMainSlots: Array<'start' | 'middle' | 'end'>
  actionSheet: { status: 'current' | 'missing' | 'waiting'; mediaId: string | null; source: 'original_action_sheet' }
  capabilityReason: string | null
}

export type VideoCapabilityInput = {
  supportsStart?: boolean
  supportsMiddle?: boolean
  supportsEnd?: boolean
}

export type SelectedVideoReferences = {
  slots: Array<'start' | 'middle' | 'end'>
  includeActionSheet: boolean
}

export type OrderedVideoReferencePreview = Array<{
  ordinal: number
  role: 'start_keyframe' | 'middle_keyframe' | 'end_keyframe' | 'action_sheet'
  slot?: 'start' | 'middle' | 'end'
  mediaId: string
  source: 'adopted' | 'original_action_sheet'
  label: string
}>

/** Maps authorized Remake facts to truthful Phase 9 video inputs; no fallback frames are synthesized. */
export function mapRemakeVideoInputs(
  shot: RemakeShotView,
  capability: VideoCapabilityInput = {},
): RemakeVideoInputState {
  const allowed = new Set(
    (['start', 'middle', 'end'] as const).filter(
      (slot) =>
        capability[
          `supports${slot[0].toUpperCase()}${slot.slice(1)}` as
            | 'supportsStart'
            | 'supportsMiddle'
            | 'supportsEnd'
        ] !== false,
    ),
  )
  const mainImages = (['start', 'middle', 'end'] as const)
    .filter((slot) => allowed.has(slot))
    .flatMap((slot) => {
      const mediaId = shot.slots[slot].adoptedCandidate?.mediaId
      return mediaId ? [{ slot, mediaId, source: 'adopted' as const }] : []
    })
  const missingMainSlots = (['start', 'middle', 'end'] as const).filter(
    (slot) => allowed.has(slot) && !shot.slots[slot].adoptedCandidate?.mediaId,
  )
  const omitted = (['start', 'middle', 'end'] as const).filter((slot) => !allowed.has(slot))
  return {
    shotId: shot.id,
    videoPrompt: shot.videoPromptStatus,
    mainImages,
    missingMainSlots,
    actionSheet: {
      status: shot.actionSheet.status,
      mediaId: shot.actionSheet.mediaId,
      source: 'original_action_sheet',
    },
    capabilityReason: omitted.length
      ? `当前视频模型不支持：${omitted.join('、')}`
      : null,
  }
}

/**
 * Build the exact fixed-order reference list that will be sent to the model.
 *
 * D-04: Start -> Middle -> End -> action-sheet, regardless of selection order.
 * D-03: at least one adopted keyframe must be selected.
 *
 * Used by both the UI preview and the submit handler so the displayed order
 * always matches the actual request order (D-05).
 */
export function buildOrderedVideoReferences(
  input: RemakeVideoInputState,
  selected: SelectedVideoReferences,
): OrderedVideoReferencePreview {
  const refs: OrderedVideoReferencePreview = []
  let ordinal = 1

  const slotRoleMap: Record<'start' | 'middle' | 'end', 'start_keyframe' | 'middle_keyframe' | 'end_keyframe'> = {
    start: 'start_keyframe',
    middle: 'middle_keyframe',
    end: 'end_keyframe',
  }
  const slotLabelMap: Record<'start' | 'middle' | 'end', string> = {
    start: 'Start 起始帧',
    middle: 'Middle 中间帧',
    end: 'End 结尾帧',
  }

  // Fixed order: Start -> Middle -> End
  for (const slot of ['start', 'middle', 'end'] as const) {
    if (!selected.slots.includes(slot)) continue
    const image = input.mainImages.find((img) => img.slot === slot)
    if (!image) continue
    refs.push({
      ordinal,
      role: slotRoleMap[slot],
      slot,
      mediaId: image.mediaId,
      source: 'adopted',
      label: slotLabelMap[slot],
    })
    ordinal += 1
  }

  // Action sheet last
  if (selected.includeActionSheet && input.actionSheet.status === 'current' && input.actionSheet.mediaId) {
    refs.push({
      ordinal,
      role: 'action_sheet',
      mediaId: input.actionSheet.mediaId,
      source: 'original_action_sheet',
      label: '动作表',
    })
    ordinal += 1
  }

  return refs
}

/**
 * D-03 readiness check for the submit button.
 * Returns a list of blocking reasons; empty means ready to submit.
 */
export function videoSubmissionReadiness(
  input: RemakeVideoInputState,
  selected: SelectedVideoReferences,
): string[] {
  const reasons: string[] = []

  // Must select at least one adopted keyframe
  const selectedKeyframes = selected.slots.filter((slot) =>
    input.mainImages.some((img) => img.slot === slot),
  )
  if (selectedKeyframes.length === 0) {
    reasons.push('请至少选择一张已采用的新关键帧')
  }

  // Video prompt must be approved
  if (input.videoPrompt !== 'approved') {
    if (input.videoPrompt === 'needs_review') {
      reasons.push('Video Prompt 需复核后才能生成')
    } else {
      reasons.push('缺少已批准的 Video Prompt')
    }
  }

  // Action sheet selected but not available
  if (
    selected.includeActionSheet &&
    (input.actionSheet.status !== 'current' || !input.actionSheet.mediaId)
  ) {
    reasons.push('当前 revision 的动作表不可用')
  }

  return reasons
}

export function videoSubmissionDisabled() {
  return false
}
