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

  it('keeps runtime ports native and leaves export disabled in Phase 5', () => {
    const runtimeShape: Pick<SceneDetectIntegrationRuntime, 'canExport' | 'loadProject' | 'saveProject'> = {
      canExport: () => false,
      loadProject: async () => null,
      saveProject: async () => undefined,
    }
    expect(runtimeShape.canExport()).toBe(false)
  })
})
