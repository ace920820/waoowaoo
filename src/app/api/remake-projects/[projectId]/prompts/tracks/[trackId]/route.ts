import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { approveAndAdoptPromptVersion, getPromptTrackDetail, savePromptHumanEdit, saveAndAdoptPromptHumanEdit } from '@/lib/remake-projects/prompt/service'

const idSchema = z.string().uuid()
const editSchema = z.object({
  sourceVersionId: idSchema.optional(),
  coreText: z.string().trim().min(1).max(200_000),
  negativeConstraints: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
}).strict()
const editAndAdoptSchema = z.object({
  action: z.literal('human_edit_and_adopt'),
  sourceVersionId: idSchema.optional(),
  coreText: z.string().trim().min(1).max(200_000),
  negativeConstraints: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
}).strict()
const adoptSchema = z.object({ versionId: idSchema }).strict()

function selectedVersionIds(request: NextRequest): string[] {
  const explicit = request.nextUrl.searchParams.get('versionId')
  const compare = request.nextUrl.searchParams.get('compare')
  if (explicit && compare) throw new ApiError('INVALID_PARAMS')
  const ids = (compare ? compare.split(',') : explicit ? [explicit] : []).filter(Boolean)
  if (ids.length > 2 || ids.some((id) => !idSchema.safeParse(id).success)) throw new ApiError('INVALID_PARAMS')
  return ids
}

async function authorizedTrack(projectId: string, trackId: string) {
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  if (!idSchema.safeParse(trackId).success) throw new ApiError('NOT_FOUND')
  return auth
}

export const GET = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
  const { projectId, trackId } = await context.params
  const auth = await authorizedTrack(projectId, trackId)
  if (isErrorResponse(auth)) return auth
  const detail = await getPromptTrackDetail({ projectId, userId: auth.session.user.id, trackId, versionIds: selectedVersionIds(request) })
  if (!detail) throw new ApiError('NOT_FOUND')
  return NextResponse.json(detail)
})

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
  const { projectId, trackId } = await context.params
  const auth = await authorizedTrack(projectId, trackId)
  if (isErrorResponse(auth)) return auth
  const rawBody = await request.json().catch(() => null)

  // 尝试 edit_and_adopt 格式（带 action）
  const editAndAdoptBody = editAndAdoptSchema.safeParse(rawBody)
  if (editAndAdoptBody.success) {
    try {
      const result = await saveAndAdoptPromptHumanEdit({
        projectId,
        userId: auth.session.user.id,
        trackId,
        sourceVersionId: editAndAdoptBody.data.sourceVersionId,
        coreText: editAndAdoptBody.data.coreText,
        negativeConstraints: editAndAdoptBody.data.negativeConstraints,
      })
      return NextResponse.json({ version: result.version, isAdopted: result.isAdopted }, { status: 201 })
    } catch (error) {
      if (error instanceof Error && /NOT_FOUND|ACCESS_DENIED|TRACK_NOT_FOUND/.test(error.message)) throw new ApiError('NOT_FOUND')
      if (error instanceof Error && /STALE|MISMATCH/.test(error.message)) throw new ApiError('CONFLICT')
      throw error
    }
  }

  // 回退到纯 edit 格式（原有行为）
  const body = editSchema.safeParse(rawBody)
  if (!body.success) throw new ApiError('INVALID_PARAMS')
  try {
    const version = await savePromptHumanEdit({ projectId, userId: auth.session.user.id, trackId, ...body.data })
    return NextResponse.json({ version: { id: version.id, versionNumber: version.versionNumber, reviewStatus: version.status } }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && /NOT_FOUND|ACCESS_DENIED/.test(error.message)) throw new ApiError('NOT_FOUND')
    if (error instanceof Error && /STALE|MISMATCH/.test(error.message)) throw new ApiError('CONFLICT')
    throw error
  }
})

export const PATCH = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string; trackId: string }> }) => {
  const { projectId, trackId } = await context.params
  const auth = await authorizedTrack(projectId, trackId)
  if (isErrorResponse(auth)) return auth
  const body = adoptSchema.safeParse(await request.json())
  if (!body.success) throw new ApiError('INVALID_PARAMS')
  const detail = await getPromptTrackDetail({ projectId, userId: auth.session.user.id, trackId })
  if (!detail) throw new ApiError('NOT_FOUND')
  try {
    const track = await approveAndAdoptPromptVersion({ projectId, shotId: detail.track.shotId, versionId: body.data.versionId, reviewerId: auth.session.user.id })
    return NextResponse.json({ track: { id: track.id, adoptedVersionId: track.adoptedVersionId } })
  } catch (error) {
    if (error instanceof Error && /NOT_FOUND|ACCESS_DENIED/.test(error.message)) throw new ApiError('NOT_FOUND')
    if (error instanceof Error && /STALE|INVALID/.test(error.message)) throw new ApiError('CONFLICT')
    throw error
  }
})
