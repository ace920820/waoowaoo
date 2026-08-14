---
phase: quick
plan: 260814-gxg
subsystem: ui
tags: [remake, unit, video, react]
status: complete
completed: 2026-08-14
key-files:
  modified:
    - src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx
key-decisions:
  - "创建 unit 时优先取 currentRevision 匹配的 active revision，回退第一个 active"
  - "镜头代表图使用原始视频中间帧（original.middle.mediaUrl）"
---

# Quick Task 260814-gxg: 修复成片页 unit 合并交互问题 Summary

**One-liner:** 修复 unit 选择模式的累计时长显示、镜头中间帧缩略图、创建 unit 的 Invalid parameters 报错。

## Accomplishments

1. **累计时长显示**：选择面板显示 `已选择 N 个镜头 · 累计时长 X.Xs`，随勾选实时更新。
2. **镜头代表图**：选择卡片显示原始视频中间帧缩略图（aspect-video + object-cover），无帧时占位。
3. **Invalid parameters 修复**：创建 unit 时优先取 `revision === shot.currentRevision` 的 active revision，避免把旧 sourceRevision 的 revision（revision=1 ≠ currentRevision=8）传给服务端触发 `REMAKE_VIDEO_UNIT_MEMBER_NOT_CURRENT`。

## Verification

- typecheck 通过
- eslint 0 errors
- 25/25 相关测试通过
- 服务端校验由既有 `remake-video-unit-service.test.ts` 覆盖

## Deviations

None — 按计划执行。

## Self-Check: PASSED

- `RemakeVideoStage.tsx` 修改已提交（bec6163）
- typecheck / eslint / 25 tests 全部通过
