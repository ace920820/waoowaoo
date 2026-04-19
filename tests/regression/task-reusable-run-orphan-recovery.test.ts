import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRun } from '@/lib/run-runtime/service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { prisma } from '../helpers/prisma'
import { resetBillingState } from '../helpers/db-reset'
import { createTestUser } from '../helpers/billing-fixtures'

const addTaskJobMock = vi.hoisted(() => vi.fn(async () => ({ id: 'mock-job' })))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => ({})))
const reconcileMock = vi.hoisted(() => ({
  isJobAlive: vi.fn(async () => false),
}))

vi.mock('@/lib/task/queues', () => ({
  addTaskJob: addTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
}))

vi.mock('@/lib/task/reconcile', () => reconcileMock)

describe('regression - reusable active run orphan recovery', () => {
  beforeEach(async () => {
    await resetBillingState()
    vi.clearAllMocks()
    reconcileMock.isJobAlive.mockResolvedValue(false)
    process.env.BILLING_MODE = 'OFF'
  })

  it('replaces a reusable active run task when its queue job is already gone', async () => {
    const user = await createTestUser()
    const orphanTask = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-regression-orphan-run',
        episodeId: 'episode-regression-orphan-run',
        type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'NovelPromotionEpisode',
        targetId: 'episode-regression-orphan-run',
        status: TASK_STATUS.PROCESSING,
        payload: {
          episodeId: 'episode-regression-orphan-run',
          analysisModel: 'model-core',
          meta: { locale: 'zh' },
        },
        queuedAt: new Date(),
        startedAt: new Date(),
      },
    })

    const run = await createRun({
      userId: user.id,
      projectId: 'project-regression-orphan-run',
      episodeId: 'episode-regression-orphan-run',
      workflowType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskId: orphanTask.id,
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-regression-orphan-run',
      input: {
        episodeId: 'episode-regression-orphan-run',
        analysisModel: 'model-core',
        meta: { locale: 'zh' },
      },
    })

    const result = await submitTask({
      userId: user.id,
      locale: 'zh',
      projectId: 'project-regression-orphan-run',
      episodeId: 'episode-regression-orphan-run',
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-regression-orphan-run',
      payload: {
        episodeId: 'episode-regression-orphan-run',
        analysisModel: 'model-core',
      },
      dedupeKey: 'script_to_storyboard:episode-regression-orphan-run',
    })

    expect(reconcileMock.isJobAlive).toHaveBeenCalledWith(orphanTask.id)
    expect(result.deduped).toBe(false)
    expect(result.runId).toBe(run.id)
    expect(result.taskId).not.toBe(orphanTask.id)

    const refreshedRun = await prisma.graphRun.findUnique({ where: { id: run.id } })
    const refreshedOldTask = await prisma.task.findUnique({ where: { id: orphanTask.id } })
    const newTask = await prisma.task.findUnique({ where: { id: result.taskId } })

    expect(refreshedRun?.taskId).toBe(result.taskId)
    expect(refreshedOldTask?.status).toBe(TASK_STATUS.FAILED)
    expect(refreshedOldTask?.errorCode).toBe('RECONCILE_ORPHAN')
    expect(newTask?.status).toBe(TASK_STATUS.QUEUED)
    expect(newTask?.payload).toMatchObject({
      runId: run.id,
    })
  })
})
