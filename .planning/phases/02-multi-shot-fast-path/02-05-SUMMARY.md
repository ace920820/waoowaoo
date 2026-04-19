---
phase: 02-multi-shot-fast-path
plan: 05
subsystem: ui
tags: [react, nextjs, vitest, multi-shot, workspace, storyboard]
requires:
  - phase: 02-04
    provides: segment-derived multi-shot draft rows with stable draft metadata
provides:
  - dedicated multi-shot confirmation nav labeling in the workspace shell
  - draft-metadata readiness so multi-shot confirmation stays reachable before composite boards exist
  - explicit script-to-confirmation-to-videos handoff copy on the confirmation stage
affects: [workspace-shell, multi-shot-confirmation, stage-readiness, review-ui]
tech-stack:
  added: []
  patterns: [query-backed stage-readiness merge, draft-metadata readiness fallback, confirmation-shell copy contract]
key-files:
  created: [.planning/phases/02-multi-shot-fast-path/02-05-SUMMARY.md]
  modified:
    - src/lib/novel-promotion/stage-readiness.ts
    - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts
    - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts
    - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx
    - tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts
    - tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts
key-decisions:
  - "Stage readiness now accepts lightweight draft metadata evidence (`draftMetadata.segmentKey`) so confirmation is reachable before any composite reference board exists."
  - "The workspace controller merges live query-backed episode stage data into readiness checks instead of trusting the stale server `episode` prop after draft invalidation."
  - "The confirmation shell now states the `script -> multi-shot storyboard/reference confirmation -> videos` handoff directly in the page chrome."
patterns-established:
  - "Multi-shot shell readiness should prefer fresh React Query stage data when available, while falling back to server props when live arrays are still empty."
  - "Confirmation-stage regression tests must assert rendered labels and actionable reference affordances, not only internal stage ids."
requirements-completed: [MODE-03, TRAD-01, TRAD-02, UI-02]
duration: 5min
completed: 2026-04-19
---

# Phase 2 Plan 05: Confirmation Gap Closure Summary

**Multi-shot confirmation now stays reachable from fresh draft data, shows its dedicated capsule label, and frames the reference-review handoff before videos**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-19T04:45:00Z
- **Completed:** 2026-04-19T04:50:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Restored the dedicated `multi-shot-storyboard` navigation label while keeping the traditional storyboard label and route intact.
- Taught stage readiness to treat draft shot-group metadata as confirmation-stage evidence and fed that readiness from fresh query-backed episode data after draft refetch.
- Tightened the confirmation-stage shell copy and regression coverage so the derived segment set and reference actions are clearly presented before `videos`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the shell recognize and label the dedicated multi-shot confirmation stage** - `2f8934e` (fix)
2. **Task 2: Keep the confirmation stage usable for reference upload and board generation before videos** - `ecbe93b` (feat)

## Files Created/Modified

- `src/lib/novel-promotion/stage-readiness.ts` - adds draft-metadata readiness checks and a helper for merging live stage data into readiness inputs.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts` - resolves shell readiness from the freshest episode-stage data path available after draft invalidation.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts` - renders `stages.multiShotStoryboard` only for the multi-shot confirmation capsule.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx` - adds explicit `script -> confirmation -> videos` handoff framing to the review shell.
- `tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts` - covers dedicated nav label, draft-metadata readiness, and live-data readiness merging.
- `tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts` - asserts the confirmation-stage flow copy and derived segment rendering alongside the reference affordances.

## Decisions Made

- Used a lightweight `segmentKey` presence check for readiness instead of relaxing the stricter draft-metadata parser that the UI uses for full payload rendering.
- Kept traditional behavior untouched by scoping the label change and readiness behavior to the multi-shot branch only.
- Left state-tracking files alone because this execution was explicitly orchestrator-owned for `.planning/STATE.md` and roadmap writes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `.planning/STATE.md` was already dirty and is orchestrator-owned for this wave, so it was intentionally left unmodified.
- Git pathspecs for bracketed Next.js routes required literal `git add -- ...` staging, but this did not change scope or output.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The workspace shell now treats the multi-shot confirmation stage as a first-class review step, so downstream work can build on stable confirmation routing and affordances instead of patching shell state again.
- Orchestrator-owned state files still need their normal post-wave updates outside this plan execution.

## Self-Check: PASSED

- Summary file created at `.planning/phases/02-multi-shot-fast-path/02-05-SUMMARY.md`
- Task commit found: `2f8934e`
- Task commit found: `ecbe93b`
- Verification run: `npx vitest run tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts`

---
*Phase: 02-multi-shot-fast-path*
*Completed: 2026-04-19*
