import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveVisibleBaseVideoUrl } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/shared'
import { useVideoPanelsProjection } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPanelsProjection'
import { resolveLocalPromptValue } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPromptState'

describe('video stage regressions', () => {
  it('keeps an incoming last-frame panel video visible when the panel itself is not linked outward', () => {
    expect(resolveVisibleBaseVideoUrl({
      videoUrl: 'https://example.com/panel-2.mp4',
      videoGenerationMode: 'normal',
      isLinked: false,
      isLastFrame: true,
    })).toBe('https://example.com/panel-2.mp4')
  })

  it('keeps a middle panel video visible when it is both incoming and linked onward', () => {
    expect(resolveVisibleBaseVideoUrl({
      videoUrl: 'https://example.com/panel-2.mp4',
      videoGenerationMode: 'normal',
      isLinked: true,
      isLastFrame: true,
    })).toBe('https://example.com/panel-2.mp4')
  })

  it('continues hiding an outgoing-only linked panel normal video until a first-last-frame video exists', () => {
    expect(resolveVisibleBaseVideoUrl({
      videoUrl: 'https://example.com/panel-1.mp4',
      videoGenerationMode: 'normal',
      isLinked: true,
      isLastFrame: false,
    })).toBeUndefined()
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

  it('preserves an intentionally cleared first-last-frame prompt after save and reload', () => {
    let persistedPrompt: string | undefined

    function Probe() {
      const { allPanels } = useVideoPanelsProjection({
        storyboards: [{
          id: 'sb-1',
          clipId: 'clip-1',
          panels: [{
            id: 'panel-1',
            panelIndex: 0,
            panelNumber: 1,
            shotType: 'wide',
            description: 'opening shot',
            videoPrompt: 'panel 1 prompt',
            firstLastFramePrompt: '',
            linkedToNextPanel: true,
          }],
        }],
        clips: [{ id: 'clip-1', start: 0, end: 1, summary: 'clip' }],
        panelVideoStates: { getTaskState: () => null },
        panelLipStates: { getTaskState: () => null },
      })
      persistedPrompt = allPanels[0]?.firstLastFramePrompt
      return null
    }

    renderToStaticMarkup(React.createElement(Probe))

    expect(persistedPrompt).toBe('')
    expect(resolveLocalPromptValue({
      panelPrompts: new Map([
        ['firstLastFramePrompt:sb-1-0', ''],
      ]),
      dirtyPrompts: new Set(),
      panelKey: 'sb-1-0',
      field: 'firstLastFramePrompt',
      externalPrompt: '',
    })).toBe('')
  })

  it('renders the single-shot supplement section after shot groups', () => {
    const runtimeSource = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/novel-promotion/stages/video-stage-runtime-core.tsx'),
      'utf8',
    )
    const renderPanelSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel.tsx',
      ),
      'utf8',
    )

    expect(runtimeSource).toContain('sectionTitle="手动补充单镜头"')
    expect(runtimeSource).toContain('sectionDescription="这些镜头作为多镜头片段之外的补充单元独立生成。"')
    expect(runtimeSource.indexOf('<ShotGroupVideoSection')).toBeLessThan(runtimeSource.indexOf('<VideoRenderPanel'))
    expect(renderPanelSource).toContain('sectionTitle?: string')
    expect(renderPanelSource).toContain('sectionDescription?: string')
  })
})
