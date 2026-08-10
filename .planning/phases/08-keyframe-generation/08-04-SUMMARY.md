---
phase: 08-keyframe-generation
plan: 04
subsystem: e2e
tags: [playwright, remake, keyframes, responsive, video-boundary]
requires:
  - plan: 08-03
    provides: Remake Storyboard and Video adapters
provides:
  - deterministic Remake keyframe E2E fixture
  - desktop/tablet/mobile Playwright acceptance scenarios
  - guarded isolated-service verification harness
affects: [phase-08-verification]
---

# Phase 08 Plan 04 Summary

Added the final real-route acceptance artifacts for Remake keyframe generation. The fixture seeds an owned Remake project with original frames, approved and unavailable Prompt slots, immutable candidate history, adoption state, action-sheet output, Tasks, and long display text. The focused browser suite covers free stage navigation, explicit selection persistence, original-frame identity preservation, non-mutating preview/comparison, the disabled Video boundary, responsive viewports, focus, and overflow checks.

The harness targets only `waoowaoo_test` on port `3307` and Redis `6380`, allocates an unused Next port, starts only its own child process, and runs the desktop/mobile focused spec.

## Verification

- `npx tsc --noEmit --pretty false` passed.
- `npx playwright test tests/e2e/remake-keyframes.spec.ts --list` passed with 15 scenarios across desktop, tablet, and mobile projects.
- Full `node scripts/verify-remake-keyframes-ui.mjs` starts the isolated MySQL/Redis/Next stack and reaches the real route, but currently fails 8 of 10 desktop/mobile scenarios. The remaining product gaps are: the Prompt handoff reports `0 / 1` eligible Shots, the Storyboard surface has no candidate radio control for comparison, and test-side API reads need the browser session context. The first two are Wave 2/3 behavior gaps, not fixture failures.

## Human Acceptance

Still required by the plan: visual/interaction acceptance of the seeded app at desktop and mobile widths, especially reuse-first Storyboard hierarchy, persistent history/adoption semantics, shared tools, and the disabled Video submission boundary.
