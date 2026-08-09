import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const requiredPromptKeys = [
  'prompt', 'imagePrompt', 'videoPrompt', 'analyzeVideo', 'reanalyzeVideo',
  'queued', 'running', 'failed', 'pendingReview', 'approved', 'needsReview',
  'all',
  'versionHistory', 'edit', 'saveAsNewVersion', 'approveAndAdopt', 'fullAnalysis',
] as const

describe('remake workbench message loading', () => {
  it('loads and exposes the remake workbench namespace for every supported locale', () => {
    const source = readFileSync('src/i18n.ts', 'utf8')

    expect(source).toContain('import(`../messages/${locale}/remake-workbench.json`)')
    expect(source).toContain('remakeWorkbench: remakeWorkbench.default')
  })

  it('keeps the Prompt workbench states and actions aligned across zh and en', () => {
    const zh = JSON.parse(readFileSync('messages/zh/remake-workbench.json', 'utf8')) as Record<string, unknown>
    const en = JSON.parse(readFileSync('messages/en/remake-workbench.json', 'utf8')) as Record<string, unknown>

    for (const key of requiredPromptKeys) {
      expect(zh).toHaveProperty(key)
      expect(en).toHaveProperty(key)
    }
    expect(zh.stages).toMatchObject({ prompt: expect.any(String) })
    expect(en.stages).toMatchObject({ prompt: expect.any(String) })
  })
})
