import { createHash } from 'node:crypto'
import { z } from 'zod'

export const KEYFRAME_SLOTS = ['start', 'middle', 'end'] as const
export const keyframeSlotSchema = z.enum(KEYFRAME_SLOTS)
export type KeyframeSlot = z.infer<typeof keyframeSlotSchema>

export const keyframeInputSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  remakeProjectId: z.string().uuid(),
  shotId: z.string().uuid(),
  stableKey: z.string().min(1),
  sourceRevision: z.number().int().positive(),
  shotRevision: z.number().int().positive(),
  shotRevisionId: z.string().uuid(),
  slot: keyframeSlotSchema,
  promptVersionId: z.string().uuid(),
  promptText: z.string().min(1),
  model: z.object({ id: z.string().min(1), provider: z.string().min(1).optional() }).strict(),
  options: z.record(z.unknown()).default({}),
  referenceMediaIds: z.array(z.string().uuid()).default([]),
  requestedCandidateCount: z.number().int().min(1).max(4),
}).strict()
export type KeyframeInputSnapshot = z.infer<typeof keyframeInputSnapshotSchema>

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function keyframeInputFingerprint(snapshot: KeyframeInputSnapshot): string {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex')
}
