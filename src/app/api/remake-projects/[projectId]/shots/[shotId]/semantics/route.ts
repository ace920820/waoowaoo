import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { updateRemakeShotSemantics } from '@/lib/remake-projects/semantics/service'

const patchSchema = z.object({
  shotType: z.string().trim().max(200).nullable().optional(),
  cameraMove: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  moodPresetId: z.string().trim().max(100).nullable().optional(),
  customMood: z.string().trim().max(500).nullable().optional(),
  sceneTag: z.string().trim().max(100).nullable().optional(),
  characterTags: z.array(z.string().trim().max(100)).max(20).nullable().optional(),
  sceneAssetId: z.string().trim().max(100).nullable().optional(),
  characterAssetIds: z.array(z.string().trim().max(100)).max(30).nullable().optional(),
  propAssetIds: z.array(z.string().trim().max(100)).max(50).nullable().optional(),
}).strict()

export const PATCH = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string; shotId: string }> }) => {
  const { projectId, shotId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const body = patchSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) throw new ApiError('INVALID_PARAMS', { details: 'Invalid semantics update request' })

  const result = await updateRemakeShotSemantics({
    projectId,
    shotId,
    userId: auth.session.user.id,
    ...body.data,
  })
  if (!result) throw new ApiError('NOT_FOUND', { details: 'Shot not found' })
  return NextResponse.json({ semantics: result.semantics })
})
