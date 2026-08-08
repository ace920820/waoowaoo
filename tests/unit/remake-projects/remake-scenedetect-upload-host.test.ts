import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('SceneDetect upload host boundary', () => {
  it('does not create a second upload/editor surface in the Waoo host', () => {
    const source = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx', 'utf8')
    expect(source).not.toContain('type="file"')
    expect(source).not.toContain('Timeline')
    expect(source).not.toContain('ShotInspector')
  })
})
