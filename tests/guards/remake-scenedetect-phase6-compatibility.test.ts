import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('SceneDetect Phase 6 compatibility', () => {
  it('keeps vendor provenance and canonical host import intact', () => {
    expect(() => execFileSync('node', ['scripts/vendor-scenedetect.mjs', '--check'], { encoding: 'utf8' })).not.toThrow()
    const host = readFileSync('src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx', 'utf8')
    expect(host).toContain("from '@/vendor/scenedetect'")
    expect(host).not.toContain("from '@/vendor/scenedetect/components")
  })
})
