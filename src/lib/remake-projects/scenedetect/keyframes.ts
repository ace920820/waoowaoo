/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSceneDetectExecutor } from './executor'
import { sceneDetectExecutorMediaUrl } from './executor-client'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { invalidatePromptVersionsForShotRevision } from '../prompt/service'
import { invalidateKeyframeOutputsForRevision } from '../keyframes/invalidation'

export type FrameTuple = { first: number; middle: number; last: number }
export function keyframeTupleHash(tuple: FrameTuple): string {
  return createHash('sha256').update(`${tuple.first}:${tuple.middle}:${tuple.last}`).digest('hex')
}

export async function submitSceneDetectKeyframeExtraction(input: { projectId: string; userId: string; locale: any; shotId: string; sourceRevision: number; shotRevision: number; frameTuple: FrameTuple; operationKey: string }) {
  if (![input.frameTuple.first, input.frameTuple.middle, input.frameTuple.last].every(Number.isSafeInteger) || input.frameTuple.first > input.frameTuple.middle || input.frameTuple.middle > input.frameTuple.last) throw new Error('SCENEDETECT_FRAME_TUPLE_INVALID')
  const client: any = prisma
  const shot = await client.remakeShot.findUnique({ where: { id: input.shotId }, include: { remakeProject: { include: { project: true, currentSource: true } }, revisions: { where: { revision: input.shotRevision }, take: 1 } } })
  if (!shot || shot.remakeProject?.project?.id !== input.projectId || shot.remakeProject?.project?.userId !== input.userId) throw new Error('SCENEDETECT_SHOT_ACCESS_DENIED')
  if (Number(shot.remakeProject.currentSource?.sourceRevision) !== input.sourceRevision || Number(shot.currentRevision) !== input.shotRevision || shot.revisions[0]?.lifecycleState === 'retired') throw new Error('SCENEDETECT_REVISION_STALE')
  const tupleHash = keyframeTupleHash(input.frameTuple)
  return createSceneDetectExecutor({ userId: input.userId, locale: input.locale }).submitExtractKeyframes({
    projectId: input.projectId, sourceRevision: input.sourceRevision, shotRevision: input.shotRevision, shotId: input.shotId,
    adapterVersion: 'scenedetect-adapter@1.0', operationKey: `${input.operationKey}:${tupleHash}`, frameTuple: input.frameTuple,
  })
}

async function copyExecutorFrame(path: unknown, projectId: string): Promise<string> {
  if (typeof path !== 'string') throw new Error('SCENEDETECT_EXECUTOR_MEDIA_PATH_INVALID')
  const response = await fetch(sceneDetectExecutorMediaUrl(path))
  if (!response.ok) throw new Error('SCENEDETECT_EXECUTOR_MEDIA_FETCH_FAILED')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error('SCENEDETECT_KEYFRAME_MEDIA_INVALID')
  const key = generateUniqueKey(`remake/${projectId}/keyframes`, 'jpg')
  await uploadObject(bytes, key, 1, 'image/jpeg')
  const media = await ensureMediaObjectFromStorageKey(key, { mimeType: 'image/jpeg', sizeBytes: bytes.byteLength })
  return media.id
}

export async function persistSceneDetectKeyframeResult(input: { projectId: string; userId: string; sourceRevision: number; shotRevision: number; shotId: string; taskId: string; response: Record<string, unknown> }) {
  const resultShot = Array.isArray(input.response.shots) ? input.response.shots[0] as Record<string, unknown> | undefined : undefined
  if (!resultShot) throw new Error('SCENEDETECT_KEYFRAME_RESULT_INVALID')
  const mediaIds = {
    first: await copyExecutorFrame(resultShot.firstFrameUrl, input.projectId),
    middle: await copyExecutorFrame(resultShot.middleFrameUrl, input.projectId),
    last: await copyExecutorFrame(resultShot.lastFrameUrl, input.projectId),
  }
  const client: any = prisma
  return client.$transaction(async (tx: any) => {
    const shot = await tx.remakeShot.findUnique({ where: { id: input.shotId }, include: { remakeProject: { include: { project: true, currentSource: true } }, revisions: { orderBy: { revision: 'desc' } } } })
    // Executor IDs are not trusted; resolve the requested current revision inside this project.
    const target = (shot?.revisions || []).find((row: any) => Number(row.revision) === input.shotRevision)
    if (!shot || shot.remakeProject?.project?.id !== input.projectId || shot.remakeProject?.project?.userId !== input.userId || Number(shot.currentRevision) !== input.shotRevision || Number(shot.remakeProject.currentSource?.sourceRevision) !== input.sourceRevision || target?.lifecycleState === 'retired') {
      return { applied: false, mediaIds }
    }
    const payload = target.payload ? JSON.parse(target.payload) : {}
    const nextRevision = input.shotRevision + 1
    const created = await tx.remakeShotRevision.create({ data: { shotId: shot.id, revision: nextRevision, lifecycleState: 'active', sourceRevision: input.sourceRevision, changeReason: 'keyframe_extract', payload: JSON.stringify({ ...payload, mediaIds, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '' }), keyframeFrames: target.keyframeFrames, keyframeMediaRefs: JSON.stringify(mediaIds), keyframeTaskId: input.taskId } })
    await tx.remakeShotRevision.update({ where: { id: target.id }, data: { lifecycleState: 'retired' } })
    await tx.remakeShot.update({ where: { id: shot.id }, data: { currentRevision: nextRevision, version: { increment: 1 }, needsReview: true, reviewStatus: 'needs_review' } })
    await invalidatePromptVersionsForShotRevision({ tx, shotId: shot.id, revisionId: created.id, reason: 'keyframe_extract' })
    await invalidateKeyframeOutputsForRevision({ tx, shotId: shot.id, revisionId: created.id, reason: 'keyframe_extract' })
    return { applied: true, revision: nextRevision, mediaIds }
  })
}
