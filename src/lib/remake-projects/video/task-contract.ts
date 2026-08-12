import { z } from 'zod'
import { TASK_TYPE } from '@/lib/task/types'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
  videoInputFingerprint,
  videoInputSnapshotSchema,
  type VideoInputSnapshot,
} from './contracts'

const operationKeySchema = z.string().trim().min(1).max(200)

const payloadSchema = z.object({
  kind: z.literal('video'),
  operationKey: operationKeySchema,
  inputSnapshot: videoInputSnapshotSchema,
  inputFingerprint: z.string().length(64),
}).strict()

export type RemakeVideoTaskPayload = z.infer<typeof payloadSchema>

const RUNTIME_PAYLOAD_KEYS = new Set([
  'flowId',
  'flowStageIndex',
  'flowStageTotal',
  'flowStageTitle',
  'meta',
  'runId',
])

function assertProjectSnapshot(projectId: string, snapshot: VideoInputSnapshot) {
  if (snapshot.projectId !== projectId) throw new Error('REMAKE_VIDEO_PROJECT_MISMATCH')
}

export function buildRemakeVideoTaskDescriptor(input: {
  projectId: string
  operationKey: string
  inputSnapshot: VideoInputSnapshot
}) {
  const inputSnapshot = videoInputSnapshotSchema.parse(input.inputSnapshot)
  assertProjectSnapshot(input.projectId, inputSnapshot)
  assertVideoReferencesHaveKeyframe(inputSnapshot.orderedReferences)
  assertVideoReferenceOrder(inputSnapshot.orderedReferences)
  const inputFingerprint = videoInputFingerprint(inputSnapshot)
  const payload = payloadSchema.parse({
    kind: 'video',
    operationKey: input.operationKey,
    inputSnapshot,
    inputFingerprint,
  })
  return {
    taskType: TASK_TYPE.REMAKE_VIDEO_GENERATE,
    targetType: 'remake_shot' as const,
    targetId: inputSnapshot.shotId,
    inputFingerprint,
    payload,
    dedupeKey: `remake-video:${input.projectId}:${payload.operationKey}:${inputFingerprint}`,
  }
}

export function parseRemakeVideoTaskPayload(payload: unknown): RemakeVideoTaskPayload {
  const raw =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  if (!raw) throw new Error('REMAKE_VIDEO_TASK_INVALID')
  const core = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !RUNTIME_PAYLOAD_KEYS.has(key)),
  )
  const parsed = payloadSchema.parse(core)
  if (parsed.inputFingerprint !== videoInputFingerprint(parsed.inputSnapshot)) {
    throw new Error('REMAKE_VIDEO_FINGERPRINT_INVALID')
  }
  assertVideoReferencesHaveKeyframe(parsed.inputSnapshot.orderedReferences)
  assertVideoReferenceOrder(parsed.inputSnapshot.orderedReferences)
  return parsed
}
