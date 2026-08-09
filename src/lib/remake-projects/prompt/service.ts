/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { evaluateSceneDetectReviewGate } from '../scenedetect/review-gate'
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
  let payload: Record<string, unknown> = {}
  try { payload = revision.payload ? JSON.parse(revision.payload) : {} } catch { payload = {} }
  const refs = keyframeRefs(revision.keyframeMediaRefs)
  const gate = evaluateSceneDetectReviewGate({
    status: payload.status === 'keep' || payload.status === 'discard' ? payload.status : 'pending',
    needsReview: Boolean(shot.needsReview),
    revisionState: revision.lifecycleState,
    sourceRevision: Number(revision.sourceRevision),
    currentSourceRevision: Number(shot.remakeProject.currentSource.sourceRevision),
    keyframeMediaRefs: refs,
  })
  if (!gate.promptEligible) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  return promptInputSnapshotSchema.parse({
    projectId: input.projectId,
    remakeProjectId: shot.remakeProject.id,
    shotId: shot.id,
    stableKey: shot.stableKey,
    sourceRevision: Number(shot.remakeProject.currentSource.sourceRevision),
    shotRevision: Number(revision.revision),
    shotRevisionId: revision.id,
    keyframeMediaRefs: refs,
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
  if (snapshot.projectId !== input.projectId || snapshot.shotId !== input.shotId) throw new Error('REMAKE_PROMPT_INPUT_MISMATCH')
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
    if (!version) throw new Error('REMAKE_PROMPT_VERSION_NOT_FOUND')
    const track = version.track
    const project = await tx.remakeProject.findUnique({ where: { id: track.remakeProjectId }, include: { project: { select: { id: true, userId: true } } } })
    if (!project || project.projectId !== input.projectId || project.project.userId !== input.reviewerId || track.shotId !== input.shotId) throw new Error('REMAKE_PROMPT_ACCESS_DENIED')
    if (version.invalidatedAt || version.status === 'invalidated') throw new Error('REMAKE_PROMPT_INPUT_STALE')
    await assertPromptInputCurrent(tx, promptInputSnapshotSchema.parse(version.inputSnapshot))
    await tx.remakePromptVersion.update({ where: { id: version.id }, data: { status: 'approved', reviewerId: input.reviewerId, reviewedAt: new Date() } })
    return tx.remakePromptTrack.update({ where: { id: track.id }, data: { adoptedVersionId: version.id } })
  }
  return input.tx ? write(input.tx) : (prisma as Client).$transaction(write)
}

export async function persistImagePromptVersion(input: {
  projectId: string
  shotId: string
  targetKey: Exclude<PromptTargetKey, 'video'>
  inputSnapshot: PromptInputSnapshot
  analysis: unknown
  rawOutput?: string | null
  provenance?: PromptProvenance
}) {
  return appendPromptVersion({
    ...input,
    content: {
      parsedSections: input.analysis,
      integratedGenerationPrompt: imagePromptAnalysisSchema.parse(input.analysis).integratedGenerationPrompt,
      negativeConstraints: imagePromptAnalysisSchema.parse(input.analysis).negativeConstraints,
      rawOutput: input.rawOutput,
    },
  })
}

type VideoPromptResult = {
  stableShotId: string
  analysis: unknown
  rawOutput?: string | null
}

export function normalizeVideoPromptStableShotIds<T extends { stableShotId: string }>(expectedStableShotIds: string[], results: T[]): T[] {
  return results.map((result) => {
    const stableShotId = result.stableShotId.trim()
    if (expectedStableShotIds.includes(stableShotId)) return { ...result, stableShotId }
    const matches = expectedStableShotIds.filter((expected) => expected.endsWith(`:${stableShotId}`))
    return matches.length === 1 ? { ...result, stableShotId: matches[0] } : { ...result, stableShotId }
  })
}

function assertExactStableShotSet(expectedStableShotIds: string[], results: VideoPromptResult[]) {
  if (!expectedStableShotIds.length || expectedStableShotIds.length !== new Set(expectedStableShotIds).size) throw new Error('REMAKE_PROMPT_VIDEO_RESULT_INVALID')
  const actualStableShotIds = results.map((result) => result.stableShotId)
  if (actualStableShotIds.length !== expectedStableShotIds.length || new Set(actualStableShotIds).size !== actualStableShotIds.length || actualStableShotIds.some((id) => !expectedStableShotIds.includes(id))) throw new Error('REMAKE_PROMPT_VIDEO_RESULT_INVALID: result IDs did not exactly cover the manifest')
}

export async function persistVideoPromptRunAtomically(input: {
  projectId: string
  expectedStableShotIds: string[]
  results: VideoPromptResult[]
  provenance?: PromptProvenance
  rawOutput?: string | null
}) {
  const provenance = promptProvenanceSchema.parse(input.provenance ?? {})
  assertExactStableShotSet(input.expectedStableShotIds, input.results)
  const parsedResults = input.results.map((result) => ({ ...result, analysis: videoPromptAnalysisSchema.parse(result.analysis) }))
  if (input.rawOutput && Buffer.byteLength(input.rawOutput, 'utf8') > MAX_RAW_OUTPUT_BYTES) throw new Error('REMAKE_PROMPT_RAW_OUTPUT_TOO_LARGE')
  return (prisma as Client).$transaction(async (tx: Client) => {
    const remakeProject = await tx.remakeProject.findUnique({
      where: { projectId: input.projectId },
      include: { shots: { select: { id: true, stableKey: true } } },
    })
    if (!remakeProject) throw new Error('REMAKE_PROJECT_NOT_FOUND')
    const expectedStableShotIds = new Set(input.expectedStableShotIds)
    const shotsByStableKey = new Map<string, any>(remakeProject.shots
      .filter((shot: any) => expectedStableShotIds.has(shot.stableKey))
      .map((shot: any) => [shot.stableKey, shot]))
    if (shotsByStableKey.size !== input.expectedStableShotIds.length || input.expectedStableShotIds.some((stableKey) => !shotsByStableKey.has(stableKey))) throw new Error('REMAKE_PROMPT_VIDEO_RESULT_INVALID')
    const snapshots = await Promise.all(parsedResults.map(async (result) => ({ result, snapshot: await currentInput(tx, { projectId: input.projectId, shotId: shotsByStableKey.get(result.stableShotId).id }) })))
    const runFingerprint = createHash('sha256').update(stableJson(snapshots.map(({ snapshot }) => promptInputFingerprint(snapshot)))).digest('hex')
    const run = await tx.remakePromptRun.create({
      data: {
        remakeProjectId: remakeProject.id,
        taskId: provenance.taskId ?? null,
        targetKey: 'video',
        inputFingerprint: runFingerprint,
        schemaVersion: provenance.schemaVersion ?? null,
        modelVersion: provenance.modelVersion ?? null,
        executorVersion: provenance.executorVersion ?? null,
        rawOutput: input.rawOutput ?? null,
      },
    })
    const versions = []
    for (const { result, snapshot } of snapshots) {
      versions.push(await appendPromptVersion({
        projectId: input.projectId,
        shotId: snapshot.shotId,
        targetKey: 'video',
        inputSnapshot: snapshot,
        content: { parsedSections: result.analysis, integratedGenerationPrompt: result.analysis.coreEvent, rawOutput: result.rawOutput ?? null },
        provenance,
        runId: run.id,
        tx,
      }))
    }
    return { run, versions }
  })
}

export async function invalidatePromptVersionsForShotRevision(input: { tx: Client; shotId: string; revisionId: string; reason: string }) {
  const tracks = await input.tx.remakePromptTrack.findMany({
    where: { shotId: input.shotId, adoptedVersionId: { not: null } },
    select: { adoptedVersionId: true },
  })
  const data = tracks.flatMap((track: { adoptedVersionId: string | null }) => track.adoptedVersionId
    ? [{ shotId: input.shotId, revisionId: input.revisionId, promptVersionId: track.adoptedVersionId, reason: input.reason, status: 'needs_review' }]
    : [])
  if (data.length) await input.tx.remakeInvalidation.createMany({ data })
}

export async function getPromptVersionHistory(input: { projectId: string; shotId: string; targetKey: PromptTargetKey }) {
  const targetKey = promptTargetKeySchema.parse(input.targetKey)
  return (prisma as Client).remakePromptVersion.findMany({
    where: { track: { shotId: input.shotId, targetKey, remakeProject: { projectId: input.projectId } } },
    orderBy: { versionNumber: 'desc' },
  })
}

type PromptVersionRow = {
  id: string
  versionNumber: number
  status: string
  runId: string | null
  integratedGenerationPrompt: string
  negativeConstraints: unknown
  parsedSections: unknown
  rawOutput: string | null
  inputSnapshot: unknown
  createdAt: Date
  skillVersion: string | null
  schemaVersion: string | null
  modelVersion: string | null
  executorVersion: string | null
  taskId: string | null
  invalidatedAt: Date | null
}

function sanitizeRawOutput(rawOutput: string | null): string | null {
  if (!rawOutput) return null
  return rawOutput
    .split('\n')
    .filter((line) => !/(?:storage[_-]?key|cli[_ -]?command|\bstderr\b|\benvironment\b|\benv\b)/i.test(line))
    .join('\n')
    .slice(0, MAX_RAW_OUTPUT_BYTES)
}

function promptVersionSummary(version: PromptVersionRow, adoptedVersionId: string | null) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    source: version.runId ? 'automated' as const : 'human' as const,
    reviewStatus: version.invalidatedAt ? 'needs_review' : version.status,
    isAdopted: version.id === adoptedVersionId,
    coreText: version.integratedGenerationPrompt,
    negativeConstraints: Array.isArray(version.negativeConstraints) ? version.negativeConstraints.filter((item): item is string => typeof item === 'string') : [],
    createdAt: version.createdAt.toISOString(),
    provenance: {
      taskId: version.taskId,
      skillVersion: version.skillVersion,
      schemaVersion: version.schemaVersion,
      modelVersion: version.modelVersion,
      executorVersion: version.executorVersion,
    },
  }
}

function promptVersionFull(version: PromptVersionRow, adoptedVersionId: string | null) {
  return {
    ...promptVersionSummary(version, adoptedVersionId),
    parsedOutput: version.parsedSections,
    rawOutput: sanitizeRawOutput(version.rawOutput),
  }
}

export async function getPromptTrackDetail(input: { projectId: string; userId: string; trackId: string; versionIds?: string[] }) {
  const versionIds = [...new Set(input.versionIds ?? [])]
  if (versionIds.length > 2) throw new Error('REMAKE_PROMPT_VERSION_SELECTION_INVALID')
  const track = await (prisma as Client).remakePromptTrack.findFirst({
    where: { id: input.trackId, remakeProject: { projectId: input.projectId, project: { userId: input.userId } } },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  }) as { id: string; shotId: string; targetKey: PromptTargetKey; adoptedVersionId: string | null; versions: PromptVersionRow[] } | null
  if (!track) return null
  const selectedById = new Map(track.versions.map((version) => [version.id, version]))
  const selected = versionIds.map((id) => selectedById.get(id)).filter((version): version is PromptVersionRow => Boolean(version))
  if (selected.length !== versionIds.length) return null
  const latest = track.versions[0] ?? null
  return {
    track: {
      id: track.id,
      shotId: track.shotId,
      targetKey: track.targetKey,
      latestVersion: latest?.versionNumber ?? null,
      adoptedVersion: track.versions.find((version) => version.id === track.adoptedVersionId)?.versionNumber ?? null,
      needsReview: track.versions.some((version) => Boolean(version.invalidatedAt)),
    },
    history: track.versions.map((version) => promptVersionSummary(version, track.adoptedVersionId)),
    selected: selected.map((version) => promptVersionFull(version, track.adoptedVersionId)),
  }
}

export async function savePromptHumanEdit(input: {
  projectId: string
  userId: string
  trackId: string
  sourceVersionId?: string
  coreText: string
  negativeConstraints?: string[]
}) {
  const track = await (prisma as Client).remakePromptTrack.findFirst({
    where: { id: input.trackId, remakeProject: { projectId: input.projectId, project: { userId: input.userId } } },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  }) as { id: string; shotId: string; targetKey: PromptTargetKey; versions: PromptVersionRow[] } | null
  if (!track) throw new Error('REMAKE_PROMPT_VERSION_NOT_FOUND')
  const source = input.sourceVersionId
    ? track.versions.find((version) => version.id === input.sourceVersionId)
    : track.versions[0]
  if (!source || source.invalidatedAt) throw new Error('REMAKE_PROMPT_INPUT_STALE')
  const parsed = parsePromptAnalysis(track.targetKey, source.parsedSections)
  const analysis = track.targetKey === 'video'
    ? { ...videoPromptAnalysisSchema.parse(parsed), coreEvent: input.coreText }
    : { ...imagePromptAnalysisSchema.parse(parsed), integratedGenerationPrompt: input.coreText, negativeConstraints: input.negativeConstraints ?? imagePromptAnalysisSchema.parse(parsed).negativeConstraints }
  return appendPromptVersion({
    projectId: input.projectId,
    shotId: track.shotId,
    targetKey: track.targetKey,
    inputSnapshot: promptInputSnapshotSchema.parse(source.inputSnapshot),
    content: { parsedSections: analysis, integratedGenerationPrompt: input.coreText, negativeConstraints: input.negativeConstraints, rawOutput: null },
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
