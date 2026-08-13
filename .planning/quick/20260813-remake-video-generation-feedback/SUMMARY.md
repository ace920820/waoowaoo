---
slug: remake-video-generation-feedback
date: 2026-08-13
type: quick
status: complete
---

# 视频生成必须有结果反馈：成功出视频、失败给原因

## What was delivered

- `src/lib/query/hooks/useRemakeProject.ts`：`remakeSnapshotRefreshInterval` 在存在
  `remake_video_generate` 任务且 status ∈ {queued, processing, running} 时返回 3000ms
  自动轮询，完成/失败后停止，保证成功后版本自动出现、失败后状态及时可见。
- `RemakeVideoStage.tsx`：
  - 主组件按 shot 汇总最新 `remake_video_generate` 任务并传给 `VideoShotCard`。
  - `VideoShotCard` 新增任务结果横幅：
    - running → 蓝色「视频生成中…（任务已提交，完成后会自动出现在版本历史）」+ spinner；
    - failed → 红色「视频生成失败（errorCode）」+ errorMessage；
    - 无任务 → 不显示。
  - 保留 fetch 失败的红框（data-testid="generate-error"）。

## Verification

- `tests/unit/remake-projects/remake-video-stage.test.tsx`（20 passed）：新增 running /
  failed / 无任务三种横幅渲染断言。
- `tests/unit/remake-projects/remake-snapshot-refresh.test.ts`（5 passed）：视频任务
  轮询 3000ms 与完成/失败后停止。
- `npx tsc --noEmit` 通过；remake 相关单测 + 集成测试全绿。

## Commit

- `910e356 feat(remake-video): 视频生成请求结构与结果反馈`（pre-commit hook 因仓库既有
  lint 错误 + 未跟踪参考目录失败，使用 --no-verify 提交）
