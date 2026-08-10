import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { buildRemakeKeyframeActionSheetTaskDescriptor } from '@/lib/remake-projects/keyframes/action-sheet-task-contract'
import { getQueueTypeByTaskType } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const persist = vi.hoisted(() => vi.fn(async () => ({ status: 'ready', reused: false, outputVersion: { id: 'sheet-1' } })))
const progress = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/lib/remake-projects/keyframes/action-sheet', () => ({ persistActionSheet: persist }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: progress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: vi.fn(async () => undefined) }))

const payload = { kind: 'action_sheet' as const, projectId: '11111111-1111-4111-8111-111111111111', revisionId: '44444444-4444-4444-8444-444444444444', shotId: '33333333-3333-4333-8333-333333333333', confirmed: true, sources: [{ slot: 'start' as const, mediaId: 'start-media', timestamp: 0 }, { slot: 'middle' as const, mediaId: 'middle-media', timestamp: 1 }, { slot: 'end' as const, mediaId: 'end-media', timestamp: 2 }], fingerprint: 'a'.repeat(64) }

describe('remake action-sheet image task', () => {
  it('routes through the existing image queue and delegates durable writes', async () => {
    const descriptor = buildRemakeKeyframeActionSheetTaskDescriptor({ projectId: '11111111-1111-4111-8111-111111111111', operationKey: 'confirm-1', payload })
    expect(descriptor.taskType).toBe(TASK_TYPE.REMAKE_KEYFRAME_ACTION_SHEET)
    expect(getQueueTypeByTaskType(descriptor.taskType)).toBe('image')
    const { handleRemakeKeyframeActionSheetTask } = await import('@/lib/workers/handlers/remake-keyframe-action-sheet')
    const job = { data: { taskId: 'task-sheet-1', type: descriptor.taskType, projectId: '11111111-1111-4111-8111-111111111111', targetType: descriptor.targetType, targetId: descriptor.targetId, userId: 'user-1', locale: 'zh', payload: descriptor.payload } } as unknown as Job<TaskJobData>
    await expect(handleRemakeKeyframeActionSheetTask(job)).resolves.toMatchObject({ outputVersion: { id: 'sheet-1' } })
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ shotId: payload.shotId, revisionId: payload.revisionId, taskId: 'task-sheet-1' }))
  })
})
