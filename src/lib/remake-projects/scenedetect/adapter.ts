import { prisma } from '@/lib/prisma'
import { createExternalShotKey } from './id-map'
import { parseSceneDetectInput, type SceneDetectProject } from './contracts'

type Row = Record<string, unknown>

export function previewSceneDetectImport(input: { projectId: string; analysisId: string; payload: unknown }) {
  const project = parseSceneDetectInput(input.payload)
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

export async function commitSceneDetectImport(input: {
  projectId: string
  userId: string
  analysisId: string
  operationKey: string
  payload: unknown
}) {
  const project = parseSceneDetectInput(input.payload)
  const client = prisma as unknown as {
    project: { findUnique: (args: unknown) => Promise<Row | null> }
    remakeProject: { findUnique: (args: unknown) => Promise<Row | null>; update: (args: unknown) => Promise<Row> }
    remakeSource: { upsert: (args: unknown) => Promise<Row> }
    remakeShot: { upsert: (args: unknown) => Promise<Row> }
    remakeShotRevision: { create: (args: unknown) => Promise<Row> }
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
    await tx.remakeSource.upsert({
      where: { remakeProjectId: remakeProject.id },
      create: { remakeProjectId: remakeProject.id, status: 'analyzed' },
      update: { status: 'analyzed' },
    })
    for (const shot of project.shots) {
      const stableKey = createExternalShotKey(input.projectId, input.analysisId, shot.id)
      const row = await tx.remakeShot.upsert({
        where: { remakeProjectId_stableKey: { remakeProjectId: remakeProject.id, stableKey } },
        create: { remakeProjectId: remakeProject.id, stableKey, externalIdentity: shot.id, sequence: shot.shotNumber },
        update: { sequence: shot.shotNumber },
      })
      await tx.remakeShotRevision.create({
        data: { shotId: row.id, revision: 1, changeReason: 'scenedetect_import', payload: JSON.stringify(shot) },
      })
      await tx.remakeProvenanceRecord.create({
        data: { shotId: row.id, schema: 'scenedetect.v2', executor: 'scenedetect', capability: 'analysis', payload: operationPayload(input.operationKey, project) },
      })
    }
    await tx.remakeProject.update({ where: { id: remakeProject.id }, data: { importStatus: 'analyzed' } })
    return { committed: true, shotCount: project.shots.length }
  })
}
