---
phase: 02-multi-shot-fast-path
reviewed: 2026-04-19T04:58:32Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceConfigActions.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts
  - src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts
  - src/app/api/novel-promotion/[projectId]/shot-groups/route.ts
  - src/lib/novel-promotion/multi-shot/episode-draft-builder.ts
  - src/lib/novel-promotion/ownership.ts
  - src/lib/novel-promotion/stage-readiness.ts
  - src/lib/query/mutations/multi-shot-draft-mutations.ts
  - src/lib/query/mutations/useEpisodeMutations.ts
  - tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts
  - tests/integration/api/specific/novel-promotion-shot-groups-route.test.ts
  - tests/unit/novel-promotion/multi-shot-draft-mutations.test.ts
  - tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts
  - tests/unit/novel-promotion/script-view-mode-entry.test.ts
  - tests/unit/novel-promotion/stage-readiness.test.ts
  - tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts
  - tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---
# Phase 02: Code Review Report

**Reviewed:** 2026-04-19T04:58:32Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Reviewed the Phase 02 multi-shot fast-path additions around 15s draft derivation, confirmation-stage routing/readiness, reference-confirmation UI, and traditional-mode compatibility. The new draft-generation path is generally well-covered, but there are three workflow regressions in mode switching and confirmation gating.

## Warnings

### WR-01: Mode-dependent routing still reads stale server props after a mode switch

**File:** `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts:44`
**Issue:** The controller already pulls live episode query data via `useWorkspaceEpisodeStageData()` for readiness (`resolveStageArtifactsEpisodeData(...)` at lines 129-130), but `episodeProductionMode` for nav/runtime still comes from the stale `episode` prop at lines 156 and 172. `useWorkspaceProjectSnapshot` also normalizes stage IDs from `episode?.episodeProductionMode` only (`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot.ts:31-40`). Because episode mode changes are applied optimistically in the episode query cache (`src/lib/query/mutations/useEpisodeMutations.ts:126-154`), the UI can show the new mode in script view while `onRunScriptToStoryboard`, back navigation, and stage normalization still follow the old branch until a full prop refresh.
**Fix:** Derive a single merged `episodeProductionMode` from live episode data and use it consistently for `projectSnapshot`, `useWorkspaceStageNavigation`, and `useWorkspaceStageRuntime`. Add a regression test that toggles `episodeProductionMode` through the query cache without refreshing the outer `episode` prop, then verifies the next action follows the new branch.

### WR-02: The confirmation stage does not actually block incomplete multi-shot drafts from entering `videos`

**File:** `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx:13`
**Issue:** The page copy says users "must" finish per-segment confirmation before entering `videos` (`lines 33-39`), and `ShotGroupVideoSection` explicitly surfaces missing references / placeholder segments as blockers (`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx:292-330`). But the only CTA on the stage always calls `runtime.onStageChange('videos')` with no readiness check (`lines 13-15, 51-57`). That lets users bypass the new confirmation step even when segments still have `sourceStatus: 'placeholder'` or no reference at all.
**Fix:** Compute a stage-level `canContinueToVideos` boolean from the current shot groups, disable the CTA until all required references are present and placeholders are repaired, and cover that with a test that uses placeholder / no-reference shot groups and expects navigation to remain blocked.

### WR-03: Live readiness merging cannot represent cleared storyboard/shot-group state

**File:** `src/lib/novel-promotion/stage-readiness.ts:137`
**Issue:** `resolveStageArtifactsEpisodeData()` only prefers live `clips`, `storyboards`, and `shotGroups` when the live arrays are non-empty (`lines 137-144`). If a rebuild or mode switch clears downstream artifacts and the live episode query correctly becomes `[]`, this helper falls back to the stale server prop arrays and keeps `hasStoryboard` / `hasVideo` truthy. That undercuts the Phase 02 readiness fix because "cleared" and "stale" are treated the same.
**Fix:** Prefer live arrays whenever they are defined, even when empty. Add a unit test where stale props contain storyboards/shot-groups but live episode data contains empty arrays, and assert that readiness drops back to false.

---

_Reviewed: 2026-04-19T04:58:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
