import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { adoptKeyframeCandidate, getKeyframeTrackDetail } from '@/lib/remake-projects/keyframes/service'

const idSchema = z.string().trim().min(1)
const adoptSchema = z.object({ candidateId: idSchema }).strict()

async function authorized(projectId: string, trackId: string) {
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  if (!idSchema.safeParse(trackId).success) throw new ApiError('NOT_FOUND')
  return auth
}

export const GET = apiHandler(async (_request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
  const { projectId, trackId } = await context.params
  const auth = await authorized(projectId, trackId)
  if (isErrorResponse(auth)) return auth
  const detail = await getKeyframeTrackDetail({ projectId, userId: auth.session.user.id, trackId })
  if (!detail) throw new ApiError('NOT_FOUND')
  return NextResponse.json(detail)
})

const adopt = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
  const { projectId, trackId } = await context.params
  const auth = await authorized(projectId, trackId)
  if (isErrorResponse(auth)) return auth
  const body = z.object({ action: z.literal('adopt'), candidateId: idSchema }).strict().safeParse(await request.json().catch(() => null))
  if (!body.success) throw new ApiError('INVALID_PARAMS')
  try {
    const track = await adoptKeyframeCandidate({ projectId, userId: auth.session.user.id, trackId, candidateId: body.data.candidateId })
    return NextResponse.json({ track: { id: track.id, adoptedCandidateId: track.adoptedCandidateId } })
  } catch (error) {
    if (error instanceof Error && /NOT_FOUND/.test(error.message)) throw new ApiError('NOT_FOUND')
    if (error instanceof Error && /STALE|INVALID/.test(error.message)) throw new ApiError('CONFLICT')
    throw error
  }
})

export const POST = adopt
export const PATCH = adopt
