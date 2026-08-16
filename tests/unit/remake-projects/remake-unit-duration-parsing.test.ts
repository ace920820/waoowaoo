import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const servicePath = 'src/lib/remake-projects/service.ts'

describe('unit member duration parsing (debug: string timecodes fell back to 3s)', () => {
  it('projection parses string timecodes via parseTimecodeSeconds instead of falling back to 3', () => {
    const source = readFileSync(servicePath, 'utf8')
    expect(source).toContain("import { parseTimecodeSeconds } from './unit/timecode'")
    expect(source).toContain('function timeSideToSeconds')
    // number OR string branch — never the old typeof-number-only check
    expect(source).toContain("if (typeof value === 'string') return parseTimecodeSeconds(value)")
    expect(source).not.toContain("const startSeconds = typeof start === 'number' ? start : null")
    // members projection uses the helper
    expect(source).toContain('const startSeconds = timeSideToSeconds(start)')
    expect(source).toContain('const endSeconds = timeSideToSeconds(end)')
  })
})
