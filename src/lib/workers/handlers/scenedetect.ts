import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getObjectBuffer } from '@/lib/storage'
import { commitSceneDetectImport } from '@/lib/remake-projects/scenedetect/adapter'
import { createSceneDetectExecutorClient } from '@/lib/remake-projects/scenedetect/executor-client'
import { parseSceneDetectTaskPayload } from '@/lib/remake-projects/scenedetect/task-contract'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'

type SourceRow = Record<string, unknown>
type ProjectRow = SourceRow & { remakeProject?: SourceRow & { currentSource?: SourceRow | null } }

function projectPayload(input: { projectId: string; source: Record<string, unknown>; response: Record<string, unknown>; threshold: number }) {
  const metadata = input.response.metadata as Record<string, unknown>
  const shots = Array.isArray(input.response.shots) ? input.response.shots : []
  return {
    schemaVersion: 2, type: 'scenedetect-project',
    project: { id: input.projectId, name: input.projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    source: { fileName: input.source.fileName || metadata.name || 'source.mp4', size: Number(metadata.size || 0), duration: Number(metadata.duration || 0), fps: Number(metadata.fps || 0), width: Number(metadata.width || 1), height: Number(metadata.height || 1), totalFrames: Number(metadata.totalFrames || 1) },
    analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: input.threshold, analyzedAt: new Date().toISOString(), status: 'analyzed_review' },
    view: { currentFrame: 0, activeShotId: null },
    shots: shots.map((shot, index) => ({ id: String((shot as Record<string, unknown>).id || `scene-${index + 1}`), ...shot, keyframeSource: 'AI', status: 'pending', modifiedSource: 'AI', tags: Array.isArray((shot as Record<string, unknown>).tags) ? (shot as Record<string, unknown>).tags : [], notes: String((shot as Record<string, unknown>).notes || '') })),
  }
}

export async function handleSceneDetectTask(job: Job<TaskJobData>) {
  const payload = parseSceneDetectTaskPayload(job.data.payload)
  const project = await prisma.project.findUnique({ where: { id: job.data.projectId }, include: { remakeProject: { include: { currentSource: true } } } }) as ProjectRow | null
  const source = project?.remakeProject?.currentSource as Record<string, unknown> | undefined
  if (!project || project.userId !== job.data.userId || project.type !== 'remake' || !source?.storageKey) throw new Error('SCENEDETECT_SOURCE_NOT_FOUND')
  if (Number(source.sourceRevision) !== payload.sourceRevision) throw new Error('SCENEDETECT_SOURCE_REVISION_STALE')
  await reportTaskProgress(job, 15, { stage: 'source-read', displayMode: 'detail' })
  const bytes = await getObjectBuffer(String(source.storageKey))
  await reportTaskProgress(job, 30, { stage: 'executor-call', displayMode: 'indeterminate' })
  const executor = createSceneDetectExecutorClient()
  const response = await executor.execute({ operation: payload.operation, source: bytes, fileName: String(source.fileName || 'source.mp4'), threshold: payload.threshold, shots: payload.frameTuple ? [{ shotNumber: 1, startFrame: payload.frameTuple.first, endFrame: payload.frameTuple.last, keyframeFrames: payload.frameTuple }] : [] })
  await reportTaskProgress(job, 70, { stage: 'import', displayMode: 'detail' })
  const envelope = { resultVersion: '1.0', adapterVersion: 'scenedetect-adapter@1.0', executorVersion: 'scenedetect-executor@1.0', analysisId: String(response.analysisId), sourceRevision: payload.sourceRevision, operationKey: payload.operationKey, payload: projectPayload({ projectId: job.data.projectId, source, response, threshold: payload.threshold || Number(response.threshold || 27) }), provenance: { mode: 'executor_result' as const } }
  const imported = await commitSceneDetectImport({ projectId: job.data.projectId, userId: job.data.userId, analysisId: String(response.analysisId), operationKey: payload.operationKey, payload: envelope })
  return { operation: payload.operation, sourceRevision: payload.sourceRevision, analysisId: String(response.analysisId), imported }
}
