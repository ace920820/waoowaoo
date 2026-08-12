---
slug: storyboard-go-prompt-sync
date: 2026-08-12
type: quick
status: in-progress
---

# 分镜页「前往 Prompt 页」按钮与顶部标签切换行为对齐

## 任务描述
分镜页底部（镜头语义面板）的「前往 Prompt 页」按钮目前使用
`<a href="?stage=prompt&shot=...">` 整页导航，导致：
1. 整页重新加载，切换较慢；
2. reload 后 RemakeWorkbench 重新挂载，selectedShotId 重置为 null，
   且不读取 URL 的 shot 参数，导致选中的镜头片段被重置为第一个。

期望行为：与顶部「prompt分析」标签一致——通过客户端 stage 切换
（updateStage('prompt')）直接切到 prompt 页，并保持当前选中的镜头片段。

## 修改方案
- ShotSemanticsPanel：新增 onNavigateToPrompt 回调 prop；
  移除 promptHref 全页导航；「前往 Prompt 页」链接与各 PromptStatusCard
  改为调用回调。
- RemakeStoryboardStage：透传 onNavigateToPrompt 到 ShotSemanticsPanel。
- RemakeWorkbench：向 RemakeStoryboardStage 传入
  onNavigateToPrompt={() => updateStage('prompt')}。
- 选中镜头由 RemakeWorkbench 的 selectedShotId 跨阶段共享，切换后自动保持。

## 验收
- 点击「前往 Prompt 页」与顶部「prompt分析」按钮效果一致：无整页 reload，切到 prompt 页且保持当前镜头。
- 类型检查通过。
