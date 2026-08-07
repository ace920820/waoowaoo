import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const workbenchPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx'
const hostPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx'

describe('remake workbench host contract', () => {
  it('keeps the workbench read-only and task state in an overlay drawer', () => {
    const source = readFileSync(workbenchPath, 'utf8')
    expect(source).toContain("useRemakeProject(projectId)")
    expect(source).toContain('remake-task-overlay')
    expect(source).toContain('initialProject={null}')
    expect(source).not.toMatch(/onUpload|handleStartAnalysis|saveProject|deleteShot|updateShot/)
  })

  it('passes only native host inputs to the canonical SceneDetect entry', () => {
    const source = readFileSync(hostPath, 'utf8')
    expect(source).toContain("from '@/vendor/scenedetect'")
    expect(source).toContain('SceneDetectIntegrationRuntime')
    expect(source).toContain('initialProject: SceneDetectProject | null')
    expect(source).toContain('runtime: SceneDetectIntegrationRuntime | null')
    expect(source).not.toContain('normalized')
    expect(source).not.toMatch(/vendor\/scenedetect\/(components|utils)/)
  })
})
