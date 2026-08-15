import { createHash } from 'node:crypto'
import { z } from 'zod'
import { orderedVideoReferenceSchema, videoReferenceModeSchema } from '../video/contracts'

/**
 * Server-only unit input snapshot contract (D-22).
 *
 * Mirrors `video/contracts.ts` for the merged unit: the snapshot is strict and
 * frozen, and `unitInputFingerprint` changes when ANY member, time anchor, or
 * keyframe changes. This module is never imported by the browser (the preview
 * panel imports the pure `unit/time-anchors.ts` functions instead), so the
 * top-level `node:crypto` import is safe here.
 */

export const videoUnitInputSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  remakeProjectId: z.string().uuid(),
  unitId: z.string().uuid(),
  /** One entry per unit member, in submission (ordinal) order. */
  members: z.array(
    z.object({
      shotRevisionId: z.string().uuid(),
      ordinal: z.number().int().min(1),
      /** The single adopted keyframe this member contributes (D-06). */
      selectedKeyframe: z.object({
        slot: z.enum(['start', 'middle', 'end']),
        mediaId: z.string().uuid(),
      }).strict(),
      promptVersionId: z.string().uuid(),
      /** Duration contribution used for the total duration + D-09 time anchors. */
      timeRangeSeconds: z.object({
        start: z.number().min(0),
        end: z.number().min(0),
      }).strict(),
    }).strict(),
  ).min(2),
  /** Actual provider references: one shot_keyframe per member + merged action
   * sheet + deduped assets (D-06/D-08), already sorted + capped. */
  orderedReferences: z.array(orderedVideoReferenceSchema).min(1),
  /** Phase 09.3: the frozen action-sheet x-grid layout (cells carry the media
   * ids that compose the merged sheet; timestamp is worker-filled). */
  actionSheetGrid: z.object({
    columns: z.number().int().min(1).max(4),
    cells: z.array(
      z.object({
        shotNumber: z.number().int().positive(),
        slot: z.enum(['start', 'middle', 'end']),
        mediaId: z.string().uuid(),
      }).strict(),
    ).min(1).max(16),
  }).strict().optional(),
  model: z.object({ id: z.string().min(1), provider: z.string().min(1).optional() }).strict(),
  options: z.record(z.unknown()).default({}),
  referenceMode: videoReferenceModeSchema.optional(),
  durationSeconds: z.number().int().positive(),
  /** Full D-09 timed prompt plus the reference-usage suffix (frozen at submit). */
  promptText: z.string().min(1),
}).strict()
export type VideoUnitInputSnapshot = z.infer<typeof videoUnitInputSnapshotSchema>

/** Deterministic stable JSON serialization (same approach as videoInputFingerprint). */
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

export function unitInputFingerprint(snapshot: VideoUnitInputSnapshot): string {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex')
}
