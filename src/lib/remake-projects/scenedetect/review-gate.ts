export type SceneDetectReviewReason =
  | 'STATUS_NOT_KEEP'
  | 'NEEDS_REVIEW'
  | 'REVISION_RETIRED'
  | 'SOURCE_STALE'
  | 'KEYFRAMES_MISSING'
  | 'KEYFRAME_TASK_PENDING'
  | 'KEYFRAME_TASK_FAILED'

export type SceneDetectReviewGateInput = {
  status: 'keep' | 'pending' | 'discard'
  needsReview: boolean
  revisionState?: string | null
  sourceRevision?: number | null
  currentSourceRevision?: number | null
  keyframeMediaRefs?: { first?: string; middle?: string; last?: string } | null
  keyframeTaskStatus?: string | null
}

export function evaluateSceneDetectReviewGate(input: SceneDetectReviewGateInput) {
  const reasons: SceneDetectReviewReason[] = []
  if (input.status !== 'keep') reasons.push('STATUS_NOT_KEEP')
  if (input.needsReview) reasons.push('NEEDS_REVIEW')
  if (input.revisionState === 'retired') reasons.push('REVISION_RETIRED')
  if (input.sourceRevision !== input.currentSourceRevision) reasons.push('SOURCE_STALE')
  const refs = input.keyframeMediaRefs
  if (!refs?.first || !refs.middle || !refs.last) reasons.push('KEYFRAMES_MISSING')
  if (input.keyframeTaskStatus && ['queued', 'running', 'processing', 'waiting_retry'].includes(input.keyframeTaskStatus)) reasons.push('KEYFRAME_TASK_PENDING')
  if (input.keyframeTaskStatus === 'failed') reasons.push('KEYFRAME_TASK_FAILED')
  return { confirmed: reasons.length === 0, promptEligible: reasons.length === 0, reasons }
}
