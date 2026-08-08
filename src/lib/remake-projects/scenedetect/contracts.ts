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
  /** Server-owned opaque media references. URL fields are legacy/editor-only. */
  mediaIds?: { first?: string; middle?: string; last?: string }
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
  const seenIds = new Set<string>()
  let previousShot: SceneDetectShot | undefined
  for (const shot of project.shots) {
    if (seenIds.has(shot.id)) throw new Error('SCENEDETECT_SHOT_ORDER_INVALID')
    seenIds.add(shot.id)
    if (
      shot.rawStartFrame > shot.rawEndFrame ||
      shot.rawEndFrame >= project.source.totalFrames ||
      shot.startFrame > shot.endFrame ||
      shot.endFrame >= project.source.totalFrames
    ) {
      throw new Error('SCENEDETECT_FRAME_RANGE_INVALID')
    }
    if (previousShot && (shot.shotNumber <= previousShot.shotNumber || shot.startFrame <= previousShot.endFrame)) {
      throw new Error('SCENEDETECT_SHOT_ORDER_INVALID')
    }
    const keyframes = shot.keyframeFrames
    if (keyframes && (
      keyframes.first < shot.startFrame ||
      keyframes.middle < shot.startFrame ||
      keyframes.last < shot.startFrame ||
      keyframes.first > shot.endFrame ||
      keyframes.middle > shot.endFrame ||
      keyframes.last > shot.endFrame ||
      keyframes.first > keyframes.middle ||
      keyframes.middle > keyframes.last
    )) {
      throw new Error('SCENEDETECT_KEYFRAME_RANGE_INVALID')
    }
    previousShot = shot
  }
  if (project.view.currentFrame >= project.source.totalFrames) throw new Error('SCENEDETECT_FRAME_RANGE_INVALID')
  if (project.view.activeShotId && !seenIds.has(project.view.activeShotId)) throw new Error('SCENEDETECT_ACTIVE_SHOT_INVALID')
  return project
}

export function parseSceneDetectInput(input: unknown, options: { legacyMode?: boolean } = {}): SceneDetectProject {
  const record = typeof input === 'object' && input !== null ? input as Record<string, unknown> : null
  const candidate = options.legacyMode && record && !('schemaVersion' in record) && record.project
    ? record.project
    : input
  const result = projectShape.safeParse(candidate)
  if (!result.success) {
    const hasMetadataIssue = result.error.issues.some((issue) => issue.path[0] === 'source' || issue.path[0] === 'analysis')
    throw new Error(hasMetadataIssue ? 'SCENEDETECT_METADATA_INVALID' : 'SCENEDETECT_PAYLOAD_SCHEMA_INVALID')
  }
  const parsed = result.data as unknown as SceneDetectProject
  return assertFrameBounds({
    ...parsed,
    shots: parsed.shots.map((shot) => ({ ...shot, confidence: shot.confidence ?? undefined })),
  })
}

type Snapshot = {
  project: { id: string; name: string }
  source: { metadata?: SceneDetectProject['source'] | null }
  shots: Array<{ id: string; stableKey: string; sequence: number | null; revisions?: Array<{ revision?: number; lifecycleState?: string; payload?: string | null }>; provenance?: Array<{ payload?: string | null }> }>
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
    shots: snapshot.shots.filter((shot) => {
      if (!shot.revisions?.length) return true
      const latest = shot.revisions?.filter((revision) => {
        const row = revision as Record<string, unknown>
        return row.lifecycleState === undefined || row.lifecycleState === 'active'
      }).sort((a, b) => Number((b as Record<string, unknown>).revision ?? 0) - Number((a as Record<string, unknown>).revision ?? 0))[0]
      return Boolean(latest)
    }).map((shot) => {
      const latest = shot.revisions?.filter((revision) => {
        const row = revision as Record<string, unknown>
        return row.lifecycleState === undefined || row.lifecycleState === 'active'
      }).sort((a, b) => Number((b as Record<string, unknown>).revision ?? 0) - Number((a as Record<string, unknown>).revision ?? 0))[0]
      const parsed = latest?.payload
      const payload = parsed ? JSON.parse(parsed) as Partial<SceneDetectShot> : {}
      const mediaIds = payload.mediaIds
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
        firstFrameUrl: '',
        middleFrameUrl: '',
        lastFrameUrl: '',
        mediaIds,
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
      payload: JSON.stringify({ ...shot, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '' }),
      provenance: { schema: 'scenedetect.v2', executor: 'scenedetect', capability: 'native-editor' },
    })),
  }
}
