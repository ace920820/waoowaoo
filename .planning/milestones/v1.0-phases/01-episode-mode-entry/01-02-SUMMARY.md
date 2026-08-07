---
phase: 01-episode-mode-entry
plan: 02
subsystem: ui
tags: [react, confirmation, workspace, runtime]
requires:
  - phase: 01-01
    provides: persisted episode mode
  - phase: 01-04
    provides: typed episode mode in workspace hooks
provides:
  - mode-switch confirmation flow for started episodes
  - broader downstream artifact detection for confirmation
  - runtime callback for episode mode switching
affects: [script-view, workspace-shell]
tech-stack:
  added: []
  patterns: [single confirm dialog for destructive mode switches]
key-files:
  created: []
  modified: [src/lib/query/mutations/useProjectConfigMutations.ts, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext.tsx]
key-decisions:
  - "Shot-group outputs count as started for switch confirmation"
  - "Switch confirmation reuses the existing workspace ConfirmDialog"
patterns-established:
  - "Started-episode checks count storyboard, shot-group, and generated video artifacts"
requirements-completed: [MODE-01, UI-03]
duration: 20min
completed: 2026-04-19
---

# Phase 01: Episode Mode Entry Summary

**Started-episode mode switching now routes through the existing workspace confirmation flow with broader downstream artifact checks**

## Accomplishments
- Broadened downstream stats to include storyboard panels, shot groups, and generated image/video artifacts.
- Added `switchEpisodeProductionMode` support in [useRebuildConfirm.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts).
- Exposed `onEpisodeProductionModeChange` through the workspace runtime.

## Verification
- `npx vitest run tests/unit/workspace/rebuild-confirm.test.ts`

## Notes
- The same confirm dialog continues to serve story/script rebuilds and mode switches.
