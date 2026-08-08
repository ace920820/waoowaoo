import { describe, expect, it } from 'vitest'
import type { SceneDetectProject } from '@/vendor/scenedetect'
import { commitSceneDetectMutation, toSceneDetectProject } from '@/lib/remake-projects/scenedetect/contracts'
import type { SceneDetectIntegrationRuntime } from '@/lib/remake-projects/scenedetect/integration-runtime'

describe('canonical SceneDetect native contract', () => {
  it('converts the Waoo snapshot through the canonical native project type', () => {
    const snapshot = {
      project: { id: 'p1', name: 'Input' },
      source: { metadata: { fileName: 'input.mp4', size: 1, duration: 1, fps: 30, width: 10, height: 10, totalFrames: 30 } },
      shots: [],
    }
    const native: SceneDetectProject = toSceneDetectProject(snapshot)
    expect(commitSceneDetectMutation({ project: native, baseRevision: 0 }).revision).toBe(1)
  })

  it('projects only the active latest revision and never exposes storage keys or runtime URLs', () => {
    const snapshot = {
      project: { id: 'p1', name: 'Input' },
      source: { metadata: { fileName: 'input.mp4', size: 1, duration: 1, fps: 30, width: 10, height: 10, totalFrames: 30 } },
      shots: [
        { id: 'waoo-shot-1', stableKey: 'opaque', sequence: 1, provenance: [{ payload: '{"storageKey":"private/key"}' }], revisions: [
          { revision: 1, lifecycleState: 'retired', payload: JSON.stringify({ startFrame: 0, endFrame: 10, durationFrames: 11 }) },
          { revision: 2, lifecycleState: 'active', payload: JSON.stringify({ startFrame: 1, endFrame: 20, durationFrames: 20, mediaIds: { first: 'media-first' }, firstFrameUrl: 'blob:runtime' }) },
        ] },
      ],
    }
    const native = toSceneDetectProject(snapshot)
    expect(native.shots).toHaveLength(1)
    expect(native.shots[0]).toMatchObject({ id: 'waoo-shot-1', startFrame: 1, mediaIds: { first: 'media-first' } })
    expect(JSON.stringify(native)).not.toContain('private/key')
    expect(JSON.stringify(native)).not.toContain('blob:runtime')
  })

  it('keeps runtime ports native and leaves export disabled in Phase 5', () => {
    const runtimeShape: Pick<SceneDetectIntegrationRuntime, 'canExport' | 'loadProject' | 'saveProject'> = {
      canExport: () => false,
      loadProject: async () => null,
      saveProject: async () => undefined,
    }
    expect(runtimeShape.canExport()).toBe(false)
  })
})
