import { z } from 'zod'
import { TASK_TYPE } from '@/lib/task/types'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
} from '../video/contracts'
import {
  unitInputFingerprint,
  videoUnitInputSnapshotSchema,
  type VideoUnitInputSnapshot,
} from './contracts'

/**
 * Deterministic unit task descriptor and payload parser (D-22), mirroring
 * `video/task-contract.ts` for the merged-unit task type. The dedupe key
 * carries projectId + operationKey + input fingerprint, so any member /
 * time-anchor / keyframe change produces a new key and a fresh task.
 */

const operationKeySchema = z.string().trim().min(1).max(200)

const payloadSchema = z.object({
  kind: z.literal('video_unit'),
  operationKey: operationKeySchema,
  inputSnapshot: videoUnitInputSnapshotSchema,
  inputFingerprint: z.string().length(64),
}).strict()

export type RemakeVideoUnitTaskPayload = z.infer<typeof payloadSchema>

const RUNTIME_PAYLOAD_KEYS = new Set([
  'flowId',
  'flowStageIndex',
  'flowStageTotal',
  'flowStageTitle',
  'meta',
  'runId',
])

/** T-091-04: the snapshot must be bound to the route project. */
function assertUnitProjectSnapshot(projectId: string, snapshot: VideoUnitInputSnapshot) {
  if (snapshot.projectId !== projectId) throw new Error('REMAKE_VIDEO_UNIT_PROJECT_MISMATCH')
}

export function buildVideoUnitTaskDescriptor(input: {
  projectId: string
  operationKey: string
  inputSnapshot: VideoUnitInputSnapshot
}) {
  const inputSnapshot = videoUnitInputSnapshotSchema.parse(input.inputSnapshot)
  assertUnitProjectSnapshot(input.projectId, inputSnapshot)
  assertVideoReferencesHaveKeyframe(inputSnapshot.orderedReferences)
  assertVideoReferenceOrder(inputSnapshot.orderedReferences)
  const inputFingerprint = unitInputFingerprint(inputSnapshot)
  const payload = payloadSchema.parse({
    kind: 'video_unit',
    operationKey: input.operationKey,
    inputSnapshot,
    inputFingerprint,
  })
  return {
    taskType: TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE,
    targetType: 'remake_unit' as const,
    targetId: inputSnapshot.unitId,
    inputFingerprint,
    payload,
    dedupeKey: `remake-video-unit:${input.projectId}:${payload.operationKey}:${inputFingerprint}`,
  }
}

export function parseVideoUnitTaskPayload(payload: unknown): RemakeVideoUnitTaskPayload {
  const raw =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  if (!raw) throw new Error('REMAKE_VIDEO_UNIT_TASK_INVALID')
  const core = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !RUNTIME_PAYLOAD_KEYS.has(key)),
  )
  const parsed = payloadSchema.parse(core)
  if (parsed.inputFingerprint !== unitInputFingerprint(parsed.inputSnapshot)) {
    throw new Error('REMAKE_VIDEO_UNIT_FINGERPRINT_INVALID')
  }
  assertVideoReferencesHaveKeyframe(parsed.inputSnapshot.orderedReferences)
  assertVideoReferenceOrder(parsed.inputSnapshot.orderedReferences)
  return parsed
}
