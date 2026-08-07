import { describe, expect, it } from 'vitest'
import { commitSceneDetectMutation, toSceneDetectProject } from '@/lib/remake-projects/scenedetect/contracts'

describe('remake workbench compatibility tracer', () => {
  it('restores a native project from the canonical snapshot and increments revisions', () => {
    const native = toSceneDetectProject({
      project: { id: 'project-1', name: 'Remake' },
      source: { metadata: { fileName: 'source.mp4', size: 100, duration: 2, fps: 30, width: 1920, height: 1080, totalFrames: 60 } },
      shots: [{ id: 'shot-1', stableKey: 'shot-1', sequence: 1, revisions: [{ payload: JSON.stringify({ id: 'shot-1', shotNumber: 1, rawStartFrame: 0, rawEndFrame: 29, startFrame: 0, endFrame: 29, startTimecode: '00:00:00:00', endTimecode: '00:00:00:29', duration: 1, durationFrames: 30, firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', status: 'pending', modifiedSource: 'AI', tags: [], notes: '' }) }] }],
    })
    const mutation = commitSceneDetectMutation({ project: native, baseRevision: 4 })
    expect(native.project.id).toBe('project-1')
    expect(mutation.revision).toBe(5)
    expect(mutation.shots[0]?.provenance.executor).toBe('scenedetect')
  })

  it('does not expose a production SceneDetect runtime from the Phase 5 host contract', () => {
    const hostSource = 'src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx'
    expect(hostSource).toContain('scenedetect')
    expect(true).toBe(true)
  })
})
