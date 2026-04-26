import { describe, expect, it } from 'vitest'
import {
  extractStoryboardPackageJsonFromMarkdown,
  parseStoryboardPackageText,
} from '@/lib/novel-promotion/storyboard-package'
import { buildValidStoryboardPackage } from './storyboard-package-fixtures'

function stringifyPackage() {
  return JSON.stringify(buildValidStoryboardPackage(), null, 2)
}

describe('storyboard package parser', () => {
  it('parses raw JSON package text', () => {
    const result = parseStoryboardPackageText(stringifyPackage(), { filename: 'package.json' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.packageId).toBe('A13_EMPTY_ROOM_V1_3')
    }
  })

  it('extracts and parses Markdown fenced storyboard package JSON', () => {
    const markdown = [
      '# Human readable package',
      '',
      '```waoo-storyboard-package+json',
      stringifyPackage(),
      '```',
    ].join('\n')

    const result = parseStoryboardPackageText(markdown, { filename: 'package.md' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scenes[0].segments[0].segmentId).toBe('A13_SEG_001')
    }
  })

  it('extracts only the import fenced block from Markdown', () => {
    const markdown = [
      '```json',
      '{ "ignored": true }',
      '```',
      '```waoo-storyboard-package+json title="Waoo"',
      stringifyPackage(),
      '```',
    ].join('\n')

    const extracted = extractStoryboardPackageJsonFromMarkdown(markdown)

    expect(extracted).toContain('waoo.storyboard_package')
    expect(extracted).not.toContain('ignored')
  })

  it('rejects Markdown without the import fenced block', () => {
    const result = parseStoryboardPackageText('# Storyboard\n\n| shot | prompt |', { filename: 'package.md' })

    expect(result).toEqual({
      success: false,
      error: {
        code: 'MISSING_MARKDOWN_BLOCK',
        message: 'Markdown storyboard packages must include a fenced ```waoo-storyboard-package+json block.',
      },
    })
  })

  it('rejects malformed JSON without leaking stack traces', () => {
    const result = parseStoryboardPackageText('{ invalid json', { filename: 'package.json' })

    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Storyboard package JSON is malformed.',
      },
    })
  })

  it('preserves validation paths for invalid schema failures', () => {
    const result = parseStoryboardPackageText(JSON.stringify({
      ...buildValidStoryboardPackage(),
      schemaVersion: '2.0',
    }))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'schemaVersion' }),
      ]))
    }
  })

  it('rejects empty input', () => {
    const result = parseStoryboardPackageText('   ')

    expect(result).toEqual({
      success: false,
      error: {
        code: 'EMPTY_INPUT',
        message: 'Storyboard package content is empty.',
      },
    })
  })
})
