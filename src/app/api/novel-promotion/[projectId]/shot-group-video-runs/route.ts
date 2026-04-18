import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'

function readString(value: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readRecordString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const shotGroupId = readString(request.nextUrl.searchParams.get('shotGroupId'))
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    select: {
      id: true,
      title: true,
      episodeId: true,
    },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }

  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      type: TASK_TYPE.VIDEO_SHOT_GROUP,
      targetType: 'NovelPromotionShotGroup',
      targetId: shotGroup.id,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const runs = tasks.map((task) => {
    const payload = toRecord(task.payload)
    const result = toRecord(task.result)
    return {
      taskId: task.id,
      shotGroupId: shotGroup.id,
      episodeId: shotGroup.episodeId,
      status: task.status,
      createdAt: task.createdAt,
      queuedAt: task.queuedAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      videoUrl: readRecordString(result, 'videoUrl'),
      videoPrompt: readRecordString(result, 'videoPrompt'),
      videoModel: readRecordString(result, 'videoModel') || readRecordString(payload, 'videoModel'),
      videoSourceType: readRecordString(result, 'videoSourceType') || readRecordString(payload, 'referenceMode'),
      referencesSnapshot: result?.videoReferences ?? payload?.orderedReferences ?? null,
    }
  })

  return NextResponse.json({
    shotGroup: {
      id: shotGroup.id,
      title: shotGroup.title,
      episodeId: shotGroup.episodeId,
    },
    runStore: 'task-backed-mvp',
    runs,
  })
})
