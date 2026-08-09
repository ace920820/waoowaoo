import { describe, expect, it } from 'vitest'
import {
  commitSceneDetectMutation,
  parseSceneDetectInput,
  toSceneDetectProject,
} from '@/lib/remake-projects/scenedetect/contracts'
import { createExternalShotKey, resolveWaooShotId } from '@/lib/remake-projects/scenedetect/id-map'

const shot = {
  id: 'external-shot-1',
  shotNumber: 3,
  rawStartFrame: 10,
  rawEndFrame: 30,
  startFrame: 10,
  endFrame: 30,
  startTimecode: '00:00:00.333',
  endTimecode: '00:00:01.000',
  duration: 0.7,
  durationFrames: 21,
  firstFrameUrl: 'https://media.example/first.jpg',
  middleFrameUrl: 'https://media.example/middle.jpg',
  lastFrameUrl: 'https://media.example/last.jpg',
  keyframeFrames: { first: 10, middle: 20, last: 30 },
  keyframeSource: 'AI' as const,
  status: 'pending' as const,
  modifiedSource: 'AI' as const,
  tags: [],
  notes: '',
}

const project = {
  schemaVersion: 2 as const,
  type: 'scenedetect-project' as const,
  project: { id: 'analysis-1', name: 'Input', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  source: { fileName: 'input.mp4', size: 100, duration: 2, fps: 30, width: 1920, height: 1080, totalFrames: 60, videoUrl: 'blob:runtime' },
  analysis: { detector: 'pySceneDetect' as const, detectorType: 'content' as const, threshold: 27, analyzedAt: '2026-01-01T00:00:00.000Z', status: 'analyzed_review' as const },
  view: { currentFrame: 10, activeShotId: 'external-shot-1' },
  shots: [shot],
}

describe('SceneDetect adapter contracts', () => {
  it('accepts schema v2 and rejects unknown versions or invalid frame ranges', () => {
    expect(parseSceneDetectInput(project).shots).toHaveLength(1)
    expect(() => parseSceneDetectInput({ ...project, schemaVersion: 3 })).toThrow(/schema/i)
    expect(() => parseSceneDetectInput({ ...project, shots: [{ ...shot, endFrame: 5 }] })).toThrow(/frame/i)
  })

  it('keeps Waoo IDs stable across repeated analysis runs of the same source', () => {
    const key = createExternalShotKey('project-1', 'analysis-1', shot.id)
    const first = resolveWaooShotId(key, new Map())
    const replay = resolveWaooShotId(key, new Map([[key, first]]))
    expect(replay).toBe(first)
    expect(createExternalShotKey('project-1', 'analysis-2', shot.id)).toBe(key)
    expect(createExternalShotKey('project-1', 'analysis-2', 'external-shot-2')).not.toBe(key)
  })

  it('round-trips native project fields and emits a revision command for native mutation', () => {
    const snapshot = {
      project: { id: 'waoo-project-1', name: 'Input', type: 'remake' },
      source: { status: 'analyzed', mediaId: null, metadata: project.source },
      shots: [{ id: 'waoo-shot-1', stableKey: 'analysis-1:external-shot-1', sequence: 3, reviewStatus: 'pending', needsReview: false, revisions: [], provenance: [] }],
    }
    const native = toSceneDetectProject(snapshot)
    expect(native.shots[0]?.shotNumber).toBe(3)
    expect(native.source.videoUrl).toBeUndefined()
    expect(commitSceneDetectMutation({ project: { ...native, shots: [{ ...native.shots[0], endFrame: 31 }] }, baseRevision: 1 })).toMatchObject({
      revision: 2,
      shots: [{ stableKey: 'waoo-shot-1', changeReason: 'native_mutation' }],
    })
  })
})
