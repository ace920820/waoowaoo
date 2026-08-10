import { z } from 'zod'
import { TASK_TYPE } from '@/lib/task/types'

const sourceSchema = z.object({ slot: z.enum(['start', 'middle', 'end']), mediaId: z.string().min(1), timestamp: z.number().finite() }).strict()
export const actionSheetTaskPayloadSchema = z.object({ kind: z.literal('action_sheet'), projectId: z.string().uuid(), revisionId: z.string().uuid(), shotId: z.string().uuid(), confirmed: z.boolean(), sources: z.array(sourceSchema).length(3), fingerprint: z.string().length(64) }).strict()
export type RemakeKeyframeActionSheetTaskPayload = z.infer<typeof actionSheetTaskPayloadSchema>

export function buildRemakeKeyframeActionSheetTaskDescriptor(input: { projectId: string; operationKey: string; payload: RemakeKeyframeActionSheetTaskPayload }) {
  const payload = actionSheetTaskPayloadSchema.parse(input.payload)
  return { taskType: TASK_TYPE.REMAKE_KEYFRAME_ACTION_SHEET, targetType: 'remake_shot' as const, targetId: payload.shotId, payload, dedupeKey: `remake-action-sheet:${input.projectId}:${payload.revisionId}:${payload.fingerprint}` }
}
