import { createHash } from 'node:crypto'
import { z } from 'zod'

// Client-safe reference-role contract (roles / media types / order / ordered
// reference schema) lives in `reference-roles.ts` so client components can
// import it without pulling `node:crypto` into the browser bundle.
import {
  orderedVideoReferenceSchema,
  VIDEO_REFERENCE_ROLE_ORDER,
} from './reference-roles'
import type { OrderedVideoReference } from './reference-roles'

export {
  VIDEO_REFERENCE_ROLES,
  videoReferenceRoleSchema,
  VIDEO_REFERENCE_MEDIA_TYPES,
  videoReferenceMediaTypeSchema,
  VIDEO_REFERENCE_ROLE_ORDER,
  orderedVideoReferenceSchema,
} from './reference-roles'
export type {
  VideoReferenceRole,
  VideoReferenceMediaType,
  OrderedVideoReference,
} from './reference-roles'

/**
 * The reference mode used for the actual provider request, mirroring the
 * shot-group omni-reference contract:
 *   - `ark_content_multireference`: Ark content[] multi-modal references
 *     (reference_image / reference_audio) plus the 参考素材使用说明 suffix.
 *   - `composite_image_mvp`: degraded single-main-image mode for non-Ark
 *     models (only the first keyframe is sent as the main image).
 */
export const VIDEO_REFERENCE_MODES = ['ark_content_multireference', 'composite_image_mvp'] as const
export const videoReferenceModeSchema = z.enum(VIDEO_REFERENCE_MODES)
export type VideoReferenceMode = z.infer<typeof videoReferenceModeSchema>

export const videoInputSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  remakeProjectId: z.string().uuid(),
  shotId: z.string().uuid(),
  stableKey: z.string().min(1),
  sourceRevision: z.number().int().positive(),
  shotRevision: z.number().int().positive(),
  shotRevisionId: z.string().uuid(),
  promptVersionId: z.string().uuid(),
  /** Full prompt sent to the provider: adopted Video Prompt + reference usage suffix (Ark only). */
  promptText: z.string().min(1),
  model: z.object({ id: z.string().min(1), provider: z.string().min(1).optional() }).strict(),
  options: z.record(z.unknown()).default({}),
  orderedReferences: z.array(orderedVideoReferenceSchema).min(1),
  referenceMode: videoReferenceModeSchema.optional(),
  durationSeconds: z.number().int().positive(),
}).strict()
export type VideoInputSnapshot = z.infer<typeof videoInputSnapshotSchema>

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

export function videoInputFingerprint(snapshot: VideoInputSnapshot): string {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex')
}

/**
 * Validate D-03: at least one keyframe reference must be present;
 * action-sheet-only submissions are not allowed.
 *
 * The `_keyframe` suffix check deliberately covers the unit member role too:
 * `shot_keyframe` (D-10) ends with `_keyframe`, so a unit whose only keyframe
 * role is `shot_keyframe` passes without any special-casing here.
 */
export function assertVideoReferencesHaveKeyframe(refs: OrderedVideoReference[]) {
  const hasKeyframe = refs.some((ref) => ref.role.endsWith('_keyframe'))
  if (!hasKeyframe) throw new Error('REMAKE_VIDEO_NO_KEYFRAME_REFERENCE')
}

/**
 * Validate D-04: non-decreasing fixed order Start -> Middle -> End ->
 * (unit members: shot_keyframe...) -> action-sheet -> characters -> scene ->
 * props -> character audio. Ordinals must be contiguous starting from 1.
 *
 * The check is strictly non-decreasing (throws only when a previous role order
 * is GREATER than the next), which admits N consecutive `shot_keyframe`
 * references with the same role order while preserving every existing
 * single-shot ordering guarantee (distinct roles still require increasing order).
 */
export function assertVideoReferenceOrder(refs: OrderedVideoReference[]) {
  for (let i = 1; i < refs.length; i++) {
    if (VIDEO_REFERENCE_ROLE_ORDER[refs[i - 1].role] > VIDEO_REFERENCE_ROLE_ORDER[refs[i].role]) {
      throw new Error('REMAKE_VIDEO_REFERENCE_ORDER_INVALID')
    }
    if (refs[i].ordinal !== i + 1) {
      throw new Error('REMAKE_VIDEO_REFERENCE_ORDINAL_INVALID')
    }
  }
  if (refs.length > 0 && refs[0].ordinal !== 1) {
    throw new Error('REMAKE_VIDEO_REFERENCE_ORDINAL_INVALID')
  }
}
