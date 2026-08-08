import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('SceneDetect production host', () => {
  it('mounts only the canonical embedded App with a native runtime', () => {
    const source = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx', 'utf8')
    expect(source).toContain("from '@/vendor/scenedetect'")
    expect(source).toMatch(/<CanonicalSceneDetectEmbeddedApp\b[\s\S]*?\bembedded/)
    expect(source).toContain('.loadProject(projectId)')
  })
})
