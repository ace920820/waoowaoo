import { TASK_TYPE, TASK_STATUS, type TaskType } from '@/lib/task/types'

export type SceneDetectOperation = 'analyze' | 'extract_keyframes'
export type SceneDetectTaskInput = {
  projectId: string
  sourceRevision: number
  shotRevision?: number | null
  adapterVersion: string
  operationKey: string
  operation: SceneDetectOperation
}

export const SCENEDETECT_CAPABILITIES = {
  analyze: { capability: 'scenedetect.analyze', taskType: TASK_TYPE.SCENEDETECT_ANALYZE },
  extract_keyframes: { capability: 'scenedetect.extract_keyframes', taskType: TASK_TYPE.SCENEDETECT_EXTRACT_KEYFRAMES },
} as const satisfies Record<SceneDetectOperation, { capability: string; taskType: TaskType }>

export function buildSceneDetectTaskDescriptor(input: SceneDetectTaskInput) {
  const capability = SCENEDETECT_CAPABILITIES[input.operation]
  if (!input.projectId || !input.adapterVersion || !input.operationKey) throw new Error('SceneDetect task input is incomplete')
  return {
    ...input,
    taskType: capability.taskType,
    capability: capability.capability,
    dedupeKey: `scenedetect:${input.projectId}:${input.operation}:${input.sourceRevision}:${input.shotRevision ?? 'project'}:${input.operationKey}`,
  }
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
