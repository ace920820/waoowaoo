---
slug: shorten-shot-labels-unify-prompt-header
date: 2026-08-12
status: complete
---

# 简化镜头名称 + 统一 prompt 分析页顶部卡片样式

## 结果
完成。

## 需求 1：镜头名称简化
三个页面（prompt 分析 / 分镜 / 成片）的镜头名称由
「Shot #N + 长 ID（stableId/stableKey）」简化为「镜头01」：
- adapter.ts：`label` 由 `Shot #${sequence}` 改为
  `镜头${String(seq).padStart(2,'0')}`。
- 分镜页：镜头列表与当前镜头标题去掉 `· {stableId}`。
- 成片页：去掉 `· {stableId}`，只显示 `shot.label`。
- prompt 页：`Shot #{sequence}` + `stableKey` 改为「镜头XX」；
  ShotListItem 去掉 `- {stableKey}`；PromptVideoTab 的 `#{sequence}` 改「镜头XX」。
- 搜索过滤仍保留 stableKey 用于按 ID 检索（不展示）。

## 需求 2：prompt 分析页顶部卡片与分镜/成片统一
prompt 页顶部卡片改为与成片页一致的样式：
`<header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">`
（eyebrow + 标题 + 副标题 + `mt-3 flex flex-wrap gap-2 text-xs` pill 指标）。
指标保留：镜头数、图片Prompt进度、已批准、待审核、分析中任务数（实时）。
删除了不再使用的 Metric 组件。宽度/高度与分镜、成片统一（均为 p-5 卡片）。

## 验证
- `tsc --noEmit` 通过。
- 改动文件 eslint 无 error（仅既有 warning）。

## 验收
- [x] 三个页面镜头名均显示「镜头XX」。
- [x] prompt 页顶部卡片与分镜/成片宽度高度一致，样式统一。
