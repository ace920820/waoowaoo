---
slug: remake-video-generation-feedback
date: 2026-08-13
type: quick
status: complete
---

# 视频生成必须有结果反馈：成功出视频、失败给原因

## 任务描述

点击「视频生成」后，无论成功失败都要给用户明确结果：
- 提交后任务运行期间：显示「视频生成中…」状态（而不是按钮复原后毫无反馈）。
- 失败：显示失败原因（errorCode / errorMessage）。
- 成功：视频自动出现在版本历史（可播放）。

当前问题：
1. 点击生成 → 202 创建任务后，按钮 `submitting` 立即复位，任务在 worker 运行数分钟，
   期间页面无任何指示；失败（如 Ark 版权拒绝）也无任何展示，版本区一直为空。
2. `remakeSnapshotRefreshInterval` 只对 keyframe/prompt 任务自动轮询，视频任务不轮询，
   导致成功后的版本不会自动出现。

## 修改方案

1. `src/lib/query/hooks/useRemakeProject.ts`
   - `remakeSnapshotRefreshInterval`：存在 `remake_video_generate` 任务且
     status ∈ {queued, processing, running} 时返回 3000ms 自动轮询；
     completed/failed 后停止。
2. `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx`
   - 主组件按 shot 汇总最新 `remake_video_generate` 任务，传给 `VideoShotCard`。
   - `VideoShotCard` 渲染任务结果横幅：
     - running → 蓝色「视频生成中…（任务已提交，完成后会自动出现在版本历史）」+ spinner。
     - failed → 红色「视频生成失败（errorCode）」+ errorMessage。
     - 无任务 → 不显示。
   - 保留 fetch 失败的 `errorMsg` 红框（data-testid="generate-error"）。

## 验证

- 新增单测：running/failed/无任务三种横幅渲染；自动轮询 3000ms / 停止。
- 现有 remake 相关单测 + 集成测试全绿；`tsc --noEmit` 通过。
