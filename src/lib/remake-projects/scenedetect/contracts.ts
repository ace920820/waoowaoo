import { z } from 'zod'

export type SceneDetectShotStatus = 'keep' | 'pending' | 'discard'
export type SceneDetectAnalysisStatus = 'idle' | 'uploaded_pending' | 'analyzing' | 'analyzed_review' | 'adjusted' | 'exported'

export interface SceneDetectShot {
  id: string
  shotNumber: number
  rawStartFrame: number
  rawEndFrame: number
  startFrame: number
  endFrame: number
  startTimecode: string
  endTimecode: string
  duration: number
  durationFrames: number
  firstFrameUrl: string
  middleFrameUrl: string
  lastFrameUrl: string
  keyframeFrames?: { first: number; middle: number; last: number }
  keyframeSource?: 'AI' | 'USER'
  status: SceneDetectShotStatus
  modifiedSource: 'AI' | 'USER'
  tags: string[]
  notes: string
  confidence?: number
}

export interface SceneDetectProject {
  schemaVersion: 2
  type: 'scenedetect-project'
  project: { id: string; name: string; createdAt: string; updatedAt: string }
  source: { fileName: string; size: number; duration: number; fps: number; width: number; height: number; totalFrames: number; videoUrl?: string }
  analysis: { detector: 'pySceneDetect'; detectorType: 'content'; threshold: number; analyzedAt: string; status: SceneDetectAnalysisStatus }
  view: { currentFrame: number; activeShotId: string | null }
  shots: SceneDetectShot[]
}

const frameShape = z.object({
  first: z.number().int().nonnegative(),
  middle: z.number().int().nonnegative(),
  last: z.number().int().nonnegative(),
})

const shotShape = z.object({
  id: z.string().min(1),
  shotNumber: z.number().int().nonnegative(),
  rawStartFrame: z.number().int().nonnegative(),
  rawEndFrame: z.number().int().nonnegative(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  startTimecode: z.string(),
  endTimecode: z.string(),
  duration: z.number().nonnegative(),
  durationFrames: z.number().int().positive(),
  firstFrameUrl: z.string(),
  middleFrameUrl: z.string(),
  lastFrameUrl: z.string(),
  keyframeFrames: frameShape.optional(),
  keyframeSource: z.enum(['AI', 'USER']).optional(),
  status: z.enum(['keep', 'pending', 'discard']),
  modifiedSource: z.enum(['AI', 'USER']),
  tags: z.array(z.string()),
  notes: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

const projectShape = z.object({
  schemaVersion: z.literal(2),
  type: z.literal('scenedetect-project'),
  project: z.object({ id: z.string().min(1), name: z.string(), createdAt: z.string(), updatedAt: z.string() }),
  source: z.object({ fileName: z.string(), size: z.number().nonnegative(), duration: z.number().nonnegative(), fps: z.number().positive(), width: z.number().int().positive(), height: z.number().int().positive(), totalFrames: z.number().int().positive(), videoUrl: z.string().optional() }),
  analysis: z.object({ detector: z.literal('pySceneDetect'), detectorType: z.literal('content'), threshold: z.number().nonnegative(), analyzedAt: z.string(), status: z.enum(['idle', 'uploaded_pending', 'analyzing', 'analyzed_review', 'adjusted', 'exported']) }),
  view: z.object({ currentFrame: z.number().int().nonnegative(), activeShotId: z.string().nullable() }),
  shots: z.array(shotShape),
}).passthrough()

function assertFrameBounds(project: SceneDetectProject): SceneDetectProject {
  for (const shot of project.shots) {
    if (shot.rawStartFrame > shot.rawEndFrame || shot.startFrame > shot.endFrame || shot.endFrame >= project.source.totalFrames) {
      throw new Error(`Invalid frame range for shot ${shot.id}`)
    }
    const keyframes = shot.keyframeFrames
    if (keyframes && (keyframes.first < shot.startFrame || keyframes.middle < shot.startFrame || keyframes.last > shot.endFrame)) {
      throw new Error(`Invalid keyframe range for shot ${shot.id}`)
    }
  }
  return project
}

export function parseSceneDetectInput(input: unknown): SceneDetectProject {
  const record = typeof input === 'object' && input !== null ? input as Record<string, unknown> : null
  const candidate = record && !('schemaVersion' in record) && record.project
    ? record.project
    : input
  const parsed = projectShape.parse(candidate) as unknown as SceneDetectProject
  return assertFrameBounds({
    ...parsed,
    shots: parsed.shots.map((shot) => ({ ...shot, confidence: shot.confidence ?? undefined })),
  })
}

type Snapshot = {
  project: { id: string; name: string }
  source: { metadata?: SceneDetectProject['source'] | null }
  shots: Array<{ id: string; stableKey: string; sequence: number | null; revisions?: Array<{ payload?: string | null }>; provenance?: Array<{ payload?: string | null }> }>
}

export function toSceneDetectProject(snapshot: Snapshot): SceneDetectProject {
  const metadata = snapshot.source.metadata
  if (!metadata) throw new Error('Remake source metadata is required')
  const now = new Date().toISOString()
  return {
    schemaVersion: 2,
    type: 'scenedetect-project',
    project: { id: snapshot.project.id, name: snapshot.project.name, createdAt: now, updatedAt: now },
    source: { ...metadata, videoUrl: undefined },
    analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: 27, analyzedAt: now, status: 'analyzed_review' },
    view: { currentFrame: 0, activeShotId: null },
    shots: snapshot.shots.map((shot) => {
      const parsed = shot.revisions?.[shot.revisions.length - 1]?.payload
      const payload = parsed ? JSON.parse(parsed) as Partial<SceneDetectShot> : {}
      return {
        id: shot.id,
        shotNumber: shot.sequence ?? 0,
        rawStartFrame: payload.rawStartFrame ?? 0,
        rawEndFrame: payload.rawEndFrame ?? 0,
        startFrame: payload.startFrame ?? 0,
        endFrame: payload.endFrame ?? 0,
        startTimecode: payload.startTimecode ?? '',
        endTimecode: payload.endTimecode ?? '',
        duration: payload.duration ?? 0,
        durationFrames: payload.durationFrames ?? 1,
        firstFrameUrl: payload.firstFrameUrl ?? '',
        middleFrameUrl: payload.middleFrameUrl ?? '',
        lastFrameUrl: payload.lastFrameUrl ?? '',
        keyframeFrames: payload.keyframeFrames,
        keyframeSource: payload.keyframeSource,
        status: payload.status ?? 'pending',
        modifiedSource: payload.modifiedSource ?? 'AI',
        tags: payload.tags ?? [],
        notes: payload.notes ?? '',
        confidence: payload.confidence ?? undefined,
      }
    }),
  }
}

export function commitSceneDetectMutation(input: { project: SceneDetectProject; baseRevision: number }) {
  const project = parseSceneDetectInput(input.project)
  return {
    revision: input.baseRevision + 1,
    source: { metadata: project.source, analysis: project.analysis },
    shots: project.shots.map((shot) => ({
      stableKey: shot.id,
      externalIdentity: shot.id,
      sequence: shot.shotNumber,
      changeReason: 'native_mutation',
      payload: JSON.stringify(shot),
      provenance: { schema: 'scenedetect.v2', executor: 'scenedetect', capability: 'native-editor' },
    })),
  }
}
