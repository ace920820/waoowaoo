import { describe, expect, it, vi } from 'vitest'
import { createSceneDetectExecutor } from '@/lib/remake-projects/scenedetect/executor'
import { buildSceneDetectTaskDescriptor, parseSceneDetectTaskPayload, taskStatusToSceneDetectCallback } from '@/lib/remake-projects/scenedetect/task-contract'
import { normalizeTaskPayload } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

describe('SceneDetect task contract', () => {
  it('dedupes the same project/source/shot revision and operation key', () => {
    const first = buildSceneDetectTaskDescriptor({ projectId: 'p1', sourceRevision: 2, shotRevision: 4, adapterVersion: 'v1', operationKey: 'op1', operation: 'analyze' })
    const replay = buildSceneDetectTaskDescriptor({ projectId: 'p1', sourceRevision: 2, shotRevision: 4, adapterVersion: 'v1', operationKey: 'op1', operation: 'analyze' })
    const changed = buildSceneDetectTaskDescriptor({ projectId: 'p1', sourceRevision: 3, shotRevision: 4, adapterVersion: 'v1', operationKey: 'op1', operation: 'analyze' })
    expect(replay.dedupeKey).toBe(first.dedupeKey)
    expect(changed.dedupeKey).not.toBe(first.dedupeKey)
  })

  it('exposes only SceneDetect callback semantics and keeps review independent', () => {
    expect(taskStatusToSceneDetectCallback({ status: 'completed', result: { analysisId: 'a1' } })).toEqual({ kind: 'completed', result: { analysisId: 'a1' } })
    expect(taskStatusToSceneDetectCallback({ status: 'failed', errorMessage: 'redacted' })).toEqual({ kind: 'failed', error: 'redacted' })
    expect(taskStatusToSceneDetectCallback({ status: 'waiting_retry', attempt: 2 })).toEqual({ kind: 'retry', attempt: 2 })
  })

  it('submits both operations through the existing task submitter', async () => {
    const submit = vi.fn(async (input: Record<string, unknown>) => ({ task: { id: 'task-1', ...input } }))
    const executor = createSceneDetectExecutor({ userId: 'u1', locale: 'en', submit: submit as never })
    await executor.submitAnalyze({ projectId: 'p1', sourceRevision: 1, adapterVersion: 'v1', operationKey: 'op1' })
    await executor.submitExtractKeyframes({ projectId: 'p1', sourceRevision: 1, shotRevision: 1, adapterVersion: 'v1', operationKey: 'op2' })
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ targetType: 'remake_project' })
  })

  it('accepts run-runtime flow metadata but rejects unknown worker payload fields', () => {
    const normalized = normalizeTaskPayload(TASK_TYPE.SCENEDETECT_ANALYZE, {
      sourceRevision: 1,
      shotRevision: null,
      operationKey: 'analyze-source',
      operation: 'analyze',
      detector: 'content',
      threshold: 27,
    })

    expect(parseSceneDetectTaskPayload(normalized)).toMatchObject({
      sourceRevision: 1,
      shotRevision: null,
      operationKey: 'analyze-source',
      operation: 'analyze',
      detector: 'content',
      threshold: 27,
    })
    expect(() => parseSceneDetectTaskPayload({ ...normalized, unexpected: true })).toThrow('SCENEDETECT_TASK_FIELD_NOT_ALLOWED:unexpected')
  })
})
