---
slug: shorten-shot-labels-unify-prompt-header
date: 2026-08-12
type: quick
status: in-progress
---

# 简化镜头名称 + 统一 prompt 分析页顶部卡片样式

## 任务描述
1. prompt 分析、分镜、成片三个页面给每个镜头显示的名称太长
   （如 "Shot #1" + 长 ID "e44be650:9482...:scene-1"）。
   只显示「镜头01」即可，保持简洁。
2. prompt 分析页顶部卡片样式应与分镜、成片统一：
   参考成片页的显示方式（p-5 卡片 + pill 指标），
   保留多项指标与「分析中任务数量」的实时显示，
   保证卡片宽度/高度与分镜、成片一致。

## 修改方案
### 镜头名称
- adapter.ts：`label` 由 `Shot #${sequence}` 改为 `镜头${String(seq).padStart(2,'0')}`。
- 分镜页：镜头列表与当前镜头标题去掉 `· {stableId}`，只显示 `shot.label`。
- 成片页：去掉 `· {stableId}`，只显示 `shot.label`。
- prompt 页：`Shot #{sequence}` + `stableKey` 改为「镜头XX」；
  ShotListItem 去掉 `- {stableKey}`；PromptVideoTab 的 `#{sequence}` 改「镜头XX」。

### 顶部卡片统一（prompt 页 → 对齐成片页）
- 改为 `<header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">`
  结构：eyebrow + 标题 + 副标题 + `mt-3 flex flex-wrap gap-2 text-xs` pill 指标。
- 指标：镜头数、图片Prompt进度、已批准、待审核、分析中任务数（实时）。
- 删除不再使用的 Metric 组件。

## 验收
- 三个页面镜头名均显示「镜头XX」。
- prompt 页顶部卡片与分镜/成片宽度高度一致，样式统一。
- tsc --noEmit 通过；改动文件 eslint 无 error。
