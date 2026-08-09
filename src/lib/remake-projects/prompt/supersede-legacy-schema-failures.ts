import { TASK_TYPE } from '@/lib/task/types'

export const LEGACY_IMAGE_PROMPT_SCHEMA_FAILURE_CUTOFF = new Date('2026-08-09T13:10:00.000Z')
const LEGACY_ERROR = 'CODEX_PROCESS_FAILED:1'
const SUPERSEDED_CODE = 'REMAKE_PROMPT_SCHEMA_SUPERSEDED'
const SUPERSEDED_MESSAGE = 'Superseded: the legacy image Prompt executor used an invalid Codex output schema. Submit a new analysis for this frame.'

type LegacyTask = {
  id: string
  userId: string
  projectId: string
  type: string
  targetType: string
  targetId: string
}

export type TaskRepairClient = {
  task: {
    findMany: (args: unknown) => Promise<LegacyTask[]>
    update: (args: unknown) => Promise<unknown>
  }
  taskEvent: { create: (args: unknown) => Promise<unknown> }
  $transaction?: (callback: (tx: TaskRepairClient) => Promise<void>) => Promise<unknown>
}

export async function supersedeLegacyImagePromptSchemaFailures(client: TaskRepairClient, input: { apply: boolean }) {
  const tasks = await client.task.findMany({
    where: {
      type: TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE,
      status: 'failed',
      errorMessage: LEGACY_ERROR,
      createdAt: { lt: LEGACY_IMAGE_PROMPT_SCHEMA_FAILURE_CUTOFF },
    },
    select: { id: true, userId: true, projectId: true, type: true, targetType: true, targetId: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!input.apply) return { mode: 'dry-run' as const, matched: tasks.length, superseded: 0, taskIds: tasks.map((task) => task.id) }

  for (const task of tasks) {
    const applyOne = async (tx: TaskRepairClient) => {
      await tx.task.update({
        where: { id: task.id },
        data: { status: 'canceled', errorCode: SUPERSEDED_CODE, errorMessage: SUPERSEDED_MESSAGE, finishedAt: new Date() },
      })
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId: task.userId,
          eventType: 'task.canceled',
          payload: { reason: 'legacy_invalid_codex_schema', errorCode: SUPERSEDED_CODE, message: SUPERSEDED_MESSAGE },
        },
      })
    }
    if (client.$transaction) await client.$transaction(applyOne)
    else await applyOne(client)
  }

  return { mode: 'apply' as const, matched: tasks.length, superseded: tasks.length, taskIds: tasks.map((task) => task.id) }
}
