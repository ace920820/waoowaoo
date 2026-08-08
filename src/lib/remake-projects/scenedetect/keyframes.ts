import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSceneDetectExecutor } from './executor'

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
    projectId: input.projectId, sourceRevision: input.sourceRevision, shotRevision: input.shotRevision,
    adapterVersion: 'scenedetect-adapter@1.0', operationKey: `${input.operationKey}:${tupleHash}`, frameTuple: input.frameTuple,
  })
}
