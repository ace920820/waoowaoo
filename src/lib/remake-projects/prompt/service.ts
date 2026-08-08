/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  imagePromptAnalysisSchema,
  parsePromptAnalysis,
  promptInputSnapshotSchema,
  promptProvenanceSchema,
  promptTargetKeySchema,
  type PromptInputSnapshot,
  type PromptProvenance,
  type PromptTargetKey,
  videoPromptAnalysisSchema,
} from './contracts'

type Client = any
type PromptContent = {
  parsedSections: unknown
  integratedGenerationPrompt: string
  negativeConstraints?: string[]
  rawOutput?: string | null
}

const MAX_RAW_OUTPUT_BYTES = 512 * 1024

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function promptInputFingerprint(snapshot: PromptInputSnapshot): string {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex')
}

function keyframeRefs(value: unknown): Record<string, string> {
  if (!value) return {}
  if (typeof value === 'string') {
    try { return keyframeRefs(JSON.parse(value)) } catch { return {} }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

async function currentInput(tx: Client, input: { projectId: string; shotId: string }) {
  const shot = await tx.remakeShot.findUnique({
    where: { id: input.shotId },
    include: {
      remakeProject: { include: { project: true, currentSource: true } },
      revisions: { orderBy: { revision: 'desc' } },
    },
  })
  const revision = shot?.revisions?.find((row: any) => Number(row.revision) === Number(shot.currentRevision))
  if (!shot || shot.remakeProject?.project?.id !== input.projectId || !revision || revision.lifecycleState === 'retired' || !shot.remakeProject.currentSource) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  return promptInputSnapshotSchema.parse({
    projectId: input.projectId,
    remakeProjectId: shot.remakeProject.id,
    shotId: shot.id,
    stableKey: shot.stableKey,
    sourceRevision: Number(shot.remakeProject.currentSource.sourceRevision),
    shotRevision: Number(revision.revision),
    shotRevisionId: revision.id,
    keyframeMediaRefs: keyframeRefs(revision.keyframeMediaRefs),
  })
}

export async function assertPromptInputCurrent(tx: Client, snapshot: PromptInputSnapshot): Promise<void> {
  const parsed = promptInputSnapshotSchema.parse(snapshot)
  const current = await currentInput(tx, parsed)
  if (promptInputFingerprint(current) !== promptInputFingerprint(parsed)) throw new Error('REMAKE_PROMPT_INPUT_STALE')
}

export async function ensurePromptTrack(input: { projectId: string; shotId: string; targetKey: PromptTargetKey; tx?: Client }) {
  const targetKey = promptTargetKeySchema.parse(input.targetKey)
  const client = input.tx ?? prisma as Client
  const snapshot = await currentInput(client, input)
  return client.remakePromptTrack.upsert({
    where: { shotId_targetKey: { shotId: input.shotId, targetKey } },
    create: { remakeProjectId: snapshot.remakeProjectId, shotId: input.shotId, targetKey },
    update: {},
  })
}

export async function appendPromptVersion(input: {
  projectId: string
  shotId: string
  targetKey: PromptTargetKey
  inputSnapshot: PromptInputSnapshot
  content: PromptContent
  provenance?: PromptProvenance
  runId?: string | null
  tx?: Client
}) {
  const targetKey = promptTargetKeySchema.parse(input.targetKey)
  const snapshot = promptInputSnapshotSchema.parse(input.inputSnapshot)
  const provenance = promptProvenanceSchema.parse(input.provenance ?? {})
  const analysis = parsePromptAnalysis(targetKey, input.content.parsedSections)
  const promptFields = targetKey === 'video'
    ? { integratedGenerationPrompt: videoPromptAnalysisSchema.parse(analysis).coreEvent, negativeConstraints: null }
    : (() => {
      const image = imagePromptAnalysisSchema.parse(analysis)
      return { integratedGenerationPrompt: image.integratedGenerationPrompt, negativeConstraints: image.negativeConstraints }
    })()
  const rawOutput = input.content.rawOutput ?? null
  if (rawOutput && Buffer.byteLength(rawOutput, 'utf8') > MAX_RAW_OUTPUT_BYTES) throw new Error('REMAKE_PROMPT_RAW_OUTPUT_TOO_LARGE')
  const write = async (tx: Client) => {
    await assertPromptInputCurrent(tx, snapshot)
    const track = await ensurePromptTrack({ projectId: input.projectId, shotId: input.shotId, targetKey, tx })
    const latest = await tx.remakePromptVersion.findFirst({ where: { trackId: track.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } })
    return tx.remakePromptVersion.create({
      data: {
        trackId: track.id,
        runId: input.runId ?? null,
        shotRevisionId: snapshot.shotRevisionId,
        versionNumber: Number(latest?.versionNumber ?? 0) + 1,
        status: 'pending_review',
        inputFingerprint: promptInputFingerprint(snapshot),
        inputSnapshot: snapshot,
        parsedSections: analysis,
        integratedGenerationPrompt: promptFields.integratedGenerationPrompt,
        negativeConstraints: promptFields.negativeConstraints,
        rawOutput,
        taskId: provenance.taskId ?? null,
        skillVersion: provenance.skillVersion ?? null,
        schemaVersion: provenance.schemaVersion ?? null,
        modelVersion: provenance.modelVersion ?? null,
        executorVersion: provenance.executorVersion ?? null,
      },
    })
  }
  return input.tx ? write(input.tx) : (prisma as Client).$transaction(write)
}

export async function approveAndAdoptPromptVersion(input: { projectId: string; shotId: string; versionId: string; reviewerId: string; tx?: Client }) {
  const write = async (tx: Client) => {
    const version = await tx.remakePromptVersion.findUnique({
      where: { id: input.versionId },
      include: { track: true },
    })
    if (!version || version.track.shotId !== input.shotId || version.track.remakeProject?.projectId === undefined) {
      const track = version?.track
      if (!track) throw new Error('REMAKE_PROMPT_VERSION_NOT_FOUND')
    }
    const track = version.track
    const project = await tx.remakeProject.findUnique({ where: { id: track.remakeProjectId }, select: { projectId: true } })
    if (!project || project.projectId !== input.projectId || track.shotId !== input.shotId) throw new Error('REMAKE_PROMPT_ACCESS_DENIED')
    await assertPromptInputCurrent(tx, promptInputSnapshotSchema.parse(version.inputSnapshot))
    await tx.remakePromptVersion.update({ where: { id: version.id }, data: { status: 'approved', reviewerId: input.reviewerId, reviewedAt: new Date() } })
    return tx.remakePromptTrack.update({ where: { id: track.id }, data: { adoptedVersionId: version.id } })
  }
  return input.tx ? write(input.tx) : (prisma as Client).$transaction(write)
}

export async function getPromptVersionHistory(input: { projectId: string; shotId: string; targetKey: PromptTargetKey }) {
  const targetKey = promptTargetKeySchema.parse(input.targetKey)
  return (prisma as Client).remakePromptVersion.findMany({
    where: { track: { shotId: input.shotId, targetKey, remakeProject: { projectId: input.projectId } } },
    orderBy: { versionNumber: 'desc' },
  })
}

export async function getAdoptedPromptForGeneration(input: { projectId: string; shotId: string; targetKey: PromptTargetKey }) {
  const targetKey = promptTargetKeySchema.parse(input.targetKey)
  const client = prisma as Client
  const track = await client.remakePromptTrack.findFirst({
    where: { shotId: input.shotId, targetKey, remakeProject: { projectId: input.projectId } },
    include: { adoptedVersion: { include: { invalidations: true } }, remakeProject: { select: { projectId: true } } },
  })
  const version = track?.adoptedVersion
  if (!track || track.remakeProject.projectId !== input.projectId || !version || version.status !== 'approved' || version.invalidations.length) return null
  try {
    await assertPromptInputCurrent(client, promptInputSnapshotSchema.parse(version.inputSnapshot))
    return version
  } catch (error) {
    if (error instanceof Error && error.message === 'REMAKE_PROMPT_INPUT_STALE') return null
    throw error
  }
}
