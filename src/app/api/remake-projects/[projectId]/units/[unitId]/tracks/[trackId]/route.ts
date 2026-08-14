import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import {
  adoptVideoUnitVersion,
  getVideoUnitTrackDetail,
  reconfirmVideoUnitVersion,
  setVideoUnitReviewNote,
} from '@/lib/remake-projects/unit/service'

/**
 * Unit track route — mirrors the single-shot track route (D-17):
 * GET detail (getVideoUnitTrackDetail), POST actions note / adopt / reconfirm
 * (setVideoUnitReviewNote / adoptVideoUnitVersion / reconfirmVideoUnitVersion).
 */

const idSchema = z.string().uuid()

const noteSchema = z.object({
  action: z.literal('note'),
  versionId: idSchema,
  note: z.string().max(2000),
}).strict()

const adoptSchema = z.object({
  action: z.literal('adopt'),
  versionId: idSchema,
  confirmReplace: z.boolean().default(false),
}).strict()

const reconfirmSchema = z.object({
  action: z.literal('reconfirm'),
  versionId: idSchema,
}).strict()

const actionSchema = z.discriminatedUnion('action', [
  noteSchema,
  adoptSchema,
  reconfirmSchema,
])

async function authorized(projectId: string, trackId: string) {
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  if (!idSchema.safeParse(trackId).success) throw new ApiError('NOT_FOUND')
  return auth
}

export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
    const { projectId, trackId } = await context.params
    const auth = await authorized(projectId, trackId)
    if (isErrorResponse(auth)) return auth
    const detail = await getVideoUnitTrackDetail({
      projectId,
      userId: auth.session.user.id,
      trackId,
    })
    if (!detail) throw new ApiError('NOT_FOUND')
    return NextResponse.json(detail)
  },
)

export const POST = apiHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
    const { projectId, trackId } = await context.params
    const auth = await authorized(projectId, trackId)
    if (isErrorResponse(auth)) return auth

    const body = actionSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new ApiError('INVALID_PARAMS')

    try {
      switch (body.data.action) {
        case 'note': {
          const result = await setVideoUnitReviewNote({
            projectId,
            userId: auth.session.user.id,
            versionId: body.data.versionId,
            note: body.data.note,
          })
          return NextResponse.json({ version: result })
        }
        case 'adopt': {
          const result = await adoptVideoUnitVersion({
            projectId,
            userId: auth.session.user.id,
            trackId,
            versionId: body.data.versionId,
            confirmReplace: body.data.confirmReplace,
          })
          return NextResponse.json({
            track: { id: result.id, adoptedVersionId: result.adoptedVersionId },
          })
        }
        case 'reconfirm': {
          const result = await reconfirmVideoUnitVersion({
            projectId,
            userId: auth.session.user.id,
            trackId,
            versionId: body.data.versionId,
          })
          return NextResponse.json({
            track: { id: result.id, adoptedVersionId: result.adoptedVersionId },
            reconfirmed: result.reconfirmed,
          })
        }
      }
    } catch (error) {
      if (error instanceof Error && /NOT_FOUND/.test(error.message)) {
        throw new ApiError('NOT_FOUND')
      }
      if (error instanceof Error && /STALE|CONFIRM_REQUIRED|RECONFIRM_NOT_ADOPTED/.test(error.message)) {
        throw new ApiError('CONFLICT', { details: error.message })
      }
      throw error
    }
  },
)
