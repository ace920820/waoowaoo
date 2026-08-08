import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'bullmq'
import { redis, queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { withTaskLifecycle } from './shared'
import { assertTaskActive, sleep } from './utils'
import { handleRemakeImagePromptTask } from './handlers/remake-prompt'

const LEASE_KEY = 'waoowaoo:lease:prompt-image:v1'
const LEASE_LIMIT = 3
const LEASE_TTL_MS = 90_000
const LEASE_POLL_MS = 500

const ACQUIRE_LEASE = "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end; redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4]); redis.call('PEXPIRE', KEYS[1], ARGV[5]); return 1"
const RENEW_LEASE = "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); if redis.call('ZSCORE', KEYS[1], ARGV[2]) == false then return 0 end; redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2]); redis.call('PEXPIRE', KEYS[1], ARGV[4]); return 1"
const RELEASE_LEASE = "redis.call('ZREM', KEYS[1], ARGV[1]); return 1"

type LeaseRedis = { eval: (script: string, keyCount: number, ...args: string[]) => Promise<number | string> }

async function evalLease(script: string, ...args: string[]) {
  return Number(await (redis as unknown as LeaseRedis).eval(script, 1, LEASE_KEY, ...args))
}

export async function withPromptImageLease<T>(job: Job<TaskJobData>, run: () => Promise<T>) {
  const token = `${job.data.taskId}:${randomUUID()}`
  for (;;) {
    await assertTaskActive(job, 'waiting_for_prompt_image_lease')
    const now = Date.now()
    const acquired = await evalLease(ACQUIRE_LEASE, String(now), String(LEASE_LIMIT), String(now + LEASE_TTL_MS), token, String(LEASE_TTL_MS))
    if (acquired === 1) break
    await sleep(LEASE_POLL_MS)
  }
  const renewTimer = setInterval(() => {
    const now = Date.now()
    void evalLease(RENEW_LEASE, String(now), token, String(now + LEASE_TTL_MS), String(LEASE_TTL_MS)).catch(() => undefined)
  }, Math.floor(LEASE_TTL_MS / 3))
  try {
    return await run()
  } finally {
    clearInterval(renewTimer)
    await evalLease(RELEASE_LEASE, token).catch(() => undefined)
  }
}

async function processPromptImageTask(job: Job<TaskJobData>) {
  if (job.data.type !== TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE) throw new Error(`Unsupported prompt image task type: ${job.data.type}`)
  return await handleRemakeImagePromptTask(job)
}

export function createPromptImageWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.PROMPT_IMAGE,
    async (job) => await withPromptImageLease(job, async () => await withTaskLifecycle(job, processPromptImageTask)),
    { connection: queueRedis, concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_PROMPT_IMAGE || '20', 10) || 20 },
  )
}

export const PROMPT_IMAGE_LEASE = { key: LEASE_KEY, limit: LEASE_LIMIT, ttlMs: LEASE_TTL_MS }
