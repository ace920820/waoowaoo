---
status: resolved
trigger: "React 警告 An empty string (\"\") was passed to the src attribute — RemakeWorkbench.tsx:81 → RemakeVideoStage"
created: 2026-08-13
updated: 2026-08-13
---

# Debug: RemakeVideoStage 空字符串 src 警告

## Symptom
进入翻拍「视频」阶段时控制台总是报错：
```
An empty string ("") was passed to the src attribute. ...
RemakeWorkbench.tsx (81:28) → RemakeVideoStage
```

## Current Focus
- hypothesis: resolved。
- next_action: none

## Evidence
- 调用栈顶层 frame 是原生 `video` 元素：`RemakeVideoStage.tsx` 的「原始视频」播放框无条件渲染 `<video src="">`，这是必现（总是）的来源。
- 同类隐患：参考图缩略图 `src={ref.mediaUrl || mediaUrl(projectId, ref.mediaId) || ''}`、关键帧槽位缩略图与动作表图 `src={... || ''}`，在 URL 缺失时会传空字符串。
- 原始视频 URL 本可直接使用 snapshot 的 `source.mediaUrl`（scenedetect media 路由支持 Range/video/mp4），但 VideoShotCard 未收到该 prop。

## Resolution
- root_cause: `<video src="">` 无条件渲染 + 多处 `src={... || ''}` 空串兜底。
- fix: RemakeVideoStage.tsx
  - 「原始视频」改为 `sourceMediaUrl ? <video src={sourceMediaUrl}> : 暂无原始视频占位`（sourceMediaUrl 由 RemakeVideoStage 从 `snapshot.source.mediaUrl` 传入 VideoShotCard）；
  - 参考图缩略图改为 URL 存在才渲染 img，否则显示 image 占位；
  - 关键帧槽位/动作表图 `|| ''` 改为 `?? undefined`（React 不再渲染空 src）。
- 验证：`tsc --noEmit` 通过；`tests/unit/remake-projects/remake-video-stage.test.tsx` 20 tests 通过；remake UI 下已无 `src=""` / `|| ''` 残留。
