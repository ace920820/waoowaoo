import { createHash } from 'node:crypto'
import { z } from 'zod'

/**
 * Remake video reference roles.
 *
 * Ordering contract (D-04 + omni-reference parity):
 *   keyframes (Start -> Middle -> End) -> action sheet -> characters -> scene -> props -> character audio.
 * Characters/scene/props mirror the shot-group omni-reference priority
 * (character identity before environment before props), and audio always trails
 * the image references as a separate channel.
 */
export const VIDEO_REFERENCE_ROLES = [
  'start_keyframe',
  'middle_keyframe',
  'end_keyframe',
  'action_sheet',
  'character_reference',
  'scene_reference',
  'prop_reference',
  'character_audio_reference',
] as const
export const videoReferenceRoleSchema = z.enum(VIDEO_REFERENCE_ROLES)
export type VideoReferenceRole = z.infer<typeof videoReferenceRoleSchema>

export const VIDEO_REFERENCE_MEDIA_TYPES = ['image', 'audio'] as const
export const videoReferenceMediaTypeSchema = z.enum(VIDEO_REFERENCE_MEDIA_TYPES)
export type VideoReferenceMediaType = z.infer<typeof videoReferenceMediaTypeSchema>

export const VIDEO_REFERENCE_ROLE_ORDER: Record<VideoReferenceRole, number> = {
  start_keyframe: 0,
  middle_keyframe: 1,
  end_keyframe: 2,
  action_sheet: 3,
  character_reference: 4,
  scene_reference: 5,
  prop_reference: 6,
  character_audio_reference: 7,
}

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

export const orderedVideoReferenceSchema = z.object({
  role: videoReferenceRoleSchema,
  ordinal: z.number().int().min(1),
  /** Stable MediaObject id (keyframes / action sheet / media-backed assets). */
  mediaId: z.string().uuid().optional(),
  /** Raw storage key or HTTP URL fallback for assets without a MediaObject. */
  mediaUrl: z.string().min(1).optional(),
  mediaType: videoReferenceMediaTypeSchema.optional(),
  /** Machine-readable source family, e.g. `character_voice_reference`. */
  sourceType: z.string().min(1).optional(),
  /** Human label for traceability / prompt suffix, e.g. `角色 萨姆`. */
  label: z.string().min(1).optional(),
  /** Chinese usage instruction referenced by @ImageN / @AudioN tokens. */
  usage: z.string().min(1).optional(),
  /** Optional asset-library id for the bound asset (character/location/prop). */
  assetId: z.string().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.mediaId && !value.mediaUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mediaId'],
      message: 'REMAKE_VIDEO_REFERENCE_MEDIA_REQUIRED',
    })
  }
  if (value.role === 'character_audio_reference' && value.mediaType === 'image') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mediaType'],
      message: 'REMAKE_VIDEO_REFERENCE_AUDIO_MEDIA_TYPE_INVALID',
    })
  }
})
export type OrderedVideoReference = z.infer<typeof orderedVideoReferenceSchema>

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
 */
export function assertVideoReferencesHaveKeyframe(refs: OrderedVideoReference[]) {
  const hasKeyframe = refs.some((ref) => ref.role.endsWith('_keyframe'))
  if (!hasKeyframe) throw new Error('REMAKE_VIDEO_NO_KEYFRAME_REFERENCE')
}

/**
 * Validate D-04: fixed order Start -> Middle -> End -> action-sheet ->
 * characters -> scene -> props -> character audio. Ordinals must be
 * contiguous starting from 1.
 */
export function assertVideoReferenceOrder(refs: OrderedVideoReference[]) {
  for (let i = 1; i < refs.length; i++) {
    if (VIDEO_REFERENCE_ROLE_ORDER[refs[i - 1].role] >= VIDEO_REFERENCE_ROLE_ORDER[refs[i].role]) {
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
