---
phase: 01-episode-mode-entry
plan: 03
subsystem: ui
tags: [react, i18n, script-view, mode-selector]
requires:
  - phase: 01-01
    provides: persisted episode mode
  - phase: 01-02
    provides: safe runtime mode-switch callback
  - phase: 01-04
    provides: episode mode in workspace stage data
provides:
  - script-page production mode selector UI
  - mode-specific CTA helper copy
  - CTA branch between traditional storyboard flow and multi-shot video path
affects: [script-view, videos-stage]
tech-stack:
  added: []
  patterns: [right-rail mode selector above primary CTA]
key-files:
  created: [tests/unit/novel-promotion/script-view-mode-entry.test.ts]
  modified: [src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx, messages/zh/scriptView.json, messages/en/scriptView.json, messages/zh/novel-promotion.json, messages/en/novel-promotion.json]
key-decisions:
  - "Multi-shot mode CTA goes directly to the videos stage"
  - "Primary CTA label remains unchanged"
patterns-established:
  - "Mode-specific helper copy lives in locale JSON, not inline JSX"
requirements-completed: [MODE-01, MODE-04, UI-01, UI-03]
duration: 28min
completed: 2026-04-19
---

# Phase 01: Episode Mode Entry Summary

**The script-page right rail now exposes per-episode mode selection and an unchanged draw CTA that branches by production mode**

## Accomplishments
- Added a production-mode selector card under `剧中资产` and above the primary draw CTA.
- Added localized helper text/badges for `多镜头片段模式` and `传统模式`.
- Made the draw CTA keep `确认并开始绘制` while branching to traditional storyboard generation or directly to the multi-shot videos stage.

## Verification
- `npx vitest run tests/unit/novel-promotion/script-view-mode-entry.test.ts tests/unit/script-view/script-view-assets-panel.test.ts`

## Notes
- Multi-shot mode now takes the faster entry path without inventing a second primary button.
