import { z } from 'zod'
import { TASK_TYPE } from '@/lib/task/types'
import { keyframeInputFingerprint, keyframeInputSnapshotSchema, type KeyframeInputSnapshot } from './contracts'

const operationKeySchema = z.string().trim().min(1).max(200)
const payloadSchema = z.object({
  kind: z.literal('keyframe'),
  operationKey: operationKeySchema,
  inputSnapshot: keyframeInputSnapshotSchema,
  inputFingerprint: z.string().length(64),
}).strict()

export type RemakeKeyframeTaskPayload = z.infer<typeof payloadSchema>

const RUNTIME_PAYLOAD_KEYS = new Set(['flowId', 'flowStageIndex', 'flowStageTotal', 'flowStageTitle', 'meta', 'runId'])

function assertProjectSnapshot(projectId: string, snapshot: KeyframeInputSnapshot) {
  if (snapshot.projectId !== projectId) throw new Error('REMAKE_KEYFRAME_PROJECT_MISMATCH')
}

export function buildRemakeKeyframeTaskDescriptor(input: {
  projectId: string
  operationKey: string
  inputSnapshot: KeyframeInputSnapshot
}) {
  const inputSnapshot = keyframeInputSnapshotSchema.parse(input.inputSnapshot)
  assertProjectSnapshot(input.projectId, inputSnapshot)
  const inputFingerprint = keyframeInputFingerprint(inputSnapshot)
  const payload = payloadSchema.parse({ kind: 'keyframe', operationKey: input.operationKey, inputSnapshot, inputFingerprint })
  return {
    taskType: TASK_TYPE.REMAKE_KEYFRAME_IMAGE_GENERATE,
    targetType: 'remake_shot' as const,
    targetId: inputSnapshot.shotId,
    inputFingerprint,
    payload,
    dedupeKey: `remake-keyframe:${input.projectId}:${payload.operationKey}:${inputFingerprint}`,
  }
}

export function parseRemakeKeyframeTaskPayload(payload: unknown): RemakeKeyframeTaskPayload {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null
  if (!raw) throw new Error('REMAKE_KEYFRAME_TASK_INVALID')
  const core = Object.fromEntries(Object.entries(raw).filter(([key]) => !RUNTIME_PAYLOAD_KEYS.has(key)))
  const parsed = payloadSchema.parse(core)
  if (parsed.inputFingerprint !== keyframeInputFingerprint(parsed.inputSnapshot)) throw new Error('REMAKE_KEYFRAME_FINGERPRINT_INVALID')
  return parsed
}
