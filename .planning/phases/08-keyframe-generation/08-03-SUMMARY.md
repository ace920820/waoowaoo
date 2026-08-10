---
phase: 08-keyframe-generation
plan: 03
subsystem: frontend
tags: [remake, keyframes, storyboard, video, adapters]
requires:
  - phase: 08-02
    provides: server-authoritative keyframe selection, immutable batches, candidates, adoption, and action-sheet snapshot facts
provides:
  - free Remake stage navigation through Storyboard and Video
  - snapshot-backed two-layer Storyboard adapter with selection, generation, comparison, and confirmed adoption
  - truthful read-only Video input mapper and Phase 9 submission boundary
  - shared asset/configuration controller on Remake production pages
affects: [08-04, phase-09-video-generation]
requirements-completed: [KFRM-01, KFRM-02, KFRM-03, KFRM-04, KFRM-05, KFRM-06, KFRM-07]
status: complete
---

# Phase 08 Plan 03: Remake Keyframe and Video Surfaces

Implemented the Remake production-stage frontend adapters against the 08-02 snapshot contract. Prompt, Storyboard, and Video are directly navigable; Prompt handoff is navigation-only and reports eligible Shot count. Storyboard preserves original Start/Middle/End evidence, requires explicit legal selection, renders immutable batch candidates, keeps preview/comparison local, and sends only selection/generation/adoption mutations to the server. Video displays adopted main-image inputs separately from the original action-sheet input and contains no video mutation or task dependency; submission is disabled with the Phase 9 boundary explanation.

## Task Verification

- Navigation and handoff: `npx vitest run tests/unit/remake-projects/remake-workbench-keyframe-navigation.test.ts` passed (2 tests).
- Storyboard adapter and two-layer state: `npx vitest run tests/unit/remake-projects/remake-keyframe-stage.test.ts` passed (3 tests).
- Video input contract: `npx vitest run tests/unit/remake-projects/remake-video-input-contract.test.ts` passed (2 tests).
- Existing Video compatibility: `npx vitest run tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/video-stage-runtime-regressions.test.ts` passed (15 tests).

## Plan Verification

- `npm run typecheck` passed.
- `npm run check:locale-navigation` passed.
- `npm run check:no-multiple-sources-of-truth` passed.
- `git diff --check` passed.

## Deviations from Plan

1. [Rule 3 - Environment] Atomic git commits could not be created because the sandbox denies writes to `.git/index.lock` (`Operation not permitted`). Production changes and this summary remain in the worktree for handoff; unrelated untracked browser artifacts were preserved.
2. The existing lower-level Novel Storyboard and Video shell components were not modified. Remake-owned wrappers consume the shared shell/configuration/tool boundaries while retaining Remake-specific snapshot semantics.

## Self-Check: PASSED

- Confirmed all planned Remake adapter, mapper, hook, mutation, locale, and focused test files exist.
- Confirmed Video adapter has no video mutation import, VGEN route, scheduler, or fabricated Task state.
- Confirmed `STATE.md` and `ROADMAP.md` were not modified.
