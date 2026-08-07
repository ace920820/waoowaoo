import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

describe('SceneDetect canonical source boundary', () => {
  it('allows only the canonical index import and no copied editor source', () => {
    let output = ''
    try {
      output = execFileSync('rg', ['-l', "vendor/scenedetect/(components|utils)|function App\\(", 'src/app', 'src/lib'], { encoding: 'utf8' })
    } catch (error) {
      output = (error as { stdout?: string }).stdout || ''
    }
    const matches = output.trim().split('\n').filter(Boolean)
    expect(matches).toEqual([])
  })
})
