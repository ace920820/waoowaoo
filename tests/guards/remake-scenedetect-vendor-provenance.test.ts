import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('SceneDetect vendor provenance', () => {
  it('has a valid synchronized manifest with no unregistered patches', () => {
    expect(() => execFileSync('node', ['scripts/vendor-scenedetect.mjs', '--check'], { encoding: 'utf8' })).not.toThrow()
    const manifest = JSON.parse(readFileSync('src/vendor/scenedetect/VENDOR.json', 'utf8')) as { sourceFiles: unknown[]; patches: Array<{ id: string; file: string; sha256: string }> }
    expect(manifest.sourceFiles.length).toBeGreaterThan(1)
    expect(manifest.patches).toEqual([
      expect.objectContaining({ id: 'embedded-runtime', file: 'scripts/vendor-scenedetect-patches/embedded-runtime.patch' }),
    ])
    expect(manifest.patches[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
