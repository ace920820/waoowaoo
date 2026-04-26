import {
  type StoryboardPackage,
  type StoryboardPackageValidationIssue,
  validateStoryboardPackage,
} from './schema'

export type StoryboardPackageParseErrorCode =
  | 'EMPTY_INPUT'
  | 'MISSING_MARKDOWN_BLOCK'
  | 'INVALID_JSON'
  | 'VALIDATION_FAILED'

export type StoryboardPackageParseError = {
  code: StoryboardPackageParseErrorCode
  message: string
  issues?: StoryboardPackageValidationIssue[]
}

export type StoryboardPackageParseResult =
  | { success: true; data: StoryboardPackage }
  | { success: false; error: StoryboardPackageParseError }

type ParseOptions = {
  filename?: string | null
  contentType?: string | null
}

const FENCE_INFO = 'waoo-storyboard-package+json'

function looksLikeJson(text: string, options?: ParseOptions) {
  const filename = options?.filename?.toLowerCase() || ''
  const contentType = options?.contentType?.toLowerCase() || ''
  return text.startsWith('{')
    || text.startsWith('[')
    || filename.endsWith('.json')
    || contentType.includes('application/json')
}

function parseJsonText(text: string): StoryboardPackageParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return {
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Storyboard package JSON is malformed.',
      },
    }
  }

  const validated = validateStoryboardPackage(value)
  if (validated.success) {
    return { success: true, data: validated.data }
  }

  return {
    success: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Storyboard package failed schema validation.',
      issues: validated.issues,
    },
  }
}

export function extractStoryboardPackageJsonFromMarkdown(markdown: string): string | null {
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(markdown)) !== null) {
    const info = match[1]?.trim().split(/\s+/)[0] || ''
    if (info === FENCE_INFO) {
      return match[2].trim()
    }
  }
  return null
}

export function parseStoryboardPackageText(
  text: string,
  options?: ParseOptions,
): StoryboardPackageParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      success: false,
      error: {
        code: 'EMPTY_INPUT',
        message: 'Storyboard package content is empty.',
      },
    }
  }

  if (looksLikeJson(trimmed, options)) {
    return parseJsonText(trimmed)
  }

  const fencedJson = extractStoryboardPackageJsonFromMarkdown(trimmed)
  if (!fencedJson) {
    return {
      success: false,
      error: {
        code: 'MISSING_MARKDOWN_BLOCK',
        message: 'Markdown storyboard packages must include a fenced ```waoo-storyboard-package+json block.',
      },
    }
  }

  return parseJsonText(fencedJson)
}
