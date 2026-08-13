import { prisma } from '@/lib/prisma'
import { extractStorageKey } from '@/lib/storage'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { createExternalShotKey } from './id-map'
import { parseSceneDetectInput, type SceneDetectProject } from './contracts'
import { parseSceneDetectResultEnvelope, wrapLegacySceneDetectProject } from './result-envelope'
import { invalidateKeyframeOutputsForRevision } from '../keyframes/invalidation'
import { invalidatePromptVersionsForShotRevision } from '../prompt/service'
import { actionSheetFingerprint } from '../keyframes/action-sheet'

type Row = Record<string, unknown>

export function previewSceneDetectImport(input: { projectId: string; analysisId: string; payload: unknown }) {
  const project = parseImportPayload(input).project
  return {
    projectId: input.projectId,
    analysisId: input.analysisId,
    source: { fileName: project.source.fileName, totalFrames: project.source.totalFrames, fps: project.source.fps },
    shots: project.shots.map((shot) => ({ externalShotKey: shot.id, shotNumber: shot.shotNumber, startFrame: shot.startFrame, endFrame: shot.endFrame })),
    warnings: project.shots.filter((shot) => shot.status === 'discard').map((shot) => `shot ${shot.shotNumber} is discarded`),
  }
}

function operationPayload(operationKey: string, project: SceneDetectProject) {
  return JSON.stringify({ operationKey, analysisId: project.project.id, source: project.source, analysis: project.analysis })
}

function sanitizeProject(project: SceneDetectProject): SceneDetectProject {
  const source = { ...project.source, videoUrl: undefined }
  // 媒体 URL 由 assertNoUntrustedMediaUrls 保证为平台存储 URL（storageKey 或 /api/files/...），写库时原样保留
  return {
    ...project,
    source,
  }
}

function assertNoUntrustedMediaUrls(project: SceneDetectProject) {
  const values = [project.source.videoUrl, ...project.shots.flatMap((shot) => [shot.firstFrameUrl, shot.middleFrameUrl, shot.lastFrameUrl])]
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      // 只信任平台存储 URL/storageKey（extractStorageKey 能识别）；外部 http(s) URL 一律拒绝
      if (!extractStorageKey(value)) {
        throw new Error('SCENEDETECT_UNTRUSTED_MEDIA_URL')
      }
    }
  }
}

function parseImportPayload(input: { analysisId: string; operationKey?: string; payload: unknown }) {
  const record = typeof input.payload === 'object' && input.payload !== null ? input.payload as Record<string, unknown> : null
  const envelope = record && 'resultVersion' in record && 'payload' in record
    ? parseSceneDetectResultEnvelope(input.payload)
    : input.operationKey
      ? parseSceneDetectResultEnvelope(wrapLegacySceneDetectProject(parseSceneDetectInput(input.payload), { sourceRevision: 1, operationKey: input.operationKey }), { allowLegacyImport: true })
      : { project: parseSceneDetectInput(input.payload), provenance: null }
  if (envelope.provenance && envelope.provenance.analysisId !== input.analysisId) throw new Error('SCENEDETECT_ANALYSIS_ID_MISMATCH')
  assertNoUntrustedMediaUrls(envelope.project)
  return { ...envelope, project: sanitizeProject(envelope.project) }
}

export async function commitSceneDetectImport(input: {
  projectId: string
  userId: string
  analysisId: string
  operationKey: string
  payload: unknown
}) {
  const parsed = parseImportPayload(input)
  const project = parsed.project
  const sourceRevision = parsed.provenance?.sourceRevision ?? 1
  const client = prisma as unknown as {
    project: { findUnique: (args: unknown) => Promise<Row | null> }
    remakeProject: { findUnique: (args: unknown) => Promise<Row | null>; update: (args: unknown) => Promise<Row> }
    remakeSource: { upsert: (args: unknown) => Promise<Row>; findFirst?: (args: unknown) => Promise<Row | null> }
    remakeShot: { findFirst: (args: unknown) => Promise<Row | null>; upsert: (args: unknown) => Promise<Row>; update: (args: unknown) => Promise<Row> }
    remakeShotRevision: { create: (args: unknown) => Promise<Row>; updateMany: (args: unknown) => Promise<Row>; findFirst?: (args: unknown) => Promise<Row | null> }
    remakeProvenanceRecord: { findFirst: (args: unknown) => Promise<Row | null>; create: (args: unknown) => Promise<Row> }
    $transaction: <T>(callback: (tx: typeof client) => Promise<T>) => Promise<T>
  }
  const owner = await client.project.findUnique({ where: { id: input.projectId }, select: { userId: true, type: true } })
  if (!owner || owner.userId !== input.userId || owner.type !== 'remake') throw new Error('Remake project access denied')
  const existingOperation = await client.remakeProvenanceRecord.findFirst({ where: { shot: { remakeProjectId: input.projectId }, payload: { contains: `\"operationKey\":\"${input.operationKey}\"` } } })
  if (existingOperation) return { committed: false, replayOf: existingOperation.id }

  const actionSheetTasks: Array<{ shotId: string; revisionId: string; fingerprint: string; sources: Array<{ slot: 'start' | 'middle' | 'end'; mediaId: string; timestamp: number }> }> = []
  return client.$transaction(async (tx) => {
    const remakeProject = await tx.remakeProject.findUnique({ where: { projectId: input.projectId } })
    if (!remakeProject) throw new Error('Remake project metadata not found')
    const currentSource = tx.remakeSource.findFirst ? await tx.remakeSource.findFirst({ where: { remakeProjectId: remakeProject.id }, orderBy: { sourceRevision: 'desc' } }) : null
    if (currentSource && Number(currentSource.sourceRevision ?? 0) > sourceRevision) throw new Error('SCENEDETECT_SOURCE_REVISION_STALE')
    await tx.remakeSource.upsert({
      where: { remakeProjectId_sourceRevision: { remakeProjectId: remakeProject.id, sourceRevision } },
      create: { remakeProjectId: remakeProject.id, sourceRevision, operationKey: input.operationKey, status: 'analyzed', fileName: project.source.fileName, probeMetadata: JSON.stringify(project.source) },
      update: { sourceRevision, operationKey: input.operationKey, status: 'analyzed', fileName: project.source.fileName, probeMetadata: JSON.stringify(project.source) },
    })
    // A rerun replaces the active boundary set for this source revision. Keeping the
    // old revisions active made one 48-shot result appear as 96 shots after rerun.
    await tx.remakeShotRevision.updateMany({
      where: { sourceRevision, lifecycleState: 'active', shot: { remakeProjectId: remakeProject.id } },
      data: { lifecycleState: 'retired' },
    })
    for (const shot of project.shots) {
      const stableKey = createExternalShotKey(input.projectId, input.analysisId, shot.id)
      // Historical imports can have several analysis-prefixed rows for one SceneDetect
      // shot. The canonical identity must win before considering their broad suffix.
      const existing = await tx.remakeShot.findFirst({
        where: { remakeProjectId: remakeProject.id, externalIdentity: shot.id },
      })
        ?? await tx.remakeShot.findFirst({
          where: { remakeProjectId: remakeProject.id, stableKey },
        })
        ?? await tx.remakeShot.findFirst({
          where: { remakeProjectId: remakeProject.id, externalIdentity: { endsWith: `:${shot.id}` } },
        })
      const row = existing ?? await tx.remakeShot.upsert({
        where: { remakeProjectId_stableKey: { remakeProjectId: remakeProject.id, stableKey } },
        create: { remakeProjectId: remakeProject.id, stableKey, externalIdentity: shot.id, sequence: shot.shotNumber },
        update: { externalIdentity: shot.id, sequence: shot.shotNumber },
      })
      const latestRevision = tx.remakeShotRevision.findFirst
        ? await tx.remakeShotRevision.findFirst({ where: { shotId: row.id }, orderBy: { revision: 'desc' } })
        : null
      const nextRevision = Number(latestRevision?.revision ?? 0) + 1
      const createdRevision = await tx.remakeShotRevision.create({
        data: { shotId: row.id, revision: nextRevision, sourceRevision, lifecycleState: 'active', changeReason: 'scenedetect_import', payload: JSON.stringify(shot), keyframeMediaRefs: JSON.stringify(shot.mediaIds || {}), keyframeFrames: shot.keyframeFrames ? JSON.stringify(shot.keyframeFrames) : null },
      })
      // 导入时如有关键帧，立即生成动作表参考图（不需等状态设为 keep）
      const mediaIds = shot.mediaIds
      const frames = shot.keyframeFrames
      if (mediaIds?.first && mediaIds?.middle && mediaIds?.last && frames) {
        const sources = [
          { slot: 'start' as const, mediaId: mediaIds.first, timestamp: frames.first },
          { slot: 'middle' as const, mediaId: mediaIds.middle, timestamp: frames.middle },
          { slot: 'end' as const, mediaId: mediaIds.last, timestamp: frames.last },
        ]
        actionSheetTasks.push({ shotId: String(row.id), revisionId: String(createdRevision.id), sources, fingerprint: actionSheetFingerprint({ revisionId: String(createdRevision.id), sources }) })
      }
      await invalidateKeyframeOutputsForRevision({ tx: tx as unknown, shotId: String(row.id), revisionId: String(createdRevision.id), reason: 'scenedetect_import' })
      await invalidatePromptVersionsForShotRevision({ tx: tx as unknown, shotId: String(row.id), revisionId: String(createdRevision.id), reason: 'scenedetect_import' })
      await tx.remakeShot.update({
        where: { id: row.id },
        data: { sequence: shot.shotNumber, externalIdentity: shot.id, currentRevision: nextRevision, version: { increment: 1 }, reviewStatus: 'pending', needsReview: false },
      })
      await tx.remakeProvenanceRecord.create({
        data: { shotId: row.id, schema: 'scenedetect.v2', executor: parsed.provenance?.executorVersion ?? 'legacy_json_import', capability: parsed.provenance?.mode ?? 'analysis', payload: operationPayload(input.operationKey, project) },
      })
    }
    await tx.remakeProject.update({ where: { id: remakeProject.id }, data: { importStatus: 'analyzed' } })
    return { committed: true, shotCount: project.shots.length }
  })
  // 为导入成功的镜头批量提交动作表生成任务
  for (const task of actionSheetTasks) {
    try {
      await submitTask({
        userId: input.userId,
        locale: 'zh' as const,
        projectId: input.projectId,
        type: TASK_TYPE.REMAKE_KEYFRAME_ACTION_SHEET,
        targetType: 'remake_shot',
        targetId: task.shotId,
        dedupeKey: `remake-action-sheet:${task.revisionId}:${task.fingerprint}`,
        payload: { kind: 'action_sheet', projectId: input.projectId, shotId: task.shotId, revisionId: task.revisionId, confirmed: true, sources: task.sources, fingerprint: task.fingerprint },
        maxAttempts: 1,
      })
    } catch (err) {
      // 动作表生成失败不影响导入主流程
      console.error('[scenedetect-import] Failed to submit action sheet task for shot', task.shotId, err)
    }
  }
}
