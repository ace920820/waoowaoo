/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID, createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { parseSceneDetectInput, toSceneDetectProject, type SceneDetectProject, type SceneDetectShot } from './contracts'
import { invalidatePromptVersionsForShotRevision } from '../prompt/service'
import { invalidateKeyframeOutputsForRevision } from '../keyframes/invalidation'
import { actionSheetFingerprint } from '../keyframes/action-sheet'

type Row = Record<string, any>
type Client = any

export function projectConcurrencyToken(input: { sourceRevision?: number | null; shots: Array<{ id: string; currentRevision?: number | null; version?: number | null }> }): string {
  const value = JSON.stringify({ sourceRevision: input.sourceRevision ?? null, shots: input.shots.map((shot) => [shot.id, shot.currentRevision ?? null, shot.version ?? 0]) })
  return `scenedetect.v1.${createHash('sha256').update(value).digest('base64url')}`
}

function payloadFor(shot: SceneDetectShot) {
  const copy = { ...shot, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', mediaIds: shot.mediaIds }
  return JSON.stringify(copy)
}

function samePayload(a: unknown, b: string | null | undefined): boolean {
  if (!b) return false
  try {
    const parsed = JSON.parse(b) as Record<string, unknown>
    const value = a as Record<string, unknown>
    return JSON.stringify({ ...value, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '' }) === JSON.stringify({ ...parsed, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '' })
  } catch { return false }
}

function latestRevision(shot: Row): Row | null {
  const rows = Array.isArray(shot.revisions) ? shot.revisions : []
  return rows.filter((r: Row) => r.lifecycleState !== 'retired').sort((a: Row, b: Row) => Number(b.revision ?? 0) - Number(a.revision ?? 0))[0] ?? rows.sort((a: Row, b: Row) => Number(b.revision ?? 0) - Number(a.revision ?? 0))[0] ?? null
}

export async function commitNativeProjectMutation(input: { projectId: string; userId: string; project: unknown; ifMatch: string; operationKey?: string }) {
  const project = parseSceneDetectInput(input.project)
  const client = prisma as Client
  const owner = await client.project.findUnique({ where: { id: input.projectId }, select: { userId: true, type: true } })
  if (!owner || owner.userId !== input.userId || owner.type !== 'remake') throw new Error('REMAKE_PROJECT_ACCESS_DENIED')

  const actionSheetTasks: Array<{ shotId: string; revisionId: string; fingerprint: string; sources: Array<{ slot: 'start' | 'middle' | 'end'; mediaId: string; timestamp: number }> }> = []
  const result = await client.$transaction(async (tx: Client) => {
    const meta = await tx.remakeProject.findUnique({ where: { projectId: input.projectId }, include: { currentSource: true, shots: { include: { revisions: true, outputs: { select: { id: true } } } } } })
    if (!meta) throw new Error('REMAKE_PROJECT_NOT_FOUND')
    const currentToken = projectConcurrencyToken({ sourceRevision: meta.currentSource?.sourceRevision, shots: (meta.shots ?? []).map((s: Row) => ({ id: s.id, currentRevision: s.currentRevision, version: s.version })) })
    if (input.ifMatch !== currentToken) {
      const snapshot = await tx.project.findUnique({ where: { id: input.projectId }, include: { remakeProject: { include: { currentSource: true, shots: { include: { revisions: true, provenance: true }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } } } } })
      let currentProject: SceneDetectProject | null = null
      try { if (snapshot) currentProject = toSceneDetectProject(snapshot as any) } catch { currentProject = null }
      throw Object.assign(new Error('SCENEDETECT_CONFLICT'), { code: 'SCENEDETECT_CONFLICT', currentToken, currentProject })
    }

    const byId = new Map<string, Row>((meta.shots ?? []).map((shot: Row) => [String(shot.id), shot]))
    const seen = new Set<string>()
    const idRemap: Record<string, string> = {}
    const nextVersions = new Map<string, number>((meta.shots ?? []).map((s: Row) => [String(s.id), Number(s.version ?? 0)]))
    let changed = false
    let revision = 0
    for (const incoming of project.shots) {
      const existing = byId.get(incoming.id)
      const row = existing ?? await tx.remakeShot.create({ data: { remakeProjectId: meta.id, stableKey: randomUUID(), externalIdentity: incoming.id, sequence: incoming.shotNumber } })
      if (!existing) idRemap[incoming.id] = String(row.id)
      const current = latestRevision(row)
      const normalized = { ...incoming, id: String(row.id) }
      seen.add(String(row.id))
      if (current && samePayload(normalized, current.payload)) continue
      changed = true
      const nextRevision = Number(row.currentRevision ?? current?.revision ?? 0) + 1
      const created = await tx.remakeShotRevision.create({ data: { shotId: row.id, revision: nextRevision, lifecycleState: 'active', sourceRevision: meta.currentSource?.sourceRevision ?? null, changeReason: input.operationKey || 'native_mutation', payload: payloadFor(normalized), keyframeFrames: normalized.keyframeFrames ? JSON.stringify(normalized.keyframeFrames) : null } })
      const mediaIds = normalized.mediaIds
      const frames = normalized.keyframeFrames
      if (normalized.status === 'keep' && mediaIds?.first && mediaIds.middle && mediaIds.last && frames) {
        const sources = [
          { slot: 'start' as const, mediaId: mediaIds.first, timestamp: frames.first },
          { slot: 'middle' as const, mediaId: mediaIds.middle, timestamp: frames.middle },
          { slot: 'end' as const, mediaId: mediaIds.last, timestamp: frames.last },
        ]
        actionSheetTasks.push({ shotId: String(row.id), revisionId: String(created.id), sources, fingerprint: actionSheetFingerprint({ revisionId: String(created.id), sources }) })
      }
      if (current) await tx.remakeShotRevision.update({ where: { id: current.id }, data: { lifecycleState: 'retired' } })
      const hasOutputs = Array.isArray(row.outputs) && row.outputs.length > 0
      await tx.remakeShot.update({ where: { id: row.id }, data: { sequence: incoming.shotNumber, currentRevision: nextRevision, version: { increment: 1 }, ...(hasOutputs || incoming.status !== 'pending' ? { needsReview: true, reviewStatus: 'needs_review' } : {}) } })
      nextVersions.set(String(row.id), Number(nextVersions.get(String(row.id)) ?? 0) + 1)
      await invalidateKeyframeOutputsForRevision({ tx, shotId: row.id, revisionId: created.id, reason: input.operationKey || 'native_mutation' })
      await invalidatePromptVersionsForShotRevision({ tx, shotId: row.id, revisionId: created.id, reason: input.operationKey || 'native_mutation' })
      revision = Math.max(revision, nextRevision)
    }
    for (const row of meta.shots ?? []) {
      if (seen.has(String(row.id))) continue
      const current = latestRevision(row)
      if (!current || current.lifecycleState === 'retired') continue
      changed = true
      const nextRevision = Number(row.currentRevision ?? current.revision ?? 0) + 1
      const created = await tx.remakeShotRevision.create({ data: { shotId: row.id, revision: nextRevision, lifecycleState: 'retired', sourceRevision: meta.currentSource?.sourceRevision ?? null, changeReason: 'delete', payload: current.payload } })
      await tx.remakeShotRevision.update({ where: { id: current.id }, data: { lifecycleState: 'retired' } })
      await tx.remakeShot.update({ where: { id: row.id }, data: { currentRevision: nextRevision, version: { increment: 1 }, reviewStatus: 'needs_review', needsReview: true } })
      nextVersions.set(String(row.id), Number(nextVersions.get(String(row.id)) ?? 0) + 1)
      await invalidateKeyframeOutputsForRevision({ tx, shotId: row.id, revisionId: created.id, reason: 'delete' })
      await invalidatePromptVersionsForShotRevision({ tx, shotId: row.id, revisionId: created.id, reason: 'delete' })
      revision = Math.max(revision, nextRevision)
    }
    if (!changed) return { changed: false, project, token: currentToken, idRemap: {}, revision: 0 }
    const updated = await tx.project.findUnique({ where: { id: input.projectId }, include: { remakeProject: { include: { currentSource: true, shots: { include: { revisions: true, provenance: true }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } } } } })
    let canonical = project
    try { if (updated) canonical = toSceneDetectProject(updated as any) } catch { canonical = project }
    const token = projectConcurrencyToken({ sourceRevision: meta.currentSource?.sourceRevision, shots: (meta.shots ?? []).map((s: Row) => ({ id: s.id, currentRevision: s.currentRevision, version: nextVersions.get(String(s.id)) ?? Number(s.version ?? 0) })) })
    return { changed: true, project: canonical, token, idRemap, revision }
  })
  for (const task of actionSheetTasks) {
    await submitTask({
      userId: input.userId,
      locale: 'zh',
      projectId: input.projectId,
      type: TASK_TYPE.REMAKE_KEYFRAME_ACTION_SHEET,
      targetType: 'remake_shot',
      targetId: task.shotId,
      dedupeKey: `remake-action-sheet:${task.revisionId}:${task.fingerprint}`,
      payload: { kind: 'action_sheet', projectId: input.projectId, shotId: task.shotId, revisionId: task.revisionId, confirmed: true, sources: task.sources, fingerprint: task.fingerprint },
      maxAttempts: 1,
    })
  }
  return result
}
