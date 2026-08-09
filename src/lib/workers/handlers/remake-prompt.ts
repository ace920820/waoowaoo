/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { extractStorageKey, getObjectBuffer } from '@/lib/storage'
import { getMediaObjectById, resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { parsePromptAnalysis, type PromptInputSnapshot, type PromptTargetKey } from '@/lib/remake-projects/prompt/contracts'
import { persistImagePromptVersion, persistVideoPromptRunAtomically } from '@/lib/remake-projects/prompt/service'
import { parseRemakePromptTaskPayload, type RemakePromptImageTaskPayload } from '@/lib/remake-projects/prompt/task-contract'
import { runCodexPromptAnalysis } from '@/lib/remake-projects/prompt/executor'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive } from '../utils'

type Row = Record<string, any>

export async function resolvePromptMediaKey(value: string | undefined): Promise<string> {
  const raw = value || ''
  const media = raw ? await getMediaObjectById(raw) : null
  const key = media?.storageKey || await resolveStorageKeyFromMediaValue(raw) || extractStorageKey(raw) || raw
  if (!key || key.length > 1024) throw new Error('REMAKE_PROMPT_MEDIA_MISSING')
  return key
}

function targetKeyForSlot(slot: RemakePromptImageTaskPayload['slot']): Exclude<PromptTargetKey, 'video'> {
  return `image:${slot}` as Exclude<PromptTargetKey, 'video'>
}

function frameRefKeyForSlot(slot: RemakePromptImageTaskPayload['slot']) {
  return slot === 'start' ? 'first' : slot === 'end' ? 'last' : 'middle'
}

function parseRevision(row: Row): Row {
  let payload: Row = {}
  try { payload = row.payload ? JSON.parse(String(row.payload)) : {} } catch { /* stale data is rejected by the service */ }
  let refs: Row = {}
  try { refs = row.keyframeMediaRefs ? JSON.parse(String(row.keyframeMediaRefs)) : {} } catch { /* stale data is rejected by the service */ }
  return { ...row, payload, refs }
}

function imagePrompt(snapshot: PromptInputSnapshot, slot: string) {
  return `$image-to-structured-prompt\nAnalyze exactly one reference image for Shot ${snapshot.stableKey}, slot ${slot}. Return one JSONL final event with the complete contracted sections, including integratedGenerationPrompt and negativeConstraints. Keep facts, inferences, and recommendations separate.`
}

function videoPrompt(sourceName: string, snapshots: PromptInputSnapshot[]) {
  const shots = snapshots.map((snapshot) => ({ stableShotId: snapshot.stableKey, shotRevision: snapshot.shotRevision, keyframeMediaRefs: snapshot.keyframeMediaRefs }))
  return `Analyze this whole source video (${sourceName}) once. Confirmed Shot boundaries and Start/Middle/End frame references are included below. Return one final JSONL event containing exactly one result per stableShotId and the contracted Video Prompt fields. Do not omit or duplicate a Shot.\n${JSON.stringify(shots)}`
}

function assertSnapshotMatches(current: Row, expected: PromptInputSnapshot) {
  const revision = parseRevision(current.revisions?.find((row: Row) => Number(row.revision) === expected.shotRevision) || {})
  if (!revision.id || revision.id !== expected.shotRevisionId || Number(current.currentRevision) !== expected.shotRevision) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  const currentRefs = revision.refs
  if (JSON.stringify(currentRefs) !== JSON.stringify(expected.keyframeMediaRefs)) throw new Error('REMAKE_PROMPT_INPUT_STALE')
}

async function findShot(job: Job<TaskJobData>, snapshot: PromptInputSnapshot) {
  const shot = await prisma.remakeShot.findUnique({ where: { id: snapshot.shotId }, include: { revisions: true, remakeProject: { include: { project: true, currentSource: true } } } }) as Row | null
  if (!shot || shot.remakeProject?.project?.id !== job.data.projectId || shot.remakeProject?.project?.userId !== job.data.userId) throw new Error('REMAKE_PROMPT_ACCESS_DENIED')
  if (!shot.remakeProject.currentSource || Number(shot.remakeProject.currentSource.sourceRevision) !== snapshot.sourceRevision) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  assertSnapshotMatches(shot, snapshot)
  return shot
}

export async function handleRemakeImagePromptTask(job: Job<TaskJobData>) {
  const payload = parseRemakePromptTaskPayload(job.data.payload)
  if (payload.kind !== 'image') throw new Error('REMAKE_PROMPT_TASK_KIND_INVALID')
  const snapshot = payload.inputSnapshot
  const shot = await findShot(job, snapshot)
  const revision = parseRevision(shot.revisions.find((row: Row) => Number(row.revision) === snapshot.shotRevision))
  const key = await resolvePromptMediaKey(String(revision.refs[frameRefKeyForSlot(payload.slot)] || ''))
  await assertTaskActive(job, 'before_prompt_cli')
  await reportTaskProgress(job, 20, { stage: 'source-read', displayMode: 'detail' })
  const bytes = await getObjectBuffer(key)
  await reportTaskProgress(job, 40, { stage: 'executor-call', displayMode: 'indeterminate' })
  const analysis = await runCodexPromptAnalysis({ targetKey: targetKeyForSlot(payload.slot), prompt: imagePrompt(snapshot, payload.slot), media: [{ name: `${payload.slot}.bin`, bytes }] })
  await assertTaskActive(job, 'after_prompt_cli')
  const parsed = parsePromptAnalysis(targetKeyForSlot(payload.slot), analysis.result)
  const version = await persistImagePromptVersion({ projectId: job.data.projectId, shotId: snapshot.shotId, targetKey: targetKeyForSlot(payload.slot), inputSnapshot: snapshot, analysis: parsed, rawOutput: analysis.rawOutput, provenance: { taskId: job.data.taskId, skillVersion: 'image-to-structured-prompt', schemaVersion: 'prompt.v1', modelVersion: 'codex', executorVersion: 'codex-cli.v1' } })
  return { kind: 'image', versionId: version.id, sessionId: analysis.sessionId, inputFingerprint: payload.inputFingerprint }
}

export async function handleRemakeVideoPromptTask(job: Job<TaskJobData>) {
  const payload = parseRemakePromptTaskPayload(job.data.payload)
  if (payload.kind !== 'video') throw new Error('REMAKE_PROMPT_TASK_KIND_INVALID')
  const snapshots = payload.snapshots
  if (!snapshots.length) throw new Error('REMAKE_PROMPT_VIDEO_INPUT_INVALID')
  const project = await prisma.project.findUnique({ where: { id: job.data.projectId }, include: { remakeProject: { include: { currentSource: true, shots: { include: { revisions: true } } } } } }) as Row | null
  if (!project || project.userId !== job.data.userId || project.type !== 'remake' || !project.remakeProject?.currentSource?.storageKey) throw new Error('REMAKE_PROMPT_ACCESS_DENIED')
  if (Number(project.remakeProject.currentSource.sourceRevision) !== payload.sourceRevision) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  const shotsById = new Map<string, Row>((project.remakeProject.shots || []).map((shot: Row) => [shot.id, shot]))
  for (const snapshot of snapshots) {
    const shot = shotsById.get(snapshot.shotId)
    if (!shot) throw new Error('REMAKE_PROMPT_INPUT_STALE')
    assertSnapshotMatches(shot, snapshot)
  }
  await assertTaskActive(job, 'before_prompt_cli')
  await reportTaskProgress(job, 20, { stage: 'source-read', displayMode: 'detail' })
  const media: Array<{ name: string; bytes: Buffer }> = [{ name: 'source-video.bin', bytes: await getObjectBuffer(await resolvePromptMediaKey(String(project.remakeProject.currentSource.storageKey))) }]
  for (const snapshot of snapshots) {
    const shot = shotsById.get(snapshot.shotId) as Row
    const revision = parseRevision(shot.revisions.find((row: Row) => Number(row.revision) === snapshot.shotRevision))
    for (const slot of ['first', 'middle', 'last']) media.push({ name: `${snapshot.stableKey}-${slot}.bin`, bytes: await getObjectBuffer(await resolvePromptMediaKey(String(revision.refs[slot] || ''))) })
  }
  await reportTaskProgress(job, 40, { stage: 'executor-call', displayMode: 'indeterminate' })
  const analysis = await runCodexPromptAnalysis({ targetKey: 'video', prompt: videoPrompt(String(project.remakeProject.currentSource.fileName || 'source.mp4'), snapshots), media })
  await assertTaskActive(job, 'after_prompt_cli')
  const raw = analysis.result as Row | Row[]
  const rows: Row[] = Array.isArray(raw) ? raw : (Array.isArray((raw as Row).shots) ? (raw as Row).shots as Row[] : [])
  const results = rows.map((row: Row) => ({ stableShotId: String(row.stableShotId || row.shotId || ''), analysis: parsePromptAnalysis('video', row.analysis || row.result), rawOutput: typeof row.rawOutput === 'string' ? row.rawOutput : null }))
  if (results.some((row) => !row.stableShotId || !row.analysis)) throw new Error('REMAKE_PROMPT_VIDEO_RESULT_INVALID')
  const persisted = await persistVideoPromptRunAtomically({ projectId: job.data.projectId, expectedStableShotIds: snapshots.map((snapshot) => snapshot.stableKey), results, rawOutput: analysis.rawOutput, provenance: { taskId: job.data.taskId, schemaVersion: 'prompt.v1', modelVersion: 'codex', executorVersion: 'codex-cli.v1' } })
  return { kind: 'video', runId: persisted.run.id, versionIds: persisted.versions.map((version: Row) => version.id), sessionId: analysis.sessionId, inputFingerprint: payload.inputFingerprint }
}

export async function processRemakePromptTask(job: Job<TaskJobData>) {
  return job.data.type === 'remake_image_prompt_analyze'
    ? handleRemakeImagePromptTask(job)
    : handleRemakeVideoPromptTask(job)
}
