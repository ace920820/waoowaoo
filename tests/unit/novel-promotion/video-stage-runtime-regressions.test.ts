import { describe, expect, it } from 'vitest'
import { resolveVisibleBaseVideoUrl } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/shared'
import { resolveLocalPromptValue } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPromptState'

describe('video stage regressions', () => {
  it('keeps an incoming last-frame panel video visible when the panel itself is not linked outward', () => {
    expect(resolveVisibleBaseVideoUrl({
      videoUrl: 'https://example.com/panel-2.mp4',
      videoGenerationMode: 'normal',
      isLinked: false,
    })).toBe('https://example.com/panel-2.mp4')
  })

  it('shows the derived first-last-frame prompt until the linked prompt is explicitly edited', () => {
    expect(resolveLocalPromptValue({
      panelPrompts: new Map([
        ['firstLastFramePrompt:sb-1-0', ''],
      ]),
      dirtyPrompts: new Set(),
      panelKey: 'sb-1-0',
      field: 'firstLastFramePrompt',
      externalPrompt: 'panel 1 prompt then transition to panel 2 prompt',
    })).toBe('panel 1 prompt then transition to panel 2 prompt')
  })

  it('preserves an intentionally cleared first-last-frame prompt after the user edits it', () => {
    expect(resolveLocalPromptValue({
      panelPrompts: new Map([
        ['firstLastFramePrompt:sb-1-0', ''],
      ]),
      dirtyPrompts: new Set(['firstLastFramePrompt:sb-1-0']),
      panelKey: 'sb-1-0',
      field: 'firstLastFramePrompt',
      externalPrompt: 'panel 1 prompt then transition to panel 2 prompt',
    })).toBe('')
  })
})
