import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const modalPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/KeyframePreviewModal.tsx'
const stagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx'

describe('Remake keyframe preview modal contract', () => {
  it('KeyframePreviewModal component exists with expected props', () => {
    const source = readFileSync(modalPath, 'utf8')
    expect(source).toContain('KeyframePreviewModal')
    expect(source).toContain('onClose')
    // Must show the main image
    expect(source).toContain('img')
    // Must have candidate thumbnails for switching
    expect(source).toContain('candidate')
  })

  it('preview modal has action bar with key operations', () => {
    const source = readFileSync(modalPath, 'utf8')
    // Download
    expect(source).toMatch(/下载|download/i)
    // Regenerate
    expect(source).toMatch(/重新生成|regenerate/i)
    // Adopt
    expect(source).toMatch(/采用此版本|adopt/i)
    // Restore previous
    expect(source).toMatch(/恢复上一版本|restore|previous/i)
  })

  it('storyboard stage imports the preview modal and opens it from new frame cards', () => {
    const source = readFileSync(stagePath, 'utf8')
    expect(source).toContain('KeyframePreviewModal')
    // Has state for which slot is being previewed
    expect(source).toContain('previewSlot')
    // 查看数据 only opens the preview modal, not an adoption flow
    expect(source).toContain('onViewData')
  })

  it('clicking candidate in preview does not directly call adopt mutation', () => {
    const source = readFileSync(modalPath, 'utf8')
    // Candidate click handler should not call adopt directly
    // It should only update local preview state
    const candidateClickLines = source.split('\n').filter((line) =>
      /onClick.*candidate.*adopt|adopt.*candidate.*onClick/i.test(line),
    )
    expect(candidateClickLines.length).toBe(0)
  })
})
