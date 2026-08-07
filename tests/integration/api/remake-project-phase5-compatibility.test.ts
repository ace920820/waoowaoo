import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { commitSceneDetectMutation, toSceneDetectProject } from '@/lib/remake-projects/scenedetect/contracts'
import { buildSceneDetectTaskDescriptor } from '@/lib/remake-projects/scenedetect/task-contract'

describe('Phase 5 remake compatibility matrix', () => {
  it('keeps old project routing and remake host boundaries separate', () => {
    const projectRoute = readFileSync('src/app/api/projects/route.ts', 'utf8')
    const workbench = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx', 'utf8')
    expect(projectRoute).toContain("type === 'remake'")
    expect(workbench).toContain('useRemakeProject(projectId)')
    expect(workbench).toContain('enabled={false}')
  })

  it('round-trips stable native shot identity and preserves provenance', () => {
    const project = toSceneDetectProject({
      project: { id: 'p1', name: 'Input' },
      source: { metadata: { fileName: 'input.mp4', size: 1, duration: 1, fps: 30, width: 10, height: 10, totalFrames: 30 } },
      shots: [{ id: 'stable-shot-1', stableKey: 'stable-shot-1', sequence: 1, revisions: [], provenance: [] }],
    })
    const result = commitSceneDetectMutation({ project, baseRevision: 2 })
    expect(result.revision).toBe(3)
    expect(result.shots[0]).toMatchObject({ stableKey: 'stable-shot-1', externalIdentity: 'stable-shot-1' })
    expect(result.shots[0]?.provenance).toEqual({ schema: 'scenedetect.v2', executor: 'scenedetect', capability: 'native-editor' })
  })

  it('uses the unified task descriptor and does not create a parallel queue contract', () => {
    const descriptor = buildSceneDetectTaskDescriptor({ projectId: 'p1', sourceRevision: 2, shotRevision: 1, adapterVersion: 'v1', operationKey: 'op-1', operation: 'analyze' })
    expect(descriptor.taskType).toBe('scenedetect_analyze')
    expect(descriptor.dedupeKey).toContain('p1')
  })
})
