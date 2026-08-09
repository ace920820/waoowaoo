import { describe, expect, it, vi } from 'vitest'
import { LEGACY_IMAGE_PROMPT_SCHEMA_FAILURE_CUTOFF, supersedeLegacyImagePromptSchemaFailures, type TaskRepairClient } from '@/lib/remake-projects/prompt/supersede-legacy-schema-failures'

const legacyTask = {
  id: 'legacy-image-task', userId: 'user-1', projectId: 'project-1', type: 'remake_image_prompt_analyze', targetType: 'remake_shot', targetId: 'shot-1',
  status: 'failed', errorMessage: 'CODEX_PROCESS_FAILED:1', createdAt: new Date('2026-08-09T13:00:00.000Z'),
}

describe('legacy image Prompt schema failure repair', () => {
  it('does not write in dry-run, applies only the exact historical failure once, and records a cancellation audit event', async () => {
    const task = { findMany: vi.fn(async () => [legacyTask]), update: vi.fn(async () => legacyTask) }
    const taskEvent = { create: vi.fn(async () => ({ id: 1 })) }
    const client = { task, taskEvent, $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(client)) } as unknown as TaskRepairClient

    await expect(supersedeLegacyImagePromptSchemaFailures(client, { apply: false })).resolves.toMatchObject({ mode: 'dry-run', matched: 1, superseded: 0 })
    expect(task.update).not.toHaveBeenCalled()
    expect(taskEvent.create).not.toHaveBeenCalled()

    await expect(supersedeLegacyImagePromptSchemaFailures(client, { apply: true })).resolves.toMatchObject({ mode: 'apply', matched: 1, superseded: 1 })
    expect(task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'remake_image_prompt_analyze', status: 'failed', errorMessage: 'CODEX_PROCESS_FAILED:1', createdAt: { lt: LEGACY_IMAGE_PROMPT_SCHEMA_FAILURE_CUTOFF } }),
    }))
    expect(task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'canceled', errorCode: 'REMAKE_PROMPT_SCHEMA_SUPERSEDED' }) }))
    expect(taskEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'task.canceled' }) }))

    task.findMany.mockResolvedValueOnce([])
    await expect(supersedeLegacyImagePromptSchemaFailures(client, { apply: true })).resolves.toMatchObject({ matched: 0, superseded: 0 })
  })
})
