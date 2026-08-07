import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('remake workbench host contract', () => {
  it('keeps production SceneDetect disabled and uses the canonical host', () => {
    const workbench = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx', 'utf8')
    const host = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx', 'utf8')
    expect(workbench).toContain('initialProject={null}')
    expect(workbench).toContain('remake-task-overlay')
    expect(host).toContain("from '@/vendor/scenedetect'")
    expect(host).toContain('SceneDetectIntegrationRuntime')
    expect(host).not.toMatch(/vendor\/scenedetect\/(components|utils)/)
  })
})
