import { describe, expect, it } from 'vitest'
import { buildRemakePromptTaskDescriptor, parseRemakePromptTaskPayload } from '@/lib/remake-projects/prompt/task-contract'
import { TASK_TYPE } from '@/lib/task/types'

const imageSnapshot = {
  projectId: '11111111-1111-4111-8111-111111111111', remakeProjectId: '22222222-2222-4222-8222-222222222222', shotId: '33333333-3333-4333-8333-333333333333', stableKey: 'shot-1', sourceRevision: 1, shotRevision: 2, shotRevisionId: '44444444-4444-4444-8444-444444444444', keyframeMediaRefs: { first: 'frames/first.jpg', middle: 'frames/middle.jpg', last: 'frames/last.jpg' },
}

describe('remake prompt task contract', () => {
  it('dedupes the same image operation while producing a fresh task key for explicit reruns', () => {
    const base = { kind: 'image' as const, projectId: imageSnapshot.projectId, slot: 'start' as const, inputSnapshot: imageSnapshot }
    const first = buildRemakePromptTaskDescriptor({ ...base, operationKey: 'click-1' })
    const repeated = buildRemakePromptTaskDescriptor({ ...base, operationKey: 'click-1' })
    const rerun = buildRemakePromptTaskDescriptor({ ...base, operationKey: 'click-2' })
    expect(first.taskType).toBe(TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE)
    expect(first.dedupeKey).toBe(repeated.dedupeKey)
    expect(first.dedupeKey).not.toBe(rerun.dedupeKey)
  })

  it('rejects a client-supplied executor field and validates the canonical fingerprint', () => {
    const descriptor = buildRemakePromptTaskDescriptor({ kind: 'image', projectId: imageSnapshot.projectId, slot: 'middle', inputSnapshot: imageSnapshot, operationKey: 'click-1' })
    expect(() => parseRemakePromptTaskPayload({ ...descriptor.payload, executor: 'client-controlled' })).toThrow('REMAKE_PROMPT_TASK_FIELD_NOT_ALLOWED')
    expect(parseRemakePromptTaskPayload({ ...descriptor.payload, meta: { locale: 'zh' } })).toMatchObject({ kind: 'image', slot: 'middle' })
  })
})
