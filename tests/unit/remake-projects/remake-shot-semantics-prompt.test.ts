import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ShotSemanticsPanel - 画面描述 Prompt 集成', () => {
  const panelPath = resolve(
    process.cwd(),
    'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx',
  )
  const source = readFileSync(panelPath, 'utf8')

  it('「画面描述」显示当前选中帧的图片 Prompt', () => {
    expect(source).toMatch(/imagePrompts\[currentPromptSlot\]/)
  })

  it('原 description 字段改名为「镜头语义描述」', () => {
    expect(source).toContain('镜头语义描述')
  })

  it('使用独立的 Prompt 保存函数（与 semantics 保存分开）', () => {
    expect(source).toMatch(/handlePromptSave|savePromptEdit/)
  })

  it('使用 useSaveAndAdoptRemakePrompt hook', () => {
    expect(source).toContain('useSaveAndAdoptRemakePrompt')
  })

  it('视频 Prompt 不受图片帧切换影响', () => {
    expect(source).toContain('videoPrompt')
    expect(source).not.toMatch(/videoPrompt\[.*activeSlot.*\]/)
  })

  it('Prompt 状态卡片简化（只显示状态和版本，不重复完整文本）', () => {
    // PromptStatusCard 不再显示 coreText 全文
    const cardMatch = source.match(/function PromptStatusCard[\s\S]*?\n\}\n/)
    expect(cardMatch).toBeTruthy()
    const cardBody = cardMatch![0]
    expect(cardBody).not.toContain('line-clamp-2')
    expect(cardBody).toContain('版本')
  })
})
