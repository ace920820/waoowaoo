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
      capability: typeof payload.capability === 'string' ? payload.capability : task.type,
      attempt: task.attempt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      runId: typeof payload.runId === 'string' ? payload.runId : null,
      workflowVersion: typeof payload.workflowVersion === 'string' ? payload.workflowVersion : null,
      provenance: {
        schema: typeof provenance.schema === 'string' ? provenance.schema : null,
        executor: typeof provenance.executor === 'string' ? provenance.executor : null,
      },
      error: task.errorCode || task.errorMessage ? { code: task.errorCode, message: task.errorMessage || 'Task failed' } : null,
      reviewStatus: 'independent',
    }
  }) })
})
