import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { queryTasks } from '@/lib/task/service'

function displayStatus(status: string) {
  if (status === 'processing') return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'canceled') return 'canceled'
  return status === 'queued' ? 'queued' : 'waiting_retry'
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.replace(/https?:\/\/\S+/gi, '[redacted]').replace(/(?:\/|[A-Za-z]:\\)[^\s]+/g, '[redacted]').slice(0, 240)
}

function resultIds(value: unknown): Record<string, string> {
  const result = toObject(value)
  const ids: Record<string, string> = {}
  for (const key of ['analysisId', 'resultId', 'sourceRevisionId', 'shotRevisionId', 'mediaId']) {
    if (typeof result[key] === 'string' && result[key].trim()) ids[key] = result[key]
  }
  return ids
}

export const GET = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { projectId } = await context.params
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true, type: true } })
  if (!project || project.userId !== auth.session.user.id || project.type !== 'remake') throw new ApiError('NOT_FOUND')
  const targetType = request.nextUrl.searchParams.get('targetType') || undefined
  const targetId = request.nextUrl.searchParams.get('targetId') || undefined
  const tasks = await queryTasks({ projectId, targetType, targetId, limit: 200 })
  return NextResponse.json({ tasks: tasks.filter((task) => task.userId === auth.session.user.id).map((task) => {
    const payload = toObject(task.payload)
    const provenance = toObject(payload.provenance)
    return {
      taskId: task.id,
      displayStatus: displayStatus(task.status),
      status: task.status,
      progress: typeof task.progress === 'number' ? Math.max(0, Math.min(100, task.progress)) : 0,
      capability: typeof payload.capability === 'string' ? payload.capability : task.type,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts ?? null,
      resultIds: resultIds(task.result),
      stage: typeof payload.stage === 'string' ? payload.stage : null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      runId: typeof payload.runId === 'string' ? payload.runId : null,
      workflowVersion: typeof payload.workflowVersion === 'string' ? payload.workflowVersion : null,
      provenance: {
        schema: typeof provenance.schema === 'string' ? provenance.schema : null,
        executor: typeof provenance.executor === 'string' ? provenance.executor : null,
      },
      error: task.errorCode || task.errorMessage ? { code: typeof task.errorCode === 'string' ? task.errorCode : 'TASK_FAILED', message: safeErrorMessage(task.errorMessage) || 'Task failed' } : null,
      reviewStatus: 'independent',
    }
  }) })
})
