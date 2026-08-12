---
slug: storyboard-go-prompt-sync
date: 2026-08-12
status: complete
---

# 分镜页「前往 Prompt 页」按钮与顶部标签切换行为对齐

## 结果
完成。分镜页镜头语义面板底部及 Prompt 状态卡片中的「前往 Prompt 页」
导航已从整页链接（`<a href="?stage=prompt&shot=...">`）改为客户端 stage
切换（复用 `updateStage('prompt')`），与顶部「prompt分析」标签行为一致：
无整页 reload，且通过 RemakeWorkbench 跨阶段共享的 selectedShotId
保持当前选中的镜头片段。

## 改动文件
- ShotSemanticsPanel.tsx：新增 `onNavigateToPrompt` prop，移除 `promptHref`
  全页导航，将「前往 Prompt 页」按钮与 4 个 PromptStatusCard 改为调用回调。
- RemakeStoryboardStage.tsx：透传 `onNavigateToPrompt` 到 ShotBlock →
  ShotSemanticsPanel。
- RemakeWorkbench.tsx：向 RemakeStoryboardStage 传入
  `onNavigateToPrompt={() => updateStage('prompt')}`。

## 验证
- `tsc --noEmit` 通过。
- 三个改动文件 eslint 无 error（仅既有 warning）。

## 验收
- [x] 点击「前往 Prompt 页」与顶部「prompt分析」按钮效果一致：客户端切换、保持当前镜头。
