import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('remake prompt analyze route architecture', () => {
  it('submits strict task descriptors without importing a child-process boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/api/remake-projects/[projectId]/prompts/analyze/route.ts'), 'utf8')
    expect(source).toContain('buildRemakePromptTaskDescriptor')
    expect(source).toContain('submitTask')
    expect(source).not.toMatch(/child_process|spawn\(|codex exec/)
  })
})
