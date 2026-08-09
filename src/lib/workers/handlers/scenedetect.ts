import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { downloadAndUploadImage, generateUniqueKey, getObjectBuffer } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { commitSceneDetectImport } from '@/lib/remake-projects/scenedetect/adapter'
import { createSceneDetectExecutorClient, sceneDetectExecutorMediaUrl } from '@/lib/remake-projects/scenedetect/executor-client'
import { parseSceneDetectTaskPayload } from '@/lib/remake-projects/scenedetect/task-contract'
import { persistSceneDetectKeyframeResult } from '@/lib/remake-projects/scenedetect/keyframes'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'

type SourceRow = Record<string, unknown>
type ProjectRow = SourceRow & { remakeProject?: SourceRow & { currentSource?: SourceRow | null } }

/** Download executor frames into Waoo storage and retain opaque media IDs for later review. */
async function uploadKeyframe(relPath: string | undefined, analysisId: string): Promise<string> {
  if (typeof relPath !== 'string' || !relPath.startsWith('/media/')) return ''
  try {
    const key = await downloadAndUploadImage(
      sceneDetectExecutorMediaUrl(relPath),
      generateUniqueKey(`scenedetect/${analysisId}/frames`, 'jpg'),
    )
    return (await ensureMediaObjectFromStorageKey(key, { mimeType: 'image/jpeg' })).id
  } catch {
    return ''
  }
}

async function projectPayloadWithKeyframes(input: { projectId: string; analysisId: string; source: Record<string, unknown>; response: Record<string, unknown>; threshold: number }) {
  const metadata = input.response.metadata as Record<string, unknown>
  const rawShots = Array.isArray(input.response.shots) ? input.response.shots : []
  const shots = await Promise.all(rawShots.map(async (shot, index) => {
    const s = shot as Record<string, unknown>
    const [first, middle, last] = await Promise.all([
      uploadKeyframe(s.firstFrameUrl as string | undefined, input.analysisId),
      uploadKeyframe(s.middleFrameUrl as string | undefined, input.analysisId),
      uploadKeyframe(s.lastFrameUrl as string | undefined, input.analysisId),
    ])
    return {
      ...s,
      id: String(s.id || `scene-${index + 1}`),
      mediaIds: { first, middle, last },
      firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '',
      keyframeSource: 'AI', status: 'pending', modifiedSource: 'AI',
      tags: Array.isArray(s.tags) ? s.tags : [],
      notes: String(s.notes || ''),
    }
  }))
  return {
    schemaVersion: 2, type: 'scenedetect-project',
    project: { id: input.projectId, name: input.projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    source: { fileName: input.source.fileName || metadata.name || 'source.mp4', size: Number(metadata.size || 0), duration: Number(metadata.duration || 0), fps: Number(metadata.fps || 0), width: Number(metadata.width || 1), height: Number(metadata.height || 1), totalFrames: Number(metadata.totalFrames || 1) },
    analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: input.threshold, analyzedAt: new Date().toISOString(), status: 'analyzed_review' },
    view: { currentFrame: 0, activeShotId: null },
    shots,
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
  const response = await executor.execute({ operation: payload.operation, source: bytes, fileName: String(source.fileName || 'source.mp4'), threshold: payload.threshold, shots: payload.frameTuple ? [{ id: payload.shotId, shotNumber: 1, startFrame: payload.frameTuple.first, endFrame: payload.frameTuple.last, keyframeFrames: payload.frameTuple }] : [] })
  await reportTaskProgress(job, 70, { stage: 'import', displayMode: 'detail' })
  const envelope = { resultVersion: '1.0', adapterVersion: 'scenedetect-adapter@1.0', executorVersion: 'scenedetect-executor@1.0', analysisId: String(response.analysisId), sourceRevision: payload.sourceRevision, operationKey: payload.operationKey, payload: await projectPayloadWithKeyframes({ projectId: job.data.projectId, analysisId: String(response.analysisId), source, response, threshold: payload.threshold || Number(response.threshold || 27) }), provenance: { mode: 'executor_result' as const } }
  const imported = payload.operation === 'extract_keyframes'
    ? await persistSceneDetectKeyframeResult({ projectId: job.data.projectId, userId: job.data.userId, sourceRevision: payload.sourceRevision, shotRevision: Number(payload.shotRevision), shotId: String(payload.shotId || ''), taskId: String(job.id), response })
    : await commitSceneDetectImport({ projectId: job.data.projectId, userId: job.data.userId, analysisId: String(response.analysisId), operationKey: payload.operationKey, payload: envelope })
  return { operation: payload.operation, sourceRevision: payload.sourceRevision, analysisId: String(response.analysisId), imported }
}
