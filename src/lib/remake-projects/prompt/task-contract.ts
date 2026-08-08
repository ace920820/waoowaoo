import { createHash } from 'node:crypto'
import { z } from 'zod'
import { TASK_TYPE } from '@/lib/task/types'
import { promptInputFingerprint } from './service'
import { promptInputSnapshotSchema, type PromptInputSnapshot } from './contracts'

const operationKeySchema = z.string().trim().min(1).max(200)
const slotSchema = z.enum(['start', 'middle', 'end'])
const imagePayloadSchema = z.object({
  kind: z.literal('image'),
  operationKey: operationKeySchema,
  slot: slotSchema,
  inputSnapshot: promptInputSnapshotSchema,
  inputFingerprint: z.string().length(64),
}).strict()
const videoPayloadSchema = z.object({
  kind: z.literal('video'),
  operationKey: operationKeySchema,
  sourceRevision: z.number().int().positive(),
  snapshots: z.array(promptInputSnapshotSchema).min(1),
  inputFingerprint: z.string().length(64),
}).strict()

export type RemakePromptImageTaskPayload = z.infer<typeof imagePayloadSchema>
export type RemakePromptVideoTaskPayload = z.infer<typeof videoPayloadSchema>
export type RemakePromptTaskPayload = RemakePromptImageTaskPayload | RemakePromptVideoTaskPayload

type DescriptorInput =
  | Omit<RemakePromptImageTaskPayload, 'inputFingerprint'> & { projectId: string }
  | Omit<RemakePromptVideoTaskPayload, 'inputFingerprint'> & { projectId: string }

const RUNTIME_PAYLOAD_KEYS = new Set(['flowId', 'flowStageIndex', 'flowStageTotal', 'flowStageTitle', 'meta', 'runId'])

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function fingerprintVideo(snapshots: PromptInputSnapshot[], sourceRevision: number): string {
  return createHash('sha256').update(stableJson({ sourceRevision, snapshots })).digest('hex')
}

function assertProjectSnapshot(projectId: string, snapshot: PromptInputSnapshot) {
  if (snapshot.projectId !== projectId) throw new Error('REMAKE_PROMPT_PROJECT_MISMATCH')
}

function assertVideoSnapshots(snapshots: PromptInputSnapshot[], sourceRevision: number) {
  const stableKeys = snapshots.map((snapshot) => snapshot.stableKey)
  if (stableKeys.length !== new Set(stableKeys).size) throw new Error('REMAKE_PROMPT_VIDEO_SNAPSHOT_DUPLICATE')
  if (snapshots.some((snapshot) => snapshot.sourceRevision !== sourceRevision)) throw new Error('REMAKE_PROMPT_SOURCE_REVISION_INVALID')
  if (snapshots.some((snapshot) => !snapshot.keyframeMediaRefs.first || !snapshot.keyframeMediaRefs.middle || !snapshot.keyframeMediaRefs.last)) throw new Error('REMAKE_PROMPT_KEYFRAMES_INCOMPLETE')
}

function assertImageSlot(snapshot: PromptInputSnapshot, slot: z.infer<typeof slotSchema>) {
  const frameKey = slot === 'start' ? 'first' : slot === 'end' ? 'last' : 'middle'
  if (!snapshot.keyframeMediaRefs[frameKey]) throw new Error('REMAKE_PROMPT_KEYFRAME_MISSING')
}

function parseCorePayload(payload: unknown): RemakePromptTaskPayload {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null
  if (!raw) throw new Error('REMAKE_PROMPT_TASK_INVALID')
  const core = Object.fromEntries(Object.entries(raw).filter(([key]) => !RUNTIME_PAYLOAD_KEYS.has(key)))
  const extra = Object.keys(core).filter((key) => !['kind', 'operationKey', 'slot', 'inputSnapshot', 'sourceRevision', 'snapshots', 'inputFingerprint'].includes(key))
  if (extra.length) throw new Error(`REMAKE_PROMPT_TASK_FIELD_NOT_ALLOWED:${extra[0]}`)
  const parsed = core.kind === 'image' ? imagePayloadSchema.parse(core) : videoPayloadSchema.parse(core)
  if (parsed.kind === 'image') {
    if (parsed.inputFingerprint !== promptInputFingerprint(parsed.inputSnapshot)) throw new Error('REMAKE_PROMPT_FINGERPRINT_INVALID')
  } else {
    assertVideoSnapshots(parsed.snapshots, parsed.sourceRevision)
    if (parsed.inputFingerprint !== fingerprintVideo(parsed.snapshots, parsed.sourceRevision)) throw new Error('REMAKE_PROMPT_FINGERPRINT_INVALID')
  }
  return parsed
}

export function buildRemakePromptTaskDescriptor(input: DescriptorInput) {
  if (input.kind === 'image') {
    const inputSnapshot = promptInputSnapshotSchema.parse(input.inputSnapshot)
    assertProjectSnapshot(input.projectId, inputSnapshot)
    assertImageSlot(inputSnapshot, input.slot)
    const inputFingerprint = promptInputFingerprint(inputSnapshot)
    const payload = imagePayloadSchema.parse({ kind: 'image', operationKey: input.operationKey, slot: input.slot, inputSnapshot, inputFingerprint })
    return {
      taskType: TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE,
      targetType: 'remake_shot', targetId: inputSnapshot.shotId,
      inputFingerprint, payload,
      dedupeKey: `remake-prompt:image:${input.projectId}:${inputSnapshot.shotId}:${input.slot}:${input.operationKey}:${inputFingerprint}`,
    }
  }
  const snapshots = input.snapshots.map((snapshot) => promptInputSnapshotSchema.parse(snapshot))
  for (const snapshot of snapshots) assertProjectSnapshot(input.projectId, snapshot)
  assertVideoSnapshots(snapshots, input.sourceRevision)
  const inputFingerprint = fingerprintVideo(snapshots, input.sourceRevision)
  const payload = videoPayloadSchema.parse({ kind: 'video', operationKey: input.operationKey, sourceRevision: input.sourceRevision, snapshots, inputFingerprint })
  return {
    taskType: TASK_TYPE.REMAKE_VIDEO_PROMPT_ANALYZE,
    targetType: 'remake_project', targetId: input.projectId,
    inputFingerprint, payload,
    dedupeKey: `remake-prompt:video:${input.projectId}:${input.operationKey}:${inputFingerprint}`,
  }
}

export function parseRemakePromptTaskPayload(payload: unknown): RemakePromptTaskPayload {
  return parseCorePayload(payload)
}
