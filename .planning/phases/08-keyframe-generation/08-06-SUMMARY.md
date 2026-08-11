---
phase: 08-keyframe-generation
plan: 06
subsystem: frontend
tags: [remake, keyframes, preview, modal, adopt, regenerate]
requires:
  - plan: 05
    provides: 2×3 layout and per-slot view state
provides:
  - KeyframePreviewModal with candidate navigation, download, regenerate, adopt, and restore
  - Integration of preview modal into the 2×3 storyboard grid
affects: [08-07]
actuals:
  tokens: ~35000
  tasks: 3
tech-stack:
  added: []
  patterns: [modal preview, candidate-only view state, append-only adoption]
key-files:
  created:
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/KeyframePreviewModal.tsx
    - tests/unit/remake-projects/remake-keyframe-preview-modal.test.ts
  modified:
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx
key-decisions:
  - "Candidate clicks in the preview modal only change the viewed candidate — never the adopted version. Adoption requires an explicit '采用此版本' action."
  - "The modal reuses the existing generate and adopt mutations; no new API endpoints were needed."
  - "ESC key and backdrop click both close the modal; focus returns to the close button on open."
  - "Restore previous version UI is wired but simplified in this version — full history traversal requires adoption-history data from the server."
patterns-established:
  - "Preview modal pattern for keyframes: large image + right-side candidate thumbnails + bottom action bar."
requirements-completed: [KFRM-01, KFRM-02, KFRM-03, KFRM-04]
coverage:
  - id: T1
    description: KeyframePreviewModal component with full action bar
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-keyframe-preview-modal.test.ts
      status: pass (4 tests)
  - id: T2
    description: New-frame cards open preview modal on click
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-two-row-storyboard.test.ts
      status: pass (3 tests)
  - id: T3
    description: Preview-only state is separate from adoption state
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-keyframe-preview-modal.test.ts:no-direct-adopt
      status: pass
duration: ~45min
status: complete
---

# Phase 8 Plan 06 Summary

**关键帧大图预览弹窗 + 版本操作，已完成。**

## 交付内容

1. **KeyframePreviewModal 组件** — 居中大图预览，右侧候选缩略图列（按批次分组），底部操作条：
   - 下载（当前预览图片）
   - 恢复上一版本（UI 已就位，完整历史遍历留待后续）
   - 重新生成 + 候选数量选择（1-4 张）
   - 查看数据（展开显示 Prompt + 生成参数）
   - 采用此版本（触发确认流程）
2. **2×3 网格集成** — 下排每张新画面卡片点击打开对应槽位的预览弹窗。
3. **交互保障** — 候选切换只改变预览，绝不改变采用版本。采用必须点击"采用此版本"按钮并经过确认。
4. **可访问性** — ESC 关闭、背景遮罩点击关闭、打开时焦点在关闭按钮、aria-label。

## Task Commits

- T1: KeyframePreviewModal 组件（含 4 个契约测试 GREEN）
- T2: 2×3 网格下排卡片点击打开预览
- T3: 复用现有 generate / adopt mutations，不新建 API

## Verification

- `npx tsc --noEmit` ✅
- `npx vitest run tests/unit/remake-projects/` — 28 files / 93 tests ✅
- `npm run check:locale-navigation` ✅
- `npm run check:no-multiple-sources-of-truth` ✅

## Next Phase Readiness

Plan 08-07（场景/角色/物品资产选择器）可以直接在 ShotSemanticsPanel 里接入。需要复用经典分镜页的资产查询和选择组件。
