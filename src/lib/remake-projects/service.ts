import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { evaluateSceneDetectReviewGate } from './scenedetect/review-gate'

type Row = Record<string, unknown>

type RemakeClient = {
  project: {
    findFirst: (args: unknown) => Promise<Row | null>
    findUnique: (args: unknown) => Promise<Row | null>
    create: (args: unknown) => Promise<Row>
  }
  remakeProject: { create: (args: unknown) => Promise<Row> }
  remakeShot: { findUnique: (args: unknown) => Promise<Row | null>; update: (args: unknown) => Promise<Row> }
  remakeShotRevision: { create: (args: unknown) => Promise<Row> }
  remakeInvalidation: { createMany: (args: unknown) => Promise<Row> }
  task: { create: (args: unknown) => Promise<Row>; findMany: (args: unknown) => Promise<Row[]> }
}

function remakeClient(): RemakeClient {
  return prisma as unknown as RemakeClient
}

type TransactionClient = RemakeClient & {
  $transaction: <T>(callback: (tx: RemakeClient) => Promise<T>) => Promise<T>
}

export async function createRemakeProject(input: {
  userId: string
  name: string
  description: string | null
  creationRequestId: string
}): Promise<{ project: Row; created: boolean }> {
  const transactionClient = prisma as unknown as TransactionClient
  return transactionClient.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { userId: input.userId, remakeProject: { creationRequestId: input.creationRequestId } },
      include: { remakeProject: true },
    })
    if (existing) return { project: existing, created: false }

    const project = await tx.project.create({
      data: { name: input.name, description: input.description, userId: input.userId, type: 'remake' },
    })
    const remakeProject = await tx.remakeProject.create({
        data: { projectId: String(project.id), creationRequestId: input.creationRequestId, importStatus: 'not_imported' },
    })
    await tx.task.create({
      data: {
        userId: input.userId,
        projectId: String(project.id),
        type: TASK_TYPE.REMAKE_PROJECT_INITIALIZE,
        targetType: 'remake_project',
        targetId: String(remakeProject.id),
        status: 'queued',
        payload: { meta: { locale: 'zh' } },
      },
    })
    return { project, created: true }
  })
}

export async function getRemakeProjectSnapshot(input: { projectId: string; userId: string }) {
  const client = remakeClient()
  const project = await client.project.findUnique({
    where: { id: input.projectId },
    include: { remakeProject: { include: { currentSource: true, shots: { include: { revisions: true, provenance: true }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } } } },
  })
  if (!project) return null
  const projectRow = project as Row
  if (projectRow.userId !== input.userId || projectRow.type !== 'remake') return null
  const remake = projectRow.remakeProject as Row | null | undefined
  const tasks = await client.task.findMany({
    where: { projectId: input.projectId, userId: input.userId },
    select: { id: true, type: true, targetType: true, targetId: true, status: true, errorCode: true, errorMessage: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return {
    project: { id: projectRow.id, name: projectRow.name, description: projectRow.description, type: projectRow.type },
    source: (() => {
      const current = remake?.currentSource as Row | null | undefined
      return {
        status: current?.status ?? remake?.importStatus ?? 'not_imported',
        mediaId: current?.mediaId ?? null,
        ...(current ? {
          sourceRevision: current.sourceRevision ?? null,
          metadata: current.probeMetadata ? (typeof current.probeMetadata === 'string' ? JSON.parse(current.probeMetadata) : current.probeMetadata) : null,
        } : {}),
      }
    })(),
    shots: ((remake?.shots as Row[] | undefined) ?? []).map((shot) => {
      const revisions = ((shot.revisions as Row[] | undefined) ?? [])
      const current = revisions.find((revision) => Number(revision.revision) === Number(shot.currentRevision)) ?? revisions.find((revision) => revision.lifecycleState === 'active')
      const payload = (() => { try { return current?.payload ? JSON.parse(String(current.payload)) as Row : {} } catch { return {} } })()
      const refs = (() => { try { return current?.keyframeMediaRefs ? JSON.parse(String(current.keyframeMediaRefs)) as Row : {} } catch { return {} } })()
      const review = evaluateSceneDetectReviewGate({
        status: payload.status === 'keep' || payload.status === 'discard' ? payload.status : 'pending', needsReview: Boolean(shot.needsReview),
        revisionState: typeof current?.lifecycleState === 'string' ? current.lifecycleState : null,
        sourceRevision: typeof current?.sourceRevision === 'number' ? current.sourceRevision : null,
        currentSourceRevision: typeof (remake?.currentSource as Row | undefined)?.sourceRevision === 'number' ? (remake?.currentSource as Row).sourceRevision as number : null,
        keyframeMediaRefs: refs,
      })
      return {
      id: shot.id,
      stableKey: shot.stableKey,
      sequence: shot.sequence,
      reviewStatus: shot.reviewStatus,
      needsReview: shot.needsReview,
      currentRevision: shot.currentRevision ?? null,
      version: shot.version ?? 0,
      review,
      revisions: revisions.map((revision) => ({ id: revision.id, revision: revision.revision, sourceRevision: revision.sourceRevision ?? null, lifecycleState: revision.lifecycleState, changeReason: revision.changeReason, payload: revision.payload ?? null, keyframeMediaRefs: revision.keyframeMediaRefs ?? null })),
      provenance: ((shot.provenance as Row[] | undefined) ?? []).map((record) => ({ id: record.id, schema: record.schema, executor: record.executor, capability: record.capability, payload: record.payload ?? null })),
    }}),
    tasks,
  }
}

export async function createRemakeShotRevision(input: { shotId: string; changeReason: string; userId: string }) {
  const client = remakeClient()
  const shot = await client.remakeShot.findUnique({ where: { id: input.shotId }, include: { revisions: { orderBy: { revision: 'desc' }, take: 1 }, outputs: { select: { id: true } }, remakeProject: { select: { project: { select: { userId: true } } } } } })
  if (!shot) return null
  const shotRow = shot as Row
  const remakeProject = shotRow.remakeProject as Row | undefined
  const project = remakeProject?.project as Row | undefined
  if (project?.userId !== input.userId) return null
  const revisions = (shotRow.revisions as Row[] | undefined) ?? []
  const outputs = (shotRow.outputs as Row[] | undefined) ?? []
  const revision = await client.remakeShotRevision.create({
    data: { shotId: String(shotRow.id), revision: Number(revisions[0]?.revision ?? 0) + 1, changeReason: input.changeReason },
  })
  await client.remakeShot.update({ where: { id: shotRow.id }, data: { reviewStatus: 'needs_review', needsReview: true } })
  if (outputs.length) {
    await client.remakeInvalidation.createMany({
      data: outputs.map((output) => ({ shotId: shotRow.id, revisionId: revision.id, reason: input.changeReason, status: 'needs_review', outputVersionId: output.id })),
    })
  }
  return { revision, reviewStatus: 'needs_review' as const }
}
