import { createHash } from 'node:crypto'
import { z } from 'zod'

export const VIDEO_REFERENCE_ROLES = ['start_keyframe', 'middle_keyframe', 'end_keyframe', 'action_sheet'] as const
export const videoReferenceRoleSchema = z.enum(VIDEO_REFERENCE_ROLES)
export type VideoReferenceRole = z.infer<typeof videoReferenceRoleSchema>

export const orderedVideoReferenceSchema = z.object({
  role: videoReferenceRoleSchema,
  ordinal: z.number().int().min(1),
  mediaId: z.string().uuid(),
}).strict()
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
  promptText: z.string().min(1),
  model: z.object({ id: z.string().min(1), provider: z.string().min(1).optional() }).strict(),
  options: z.record(z.unknown()).default({}),
  orderedReferences: z.array(orderedVideoReferenceSchema).min(1),
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
 * Validate D-04: fixed order Start -> Middle -> End -> action-sheet.
 * Ordinals must be contiguous starting from 1.
 */
export function assertVideoReferenceOrder(refs: OrderedVideoReference[]) {
  const roleOrder: Record<VideoReferenceRole, number> = {
    start_keyframe: 0,
    middle_keyframe: 1,
    end_keyframe: 2,
    action_sheet: 3,
  }
  for (let i = 1; i < refs.length; i++) {
    if (roleOrder[refs[i - 1].role] >= roleOrder[refs[i].role]) {
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
