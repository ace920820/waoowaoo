---
phase: 08-keyframe-generation
plan: 05
subsystem: frontend
tags: [remake, keyframes, storyboard, layout, prompt]
requires:
  - plan: 04
    provides: Existing Remake storyboard stage and semantics panel
provides:
  - 2×3 aligned storyboard grid (original on top, new keyframe below)
  - Per-slot source frame selection state (click to view, separate from generation checkbox)
  - Slot-aware Prompt display showing the adopted image prompt for the active frame
  - buildSourceSlotView and buildTwoRowLayout view-model functions
affects: [08-06, 08-07]
actuals:
  tokens: ~40000
  tasks: 3
tech-stack:
  added: []
  patterns: [two-row grid, view-model adapter, selected-view vs generation-selection separation]
key-files:
  created:
    - tests/unit/remake-projects/remake-keyframe-source-selection.test.ts
    - tests/unit/remake-projects/remake-keyframe-2row-layout.test.ts
    - tests/unit/remake-projects/remake-two-row-storyboard.test.ts
  modified:
    - src/lib/remake-projects/keyframes/adapter.ts
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx
key-decisions:
  - "Clicking an original frame changes the 'selected viewing slot' but never toggles 'selected for generation' — two independent states."
  - "The 2×3 grid uses buildTwoRowLayout as a pure view-model layer; React only renders, no logic duplication."
  - "Image prompt is per-slot (image:start/middle/end); video prompt stays separate and never mixes in."
  - "ShotSemanticsPanel now accepts activeSlot and shows the active frame's adopted prompt as the primary description."
patterns-established:
  - "Two-row 3-column alignment: Start/Middle/End columns are stable and contain both original + new rows."
  - "View-first selection vs generation-selection are always distinct interaction modes."
requirements-completed: [KFRM-01, KFRM-02, KFRM-04]
coverage:
  - id: T1
    description: View-model layer for per-slot prompt and 2×3 layout
    verification:
      - kind: unit
      ref: tests/unit/remake-projects/remake-keyframe-source-selection.test.ts
      status: pass (5 tests)
    - kind: unit
      ref: tests/unit/remake-projects/remake-keyframe-2row-layout.test.ts
      status: pass (6 tests)
  - id: T2
    description: 2×3 storyboard stage with selected source slot and independent generation checkbox
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-two-row-storyboard.test.ts
      status: pass (3 tests)
  - id: T3
    description: Active-slot prompt display in semantics panel
    verification:
      - kind: typecheck
      ref: npx tsc --noEmit
      status: pass
duration: ~60min
status: complete
---

# Phase 8 Plan 05 Summary

**2×3 分镜工作台布局 + 逐槽 Prompt + 原始帧选择状态，已全部完成。**

## 交付内容

1. **视图模型层** — 新增 `buildSourceSlotView(shot, slot)` 和 `buildTwoRowLayout(shot)` 两个纯函数，保证 Start/Middle/End 严格对齐、逐槽 Prompt 正确映射、视频 Prompt 永不混入。
2. **UI 层** — `RemakeStoryboardStage` 的 ShotBlock 从"原始帧 + 新画面上下两大块"改为 2 行 3 列对齐工作区。上排原始动作参考，下排新画面参考。
3. **交互** — 点击原始帧切换"当前查看帧"（`selectedSourceSlot` state），有明显高亮边框。"用于生成"复选框是独立动作，点击图片永不改变生成选择。
4. **语义层** — `ShotSemanticsPanel` 增加 `activeSlot` prop，主区域显示当前帧的已采用图片 Prompt，下方保留各帧状态 + 视频 Prompt 总览。

## Task Commits

- T1 view models: buildSourceSlotView + buildTwoRowLayout (11 unit tests GREEN)
- T2 2×3 UI: RemakeStoryboardStage rewrite + TwoRowGrid component
- T3 slot-aware prompt: ShotSemanticsPanel activeSlot prop + prompt display

## Verification

- `npx tsc --noEmit` ✅
- `npx vitest run tests/unit/remake-projects/` — 27 files / 89 tests ✅
- 所有新增单元测试：14 tests ✅
- `npm run check:locale-navigation` ✅
- `npm run check:no-multiple-sources-of-truth` ✅

## Next Phase Readiness

Plan 08-06（大图预览 + 版本操作）可以直接接入 2×3 网格的下排卡片。新的 KeyframePreviewModal 组件将接收 slot 数据和候选列表，复用现有 generate / adopt mutations。
