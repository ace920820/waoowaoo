import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { ingestRemakeSource, SourceIngestError } from '@/lib/remake-projects/scenedetect/source'

export const POST = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth

  const form = await request.formData().catch(() => { throw new ApiError('INVALID_PARAMS', { details: 'Expected multipart source upload' }) })
  const file = form.get('file')
  const operationKey = typeof form.get('operationKey') === 'string' ? String(form.get('operationKey')).trim() : ''
  if (!(file instanceof File) || !operationKey) throw new ApiError('INVALID_PARAMS', { details: 'file and operationKey are required' })

  try {
    const result = await ingestRemakeSource({ projectId, file, operationKey })
    return NextResponse.json(result.source, { status: result.created ? 201 : 200 })
  } catch (error) {
    if (error instanceof SourceIngestError) throw new ApiError('INVALID_PARAMS', { details: error.message })
    throw error
  }
})
