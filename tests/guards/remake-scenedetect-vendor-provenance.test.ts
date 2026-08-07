import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('SceneDetect vendor provenance', () => {
  it('has a valid synchronized manifest with no unregistered patches', () => {
    expect(() => execFileSync('node', ['scripts/vendor-scenedetect.mjs', '--check'], { encoding: 'utf8' })).not.toThrow()
    const manifest = JSON.parse(readFileSync('src/vendor/scenedetect/VENDOR.json', 'utf8')) as { sourceFiles: unknown[]; allowedPatches: unknown[] }
    expect(manifest.sourceFiles.length).toBeGreaterThan(1)
    expect(manifest.allowedPatches).toEqual([])
  })
})
