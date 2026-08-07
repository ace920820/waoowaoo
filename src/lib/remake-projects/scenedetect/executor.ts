import { submitTask } from '@/lib/task/submitter'
import type { Locale } from '@/i18n/routing'
import { buildSceneDetectTaskDescriptor, taskStatusToSceneDetectCallback, type SceneDetectOperation, type SceneDetectTaskInput } from './task-contract'

export function createSceneDetectExecutor(options: { userId: string; locale: Locale; submit?: typeof submitTask }) {
  const submit = options.submit || submitTask
  async function submitOperation(input: SceneDetectTaskInput) {
    const descriptor = buildSceneDetectTaskDescriptor(input)
    return submit({
      userId: options.userId,
      locale: options.locale,
      projectId: input.projectId,
      type: descriptor.taskType,
      targetType: 'remake_project',
      targetId: input.projectId,
      dedupeKey: descriptor.dedupeKey,
      payload: { capability: descriptor.capability, adapterVersion: input.adapterVersion, sourceRevision: input.sourceRevision, shotRevision: input.shotRevision ?? null, operationKey: input.operationKey },
    })
  }
  return {
    submitAnalyze: (input: Omit<SceneDetectTaskInput, 'operation'>) => submitOperation({ ...input, operation: 'analyze' }),
    submitExtractKeyframes: (input: Omit<SceneDetectTaskInput, 'operation'>) => submitOperation({ ...input, operation: 'extract_keyframes' }),
    toCallback: taskStatusToSceneDetectCallback,
  }
}

export function isSceneDetectOperation(value: unknown): value is SceneDetectOperation {
  return value === 'analyze' || value === 'extract_keyframes'
}
