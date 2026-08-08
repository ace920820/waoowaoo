import { NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { getRemakeProjectSnapshot } from '@/lib/remake-projects/service'
import { toSceneDetectProject, type SceneDetectProject } from '@/lib/remake-projects/scenedetect/contracts'

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
  return NextResponse.json({ project: native, empty: !snapshot.source.metadata, sourceRevision: snapshot.source.sourceRevision ?? null })
})
