import { NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { getRemakeProjectSnapshot } from '@/lib/remake-projects/service'
import { toSceneDetectProject, type SceneDetectProject } from '@/lib/remake-projects/scenedetect/contracts'
import { commitNativeProjectMutation, projectConcurrencyToken } from '@/lib/remake-projects/scenedetect/mutations'

function emptyProject(projectId: string, name: string): SceneDetectProject {
  const now = new Date().toISOString()
  return {
    schemaVersion: 2,
    type: 'scenedetect-project',
    project: { id: projectId, name, createdAt: now, updatedAt: now },
    source: { fileName: '', size: 0, duration: 0, fps: 1, width: 1, height: 1, totalFrames: 1 },
    analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: 27, analyzedAt: now, status: 'idle' },
    view: { currentFrame: 0, activeShotId: null },
    shots: [],
  }
}

function mediaUrl(projectId: string, mediaId: string | undefined): string {
  return mediaId ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}` : ''
}

function addOpaqueMediaUrls(projectId: string, project: SceneDetectProject): SceneDetectProject {
  return {
    ...project,
    source: { ...project.source, videoUrl: project.source.videoUrl ? mediaUrl(projectId, project.source.videoUrl) : undefined },
    shots: project.shots.map((shot) => ({
      ...shot,
      firstFrameUrl: mediaUrl(projectId, shot.mediaIds?.first),
      middleFrameUrl: mediaUrl(projectId, shot.mediaIds?.middle),
      lastFrameUrl: mediaUrl(projectId, shot.mediaIds?.last),
    })),
  }
}

export const GET = apiHandler(async (_request: Request, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const snapshot = await getRemakeProjectSnapshot({ projectId, userId: auth.session.user.id })
  if (!snapshot) throw new ApiError('NOT_FOUND')
  const native = snapshot.source.metadata
    ? addOpaqueMediaUrls(projectId, {
      ...toSceneDetectProject(snapshot as Parameters<typeof toSceneDetectProject>[0]),
      source: { ...toSceneDetectProject(snapshot as Parameters<typeof toSceneDetectProject>[0]).source, videoUrl: typeof snapshot.source.mediaId === 'string' ? snapshot.source.mediaId : undefined },
    })
    : emptyProject(projectId, String(snapshot.project.name || ''))
  const token = projectConcurrencyToken({ sourceRevision: typeof snapshot.source.sourceRevision === 'number' ? snapshot.source.sourceRevision : null, shots: snapshot.shots.map((shot) => ({ id: String(shot.id), currentRevision: typeof shot.currentRevision === 'number' ? shot.currentRevision : null, version: typeof shot.version === 'number' ? shot.version : 0 })) })
  return NextResponse.json({ project: native, empty: !snapshot.source.metadata, sourceRevision: snapshot.source.sourceRevision ?? null, token })
})

export const PUT = apiHandler(async (request: Request, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  const ifMatch = request.headers.get('if-match')?.trim()
  if (!ifMatch) throw new ApiError('INVALID_PARAMS', { message: 'If-Match is required' })
  const body = await request.json() as Record<string, unknown>
  if (!body.project || typeof body.project !== 'object') throw new ApiError('INVALID_PARAMS', { message: 'project is required' })
  try {
    const result = await commitNativeProjectMutation({ projectId, userId: auth.session.user.id, project: body.project, ifMatch, operationKey: typeof body.operationKey === 'string' ? body.operationKey : undefined })
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: string }).code === 'SCENEDETECT_CONFLICT') {
      const conflict = error as Error & { currentToken?: string; currentProject?: SceneDetectProject | null }
      return NextResponse.json({ code: 'CONFLICT', current: conflict.currentProject, token: conflict.currentToken }, { status: 409 })
    }
    if (error instanceof ApiError) throw error
    throw new ApiError('INVALID_PARAMS', { message: error instanceof Error ? error.message : 'SceneDetect mutation failed' })
  }
})
