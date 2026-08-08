import { describe, expect, it } from 'vitest'
import {
  parseSceneDetectResultEnvelope,
  wrapLegacySceneDetectProject,
  type SceneDetectResultEnvelope,
} from '@/lib/remake-projects/scenedetect/result-envelope'

const project = {
  schemaVersion: 2 as const,
  type: 'scenedetect-project' as const,
  project: { id: 'native-project', name: 'Input', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  source: { fileName: 'input.mp4', size: 100, duration: 2, fps: 30, width: 1920, height: 1080, totalFrames: 60 },
  analysis: { detector: 'pySceneDetect' as const, detectorType: 'content' as const, threshold: 27, analyzedAt: '2026-01-01', status: 'analyzed_review' as const },
  view: { currentFrame: 0, activeShotId: null },
  shots: [{
    id: 'shot-1', shotNumber: 1, rawStartFrame: 0, rawEndFrame: 29, startFrame: 0, endFrame: 29,
    startTimecode: '', endTimecode: '', duration: 1, durationFrames: 30,
    firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', status: 'pending' as const,
    modifiedSource: 'AI' as const, tags: [], notes: '', keyframeFrames: { first: 0, middle: 14, last: 29 },
  }],
}

function envelope(overrides: Partial<SceneDetectResultEnvelope> = {}): SceneDetectResultEnvelope {
  return {
    resultVersion: '1.0', adapterVersion: 'scenedetect-adapter@1.0', executorVersion: 'scenedetect-executor@1.0',
    analysisId: 'analysis-1', sourceRevision: 1, operationKey: 'analyze-1', payload: project, ...overrides,
  }
}

describe('SceneDetect result envelope', () => {
  it('accepts a versioned schema v2 result and returns normalized project data', () => {
    const parsed = parseSceneDetectResultEnvelope(envelope())
    expect(parsed.provenance).toMatchObject({ analysisId: 'analysis-1', sourceRevision: 1, operationKey: 'analyze-1' })
    expect(parsed.project.shots[0].id).toBe('shot-1')
  })

  it('rejects unknown major result versions with a stable code', () => {
    expect(() => parseSceneDetectResultEnvelope(envelope({ resultVersion: '2.0' }))).toThrow('SCENEDETECT_RESULT_VERSION_UNSUPPORTED')
  })

  it('rejects a result older than the current source revision', () => {
    expect(() => parseSceneDetectResultEnvelope(envelope(), { currentSourceRevision: 2 })).toThrow('SCENEDETECT_SOURCE_REVISION_STALE')
  })

  it('rejects duplicate shot ids, overlapping ordered shots, and out-of-range keyframes', () => {
    expect(() => parseSceneDetectResultEnvelope(envelope({ payload: { ...project, shots: [project.shots[0], { ...project.shots[0], id: 'shot-2' }] } }))).toThrow('SCENEDETECT_SHOT_ORDER_INVALID')
    expect(() => parseSceneDetectResultEnvelope(envelope({ payload: { ...project, shots: [{ ...project.shots[0], endFrame: 40 }] } }))).toThrow('SCENEDETECT_FRAME_RANGE_INVALID')
    expect(() => parseSceneDetectResultEnvelope(envelope({ payload: { ...project, shots: [{ ...project.shots[0], keyframeFrames: { first: 0, middle: 14, last: 40 } }] } }))).toThrow('SCENEDETECT_KEYFRAME_RANGE_INVALID')
  })

  it('wraps a standalone schema v2 project as explicit legacy provenance', () => {
    const wrapped = wrapLegacySceneDetectProject(project, { sourceRevision: 1, operationKey: 'legacy-1' })
    expect(wrapped.provenance).toMatchObject({ mode: 'legacy_json_import', operationKey: 'legacy-1' })
    expect(() => parseSceneDetectResultEnvelope(project)).toThrow('SCENEDETECT_ENVELOPE_REQUIRED')
  })
})
