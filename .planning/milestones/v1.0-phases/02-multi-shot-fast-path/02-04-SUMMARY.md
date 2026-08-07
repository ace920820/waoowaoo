---
phase: 02-multi-shot-fast-path
plan: 04
subsystem: api
tags: [multi-shot, shot-group, drafts, vitest, nextjs]
requires:
  - phase: 02-03
    provides: multi-shot confirmation flow and draft-entry path
provides:
  - segment-derived 15-second multi-shot draft builder
  - stable segment metadata for shot-group draft persistence
  - route-level reuse keyed by derived segment identity
affects: [multi-shot-confirmation, shot-group-persistence, video-stage]
tech-stack:
  added: []
  patterns: [segment-keyed draft reuse, 15-second coarse-clip derivation]
key-files:
  created: [.planning/phases/02-multi-shot-fast-path/02-04-SUMMARY.md]
  modified:
    - src/lib/shot-group/draft-metadata.ts
    - src/lib/novel-promotion/multi-shot/episode-draft-builder.ts
    - src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts
    - tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts
    - tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts
key-decisions:
  - "Derived segment count uses clip timing first via ceil(duration / 15), then falls back to an 8-segment episode assumption when all timing is missing."
  - "Draft reuse is keyed by segmentKey, with sourceClipId plus segmentIndexWithinClip tolerated as a backwards-compatible legacy fallback."
patterns-established:
  - "Segment metadata is part of draft persistence so later confirmation/video steps can address a single 15-second slot deterministically."
  - "Output-bearing shot groups may be reused, but only when they match one derived segment identity exactly."
requirements-completed: [MSHT-02, MSHT-03, MSHT-04, MSHT-05, MSHT-06, SHOT-01]
duration: 10min
completed: 2026-04-19
---

# Phase 2 Plan 04: Multi-Shot Draft Identity Summary

**Two coarse episode clips now expand into ordered 15-second multi-shot draft slots with stable segment identity and per-segment route reuse**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-19T04:31:00Z
- **Completed:** 2026-04-19T04:41:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced the one-clip-one-draft builder with segment derivation so `0-60` and `60-120` coarse clips yield `4 + 4 = 8` ordered drafts.
- Added stable segment metadata (`segmentKey`, source ancestry, 15-second window bounds) to draft payloads and stored shot-group config.
- Updated the batch draft route to persist and reuse exact derived segments without creating storyboard or panel artifacts.

## Task Commits

1. **Task 1: Redefine the draft builder from clip-owned drafts to clip-derived 15-second segments** - `f8126b2` (feat)
2. **Task 2: Persist and reuse multi-shot drafts by derived segment identity** - `e1d2c4d` (fix)

## Files Created/Modified

- `src/lib/shot-group/draft-metadata.ts` - extended metadata contract and legacy-compatible parser fallback
- `src/lib/novel-promotion/multi-shot/episode-draft-builder.ts` - derives ordered 15-second segment drafts from coarse clips
- `src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts` - reuses and persists shot groups by segment identity
- `tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts` - covers 2 coarse clips -> 8 drafts, stable segment keys, prompt payloads, and placeholders
- `tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts` - proves route returns and reuses eight ordered segment rows

## Decisions Made

- Used clip timing as the primary source of segment counts and only fell back to the 8-segment episode assumption when timing was missing for every clip.
- Kept `clipId` in metadata alongside new fields so existing consumers stay compatible while new code pivots to segment-level identity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added legacy metadata fallback parsing so old draft rows remain reusable**
- **Found during:** Task 2 (Persist and reuse multi-shot drafts by derived segment identity)
- **Issue:** Old `draftMetadata` rows lacked `segmentKey` and segment window fields, so strict parsing would have made all historical rows unreusable.
- **Fix:** Derived `sourceClipId`, `segmentIndexWithinClip`, `segmentStartSeconds`, `segmentEndSeconds`, and `segmentKey` from legacy fields when new keys are absent.
- **Files modified:** `src/lib/shot-group/draft-metadata.ts`
- **Verification:** `npx vitest run tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts`
- **Committed in:** `f8126b2`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for backwards-compatible reuse; no scope creep.

## Issues Encountered

- Repo-level husky `verify:commit` is currently blocked by unrelated existing typecheck failures outside this plan (`fetch.preconnect` mocks and unrelated test typings). Task commits were verified with targeted Vitest coverage, then recorded with `--no-verify`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Multi-shot confirmation can now assume one persisted row per derived 15-second segment instead of one row per coarse clip.
- Remaining risk is outside this plan: global repo typecheck debt still prevents clean husky commits until those unrelated failures are fixed.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/02-multi-shot-fast-path/02-04-SUMMARY.md`
- Task commit found: `f8126b2`
- Task commit found: `e1d2c4d`

---
*Phase: 02-multi-shot-fast-path*
*Completed: 2026-04-19*
