import { prisma } from '@/lib/prisma'
import { extractStorageKey } from '@/lib/storage'
import { createExternalShotKey } from './id-map'
import { parseSceneDetectInput, type SceneDetectProject } from './contracts'
import { parseSceneDetectResultEnvelope, wrapLegacySceneDetectProject } from './result-envelope'

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
    remakeShot: { upsert: (args: unknown) => Promise<Row>; update: (args: unknown) => Promise<Row> }
    remakeShotRevision: { create: (args: unknown) => Promise<Row>; updateMany: (args: unknown) => Promise<Row>; findFirst?: (args: unknown) => Promise<Row | null> }
    remakeProvenanceRecord: { findFirst: (args: unknown) => Promise<Row | null>; create: (args: unknown) => Promise<Row> }
    $transaction: <T>(callback: (tx: typeof client) => Promise<T>) => Promise<T>
  }
  const owner = await client.project.findUnique({ where: { id: input.projectId }, select: { userId: true, type: true } })
  if (!owner || owner.userId !== input.userId || owner.type !== 'remake') throw new Error('Remake project access denied')
  const existingOperation = await client.remakeProvenanceRecord.findFirst({ where: { shot: { remakeProjectId: input.projectId }, payload: { contains: `\"operationKey\":\"${input.operationKey}\"` } } })
  if (existingOperation) return { committed: false, replayOf: existingOperation.id }

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
      const row = await tx.remakeShot.upsert({
        where: { remakeProjectId_stableKey: { remakeProjectId: remakeProject.id, stableKey } },
        create: { remakeProjectId: remakeProject.id, stableKey, externalIdentity: shot.id, sequence: shot.shotNumber },
        update: { externalIdentity: shot.id, sequence: shot.shotNumber },
      })
      const latestRevision = tx.remakeShotRevision.findFirst
        ? await tx.remakeShotRevision.findFirst({ where: { shotId: row.id }, orderBy: { revision: 'desc' } })
        : null
      const nextRevision = Number(latestRevision?.revision ?? 0) + 1
      await tx.remakeShotRevision.create({
        data: { shotId: row.id, revision: nextRevision, sourceRevision, lifecycleState: 'active', changeReason: 'scenedetect_import', payload: JSON.stringify(shot), keyframeMediaRefs: JSON.stringify(shot.mediaIds || {}) },
      })
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
}
