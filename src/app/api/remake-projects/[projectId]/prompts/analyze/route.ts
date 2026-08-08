import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { buildRemakePromptTaskDescriptor } from '@/lib/remake-projects/prompt/task-contract'
import { promptInputSnapshotSchema } from '@/lib/remake-projects/prompt/contracts'
import { evaluateSceneDetectReviewGate } from '@/lib/remake-projects/scenedetect/review-gate'

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), shotId: z.string().uuid(), slot: z.enum(['start', 'middle', 'end']), operationKey: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('video'), operationKey: z.string().trim().min(1).max(200) }).strict(),
])

type Row = Record<string, unknown>

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function parseJsonObject(value: unknown): Row {
  if (typeof value !== 'string') return object(value)
  try { return object(JSON.parse(value)) } catch { return {} }
}

function currentSnapshot(projectId: string, remakeProjectId: string, sourceRevision: number, shot: Row) {
  const revisions = Array.isArray(shot.revisions) ? shot.revisions.map(object) : []
  const revision = revisions.find((row) => Number(row.revision) === Number(shot.currentRevision))
  if (!revision || revision.lifecycleState === 'retired') return null
  const payload = parseJsonObject(revision.payload)
  const refs = parseJsonObject(revision.keyframeMediaRefs)
  const keyframeMediaRefs = Object.fromEntries(Object.entries(refs).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
  const gate = evaluateSceneDetectReviewGate({
    status: payload.status === 'keep' || payload.status === 'discard' ? payload.status : 'pending',
    needsReview: Boolean(shot.needsReview), revisionState: typeof revision.lifecycleState === 'string' ? revision.lifecycleState : null,
    sourceRevision: typeof revision.sourceRevision === 'number' ? revision.sourceRevision : null, currentSourceRevision: sourceRevision, keyframeMediaRefs,
  })
  if (!gate.promptEligible) return null
  return promptInputSnapshotSchema.parse({ projectId, remakeProjectId, shotId: shot.id, stableKey: shot.stableKey, sourceRevision, shotRevision: revision.revision, shotRevisionId: revision.id, keyframeMediaRefs })
}

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new ApiError('INVALID_PARAMS', { details: 'Expected one image Shot/slot action or one whole-video action' })
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { remakeProject: { include: { currentSource: true, shots: { include: { revisions: true } } } } },
  }) as unknown as Row | null
  const remake = object(project?.remakeProject)
  const source = object(remake.currentSource)
  if (!project || project.type !== 'remake' || !remake.id || !source.id || source.status === 'retired' || !Number.isSafeInteger(source.sourceRevision)) throw new ApiError('INVALID_PARAMS', { details: 'A current source video is required' })
  const snapshots = (Array.isArray(remake.shots) ? remake.shots.map(object) : []).map((shot) => currentSnapshot(projectId, String(remake.id), Number(source.sourceRevision), shot)).filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null)
  const input = body.data
  if (input.kind === 'image') {
    const snapshot = snapshots.find((item) => item.shotId === input.shotId)
    if (!snapshot) throw new ApiError('INVALID_PARAMS', { details: 'Shot is not confirmed and prompt-ready' })
    const descriptor = buildRemakePromptTaskDescriptor({ kind: 'image', projectId, operationKey: input.operationKey, slot: input.slot, inputSnapshot: snapshot })
    const submitted = await submitTask({ userId: auth.session.user.id, locale: 'zh', projectId, type: descriptor.taskType, targetType: descriptor.targetType, targetId: descriptor.targetId, payload: descriptor.payload, dedupeKey: descriptor.dedupeKey, maxAttempts: 1 })
    return NextResponse.json({ taskId: submitted.taskId }, { status: 202 })
  }
  const allShots = Array.isArray(remake.shots) ? remake.shots.map(object) : []
  if (!snapshots.length || snapshots.length !== allShots.length) throw new ApiError('INVALID_PARAMS', { details: 'All current Shots must be confirmed with complete keyframes' })
  const descriptor = buildRemakePromptTaskDescriptor({ kind: 'video', projectId, operationKey: input.operationKey, sourceRevision: Number(source.sourceRevision), snapshots })
  const submitted = await submitTask({ userId: auth.session.user.id, locale: 'zh', projectId, type: descriptor.taskType, targetType: descriptor.targetType, targetId: descriptor.targetId, payload: descriptor.payload, dedupeKey: descriptor.dedupeKey, maxAttempts: 1 })
  return NextResponse.json({ taskId: submitted.taskId }, { status: 202 })
})
