import type { RemakeShotView } from './adapter'

export type RemakeVideoInputState = {
  shotId: string
  videoPrompt: 'approved' | 'missing' | 'needs_review'
  mainImages: Array<{ slot: 'start' | 'middle' | 'end'; mediaId: string; source: 'adopted' }>
  missingMainSlots: Array<'start' | 'middle' | 'end'>
  actionSheet: { status: 'current' | 'missing' | 'waiting'; mediaId: string | null; source: 'original_action_sheet' }
  capabilityReason: string | null
}

export type VideoCapabilityInput = { supportsStart?: boolean; supportsMiddle?: boolean; supportsEnd?: boolean }

/** Maps authorized Remake facts to truthful Phase 9 video inputs; no fallback frames are synthesized. */
export function mapRemakeVideoInputs(shot: RemakeShotView, capability: VideoCapabilityInput = {}): RemakeVideoInputState {
  const allowed = new Set((['start', 'middle', 'end'] as const).filter((slot) => capability[`supports${slot[0].toUpperCase()}${slot.slice(1)}` as 'supportsStart' | 'supportsMiddle' | 'supportsEnd'] !== false))
  const mainImages = (['start', 'middle', 'end'] as const).filter((slot) => allowed.has(slot)).flatMap((slot) => {
    const mediaId = shot.slots[slot].adoptedCandidate?.mediaId
    return mediaId ? [{ slot, mediaId, source: 'adopted' as const }] : []
  })
  const missingMainSlots = (['start', 'middle', 'end'] as const).filter((slot) => allowed.has(slot) && !shot.slots[slot].adoptedCandidate?.mediaId)
  const omitted = (['start', 'middle', 'end'] as const).filter((slot) => !allowed.has(slot))
  return {
    shotId: shot.id,
    videoPrompt: shot.videoPromptStatus,
    mainImages,
    missingMainSlots,
    actionSheet: { status: shot.actionSheet.status, mediaId: shot.actionSheet.mediaId, source: 'original_action_sheet' },
    capabilityReason: omitted.length ? `当前视频模型不支持：${omitted.join('、')}` : null,
  }
}

export function videoSubmissionDisabled() {
  return true
}
