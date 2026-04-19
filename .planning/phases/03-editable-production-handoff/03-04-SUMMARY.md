---
phase: 03-editable-production-handoff
plan: 04
subsystem: api
tags: [multi-shot, draft-rebuild, metadata-preservation, vitest, nextjs, typescript]
requires:
  - phase: 03-editable-production-handoff
    provides: persisted editable shot-group metadata and rebuild entrypoints from plans 03-01 through 03-03
provides:
  - preserved editable shot-group metadata during multi-shot draft rebuild
  - integration regression coverage for rebuild metadata survival
affects: [03-05, workspace-refresh, shot-group-review-state]
tech-stack:
  added: []
  patterns: [merge prior draft metadata into regenerated snapshots, lock preservation with targeted route regression]
key-files:
  created: []
  modified:
    - src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts
    - tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts
key-decisions:
  - "Kept the rebuild route aligned with persist-drafts by parsing previousDraftMetadata from the existing shot group and passing it into the snapshot builder."
  - "Preserved only editable metadata fields while still regenerating segment identity, timing, and other derived draft fields from the latest episode draft."
  - "Covered WR-01 with a route-level regression instead of widening unrelated workspace tests."
patterns-established:
  - "Multi-shot draft rebuilds must reuse normalized prior draft metadata through buildShotGroupVideoConfigSnapshot instead of rebuilding editable state from scratch."
  - "Route regressions for rebuild safety should assert both metadata preservation and refreshed regenerated segment fields."
requirements-completed: [MSHT-07, MSHT-08]
duration: 4min
completed: 2026-04-19
---

# Phase 3 Plan 4: Preserve saved editable metadata when multi-shot drafts are rebuilt Summary

**Aligned the multi-shot draft rebuild route with the persisted metadata merge contract so saved review/video edits survive rebuilds while regenerated segment structure still refreshes from current drafts**

## Performance

- **Duration:** 4 min
- **Completed:** 2026-04-19T15:53:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Parsed `previousDraftMetadata` from matched shot groups inside the multi-shot drafts route and passed it through `buildShotGroupVideoConfigSnapshot`.
- Preserved saved editable metadata classes called out in WR-01, including dialogue overrides, selected assets, reference/composite prompts, storyboard mode, and mood settings.
- Kept regenerated segment identity fields sourced from the latest derived draft data so rebuilds still refresh current segment keys and timing.
- Added a focused integration regression covering both metadata preservation and regenerated segment refresh behavior.

## Task Commits

1. **Task 1: Merge prior editable metadata into multi-shot draft rebuild snapshots** - `8dbe764` (fix)
2. **Task 2: Add an integration regression for metadata preservation across rebuilds** - `1d9873c` (test)

## Decisions Made

- Used the existing `parseShotGroupDraftMetadata` plus `buildShotGroupVideoConfigSnapshot` merge path instead of inventing a parallel rebuild-specific preservation flow.
- Preserved editable metadata only; derived segment structure continues to come from `buildEpisodeMultiShotDrafts`.
- Kept verification scoped to `tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts` because the plan’s gap was isolated to the rebuild route contract.

## Deviations from Plan

None - plan executed as written.

## Verification

- `npx vitest run tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts`
  - Result: 4 tests passed

## Known Stubs

None.

## Self-Check: PASSED

- Found summary file: `.planning/phases/03-editable-production-handoff/03-04-SUMMARY.md`
- Found task commit: `8dbe764`
- Found task commit: `1d9873c`

## Notes

- Per execution instructions for this run, `STATE.md` and `ROADMAP.md` were not updated.
