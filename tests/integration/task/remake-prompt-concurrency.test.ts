import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redis } from '@/lib/redis'
import { TASK_TYPE } from '@/lib/task/types'
import { PROMPT_IMAGE_LEASE, withPromptImageLease } from '@/lib/workers/prompt-image.worker'
import { createQueuedTask, createTestProject, createTestUser } from '../../helpers/billing-fixtures'
import { resetBillingState } from '../../helpers/db-reset'

vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: vi.fn(async () => undefined),
  sleep: vi.fn(async () => await new Promise((resolve) => setTimeout(resolve, 15))),
}))

async function waitFor(assertion: () => void | Promise<void>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { await assertion(); return } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 15)) }
  }
  throw lastError
}

describe('remake image Prompt global Redis concurrency', () => {
  beforeEach(async () => {
    await resetBillingState()
    if (redis.status === 'wait') await redis.connect()
    await redis.del(PROMPT_IMAGE_LEASE.key)
  })

  it('keeps the fourth task queued until one of three global leases is released', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const gates = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
    const started: string[] = []
    const taskIds = await Promise.all(gates.map(async (_gate, index) => {
      const id = randomUUID()
      await createQueuedTask({ id, userId: user.id, projectId: project.id, type: TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE, targetType: 'remake_shot', targetId: `shot-${index}` })
      return id
    }))
    const runs = taskIds.map((taskId, index) => withPromptImageLease({ data: { taskId, projectId: project.id, userId: user.id } } as never, async () => {
      started.push(taskId)
      await gates[index].promise
    }))

    await waitFor(async () => {
      expect(started).toHaveLength(3)
      await expect(redis.zcard(PROMPT_IMAGE_LEASE.key)).resolves.toBe(PROMPT_IMAGE_LEASE.limit)
    })
    const overflow = await prismaTask(taskIds[3])
    expect(overflow.status).toBe('queued')

    gates[0].resolve()
    await waitFor(() => expect(started).toHaveLength(4))
    gates.slice(1).forEach((gate) => gate.resolve())
    await Promise.all(runs)
    await expect(redis.zcard(PROMPT_IMAGE_LEASE.key)).resolves.toBe(0)
  })

  it('reclaims an expired replica lease before admitting another image task', async () => {
    await redis.zadd(PROMPT_IMAGE_LEASE.key, Date.now() - 1, 'expired-replica')
    let entered = false
    await withPromptImageLease({ data: { taskId: randomUUID(), projectId: randomUUID(), userId: randomUUID() } } as never, async () => { entered = true })
    expect(entered).toBe(true)
    await expect(redis.zcard(PROMPT_IMAGE_LEASE.key)).resolves.toBe(0)
  })
})

async function prismaTask(id: string) {
  const { prisma } = await import('@/lib/prisma')
  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) throw new Error('task missing')
  return task
}
