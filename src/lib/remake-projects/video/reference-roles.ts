import { z } from 'zod'

/**
 * Client-safe reference-role contract for Remake video generation.
 *
 * This module intentionally has NO `node:` imports so it can be bundled into
 * client components (video-inputs.ts -> reference-plan.ts -> this module).
 * Server-only concerns (snapshot schema, fingerprinting) stay in `contracts.ts`,
 * which re-exports everything here for compatibility.
 */

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
