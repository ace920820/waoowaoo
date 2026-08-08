import { TASK_TYPE, TASK_STATUS, type TaskType } from '@/lib/task/types'

export type SceneDetectOperation = 'analyze' | 'extract_keyframes'
export type SceneDetectTaskInput = {
  projectId: string
  sourceRevision: number
  shotRevision?: number | null
  adapterVersion: string
  operationKey: string
  operation: SceneDetectOperation
  detector?: 'content'
  threshold?: number
  frameTuple?: { first: number; middle: number; last: number }
}

export const SCENEDETECT_CAPABILITIES = {
  analyze: { capability: 'scenedetect.analyze', taskType: TASK_TYPE.SCENEDETECT_ANALYZE },
  extract_keyframes: { capability: 'scenedetect.extract_keyframes', taskType: TASK_TYPE.SCENEDETECT_EXTRACT_KEYFRAMES },
} as const satisfies Record<SceneDetectOperation, { capability: string; taskType: TaskType }>

export function buildSceneDetectTaskDescriptor(input: SceneDetectTaskInput) {
  const capability = SCENEDETECT_CAPABILITIES[input.operation]
  if (!input.projectId || !input.adapterVersion || !input.operationKey) throw new Error('SceneDetect task input is incomplete')
  if (input.detector !== undefined && input.detector !== 'content') throw new Error('SCENEDETECT_DETECTOR_INVALID')
  if (input.threshold !== undefined && (!Number.isFinite(input.threshold) || input.threshold <= 0)) throw new Error('SCENEDETECT_THRESHOLD_INVALID')
  if (input.frameTuple && (!Number.isSafeInteger(input.frameTuple.first) || !Number.isSafeInteger(input.frameTuple.middle) || !Number.isSafeInteger(input.frameTuple.last))) throw new Error('SCENEDETECT_FRAME_TUPLE_INVALID')
  return {
    ...input,
    taskType: capability.taskType,
    capability: capability.capability,
    dedupeKey: `scenedetect:${input.projectId}:${input.operation}:${input.sourceRevision}:${input.shotRevision ?? 'project'}:${input.operationKey}${input.frameTuple ? `:${input.frameTuple.first}:${input.frameTuple.middle}:${input.frameTuple.last}` : ''}`,
  }
}

export function parseSceneDetectTaskPayload(payload: unknown): Pick<SceneDetectTaskInput, 'detector' | 'threshold' | 'frameTuple' | 'sourceRevision' | 'shotRevision' | 'operationKey' | 'operation'> {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const allowed = new Set(['detector', 'threshold', 'frameTuple', 'sourceRevision', 'shotRevision', 'operationKey', 'operation'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`SCENEDETECT_TASK_FIELD_NOT_ALLOWED:${key}`)
  const operation = value.operation
  if (operation !== 'analyze' && operation !== 'extract_keyframes') throw new Error('SCENEDETECT_OPERATION_INVALID')
  const sourceRevision = value.sourceRevision
  if (!Number.isSafeInteger(sourceRevision) || (sourceRevision as number) < 1) throw new Error('SCENEDETECT_SOURCE_REVISION_INVALID')
  const shotRevision = value.shotRevision == null ? null : value.shotRevision
  if (shotRevision !== null && (!Number.isSafeInteger(shotRevision) || (shotRevision as number) < 1)) throw new Error('SCENEDETECT_SHOT_REVISION_INVALID')
  const operationKey = value.operationKey
  if (typeof operationKey !== 'string' || !operationKey.trim()) throw new Error('SCENEDETECT_OPERATION_KEY_INVALID')
  const detector = value.detector === undefined ? undefined : value.detector
  if (detector !== undefined && detector !== 'content') throw new Error('SCENEDETECT_DETECTOR_INVALID')
  const threshold = value.threshold === undefined ? undefined : value.threshold
  if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0)) throw new Error('SCENEDETECT_THRESHOLD_INVALID')
  const tuple = value.frameTuple
  let frameTuple: { first: number; middle: number; last: number } | undefined
  if (tuple !== undefined) {
    if (!tuple || typeof tuple !== 'object' || Array.isArray(tuple)) throw new Error('SCENEDETECT_FRAME_TUPLE_INVALID')
    const t = tuple as Record<string, unknown>
    if (!['first', 'middle', 'last'].every((k) => Number.isSafeInteger(t[k]) && (t[k] as number) >= 0)) throw new Error('SCENEDETECT_FRAME_TUPLE_INVALID')
    frameTuple = { first: t.first as number, middle: t.middle as number, last: t.last as number }
  }
  return { operation: operation as SceneDetectOperation, sourceRevision: sourceRevision as number, shotRevision: shotRevision as number | null, operationKey: operationKey.trim(), ...(detector ? { detector: detector as 'content' } : {}), ...(threshold !== undefined ? { threshold: threshold as number } : {}), ...(frameTuple ? { frameTuple } : {}) }
}

export type SceneDetectCallback =
  | { kind: 'progress'; progress: number }
  | { kind: 'completed'; result: Record<string, unknown> | null }
  | { kind: 'failed'; error: string }
  | { kind: 'canceled' }
  | { kind: 'retry'; attempt: number }

export function taskStatusToSceneDetectCallback(task: { status: string; progress?: number | null; result?: unknown; errorMessage?: string | null; attempt?: number | null }): SceneDetectCallback {
  if (task.status === TASK_STATUS.COMPLETED) return { kind: 'completed', result: isRecord(task.result) ? task.result : null }
  if (task.status === TASK_STATUS.FAILED) return { kind: 'failed', error: task.errorMessage || 'SceneDetect task failed' }
  if (task.status === TASK_STATUS.CANCELED) return { kind: 'canceled' }
  if (task.status === 'waiting_retry') return { kind: 'retry', attempt: task.attempt || 0 }
  return { kind: 'progress', progress: Math.max(0, Math.min(100, task.progress || 0)) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
