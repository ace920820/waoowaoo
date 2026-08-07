import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('remake workbench message loading', () => {
  it('loads and exposes the remake workbench namespace for every supported locale', () => {
    const source = readFileSync('src/i18n.ts', 'utf8')

    expect(source).toContain('import(`../messages/${locale}/remake-workbench.json`)')
    expect(source).toContain('remakeWorkbench: remakeWorkbench.default')
  })
})
