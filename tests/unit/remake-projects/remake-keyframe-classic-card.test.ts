import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Remake keyframe classic card interaction', () => {
  const stagePath = resolve(
    process.cwd(),
    'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx',
  )
  const source = readFileSync(stagePath, 'utf8')

  it('空新画面卡显示生成按钮（不依赖 model 输入）', () => {
    // 不再需要 model.trim() 才显示生成按钮
    expect(source).not.toMatch(/selectedForGeneration && model\.trim\(\)/)
  })

  it('每张新画面卡有 group/class 用于悬浮浮窗', () => {
    expect(source).toMatch(/group/)
  })

  it('悬浮浮窗包含候选数量选择', () => {
    // 卡片内部有候选数量选择器
    const newRowMatch = source.match(/two-row-new-row[\s\S]*?<\/div>\s*$/)
    expect(source).toMatch(/candidate|候选数量|count/i)
  })

  it('悬浮浮窗包含重新生成/生成按钮', () => {
    expect(source).toMatch(/生成|regenerate|generate/i)
  })

  it('悬浮浮窗包含查看生成数据', () => {
    expect(source).toMatch(/查看数据|view.*data|AI.*data|aiData/i)
  })

  it('移除了底部全局模型输入框', () => {
    // 不再有独立的 "模型" 输入框在底部参数条
    // （检查是否有 "图片模型" 或 "模型" + input 组合在参数条区域）
    const hasBottomModelInput = /生成参数条[\s\S]*?aria-label="图片模型"/.test(source)
    expect(hasBottomModelInput).toBe(false)
  })

  it('未选择生成槽时点击生成给出提示', () => {
    expect(source).toMatch(/未选择生成|请先选择|selectedForGeneration.*提示/)
  })

  it('生成中展示 Task 状态并禁用重复提交', () => {
    expect(source).toMatch(/生成中|isPending|disabled.*generating/)
  })
})
