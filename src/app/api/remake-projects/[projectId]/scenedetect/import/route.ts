import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { commitSceneDetectImport, previewSceneDetectImport } from '@/lib/remake-projects/scenedetect/adapter'

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { projectId } = await context.params
  const body = await request.json() as Record<string, unknown>
  if (typeof body.analysisId !== 'string' || typeof body.payload !== 'object' || body.payload === null) throw new ApiError('INVALID_PARAMS')
  try {
    if (body.mode === 'preview') return NextResponse.json({ preview: previewSceneDetectImport({ projectId, analysisId: body.analysisId, payload: body.payload }) })
    if (body.mode !== 'commit' || typeof body.operationKey !== 'string' || !body.operationKey.trim()) throw new ApiError('INVALID_PARAMS')
    const result = await commitSceneDetectImport({ projectId, userId: auth.session.user.id, analysisId: body.analysisId, operationKey: body.operationKey, payload: body.payload })
    return NextResponse.json(result, { status: result.committed ? 201 : 200 })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('INVALID_PARAMS', { message: error instanceof Error ? error.message : 'SceneDetect import failed' })
  }
})
