# Quick Task 260814-gxg: 修复成片页 unit 合并交互问题

**Created:** 2026-08-14
**Status:** complete

## Task

修复成片页「合并 unit 模式」的 3 个问题：

1. 多选镜头后无法看到已选择镜头的累计时长总和
2. 每个镜头看不到代表图片（应显示原始视频中间帧小图）
3. 多选后点击进入 unit 视图报错 Invalid parameters

## Root Causes

| # | 问题 | 根因 |
|---|------|------|
| 1 | 无累计时长 | 选择面板只显示"已选择 N 个镜头"，未计算累计时长 |
| 2 | 无代表图 | 选择卡片只渲染文字（label/时长），未渲染中间帧缩略图 |
| 3 | Invalid parameters | 前端 `revisions.find(lifecycleState === 'active')` 可能取到旧 sourceRevision 的 revision（revision=1），但服务端 `createVideoUnit` 要求 `revision === shot.currentRevision`（=8），触发 `REMAKE_VIDEO_UNIT_MEMBER_NOT_CURRENT` → API 映射为 INVALID_PARAMS |

## Fixes

1. **累计时长**：`selectedUnitDuration` useMemo 汇总已选 shot 的 durationSeconds，选择面板文案显示 `已选择 N 个镜头 · 累计时长 X.Xs`。
2. **中间帧缩略图**：选择卡片加 `aspect-video` 图片区，用 `shot.original.middle.mediaUrl` 渲染原始视频中间帧（无帧时显示占位文案）。
3. **current revision**：创建 unit 时优先取 `revision === shot.currentRevision && lifecycleState === 'active'` 的 revision，回退到第一个 active。

## Verification

- `npx tsc --noEmit` 通过
- `npx eslint <stage>` 0 errors（仅既有 img warnings）
- `npx vitest run tests/unit/remake-projects/remake-video-unit-stage.test.tsx tests/unit/remake-projects/remake-video-stage.test.tsx` → 25/25 通过
- 服务端 `createVideoUnit` 的 MEMBER_NOT_CURRENT 校验由既有 `remake-video-unit-service.test.ts` 覆盖

## Files Modified

- `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx`
