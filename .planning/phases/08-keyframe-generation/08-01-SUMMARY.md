---
phase: 08-keyframe-generation
plan: 01
subsystem: database
tags: [prisma, remake, keyframes, sharp, provenance, invalidation]
requires:
  - phase: 07-prompt-analysis
    provides: Remake shot revisions and the output/provenance/invalidation graph
provides:
  - Durable keyframe track, batch, candidate, and adoption history records
  - Deterministic Start/Middle/End action-sheet preparation and revision-scoped invalidation
affects: [08-02, 08-03, 09]
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [revision-scoped keyframe provenance, append-only invalidation]
key-files:
  created: [src/lib/remake-projects/keyframes/action-sheet.ts, src/lib/remake-projects/keyframes/invalidation.ts]
  modified: [prisma/schema.prisma, src/lib/remake-projects/service.ts]
key-decisions:
  - "Action sheets use the existing output/provenance spine and are keyed by revision and canonical fingerprint."
  - "Revision and original-keyframe mutations share an idempotent invalidation service."
patterns-established:
  - "Keyframe generation history remains append-only; only eligibility changes after invalidation."
requirements-completed: [KFRM-03, KFRM-04, KFRM-05]
coverage:
  - id: D1
    description: Deterministic action-sheet ordering, labels, and identity
    requirement: KFRM-05
    verification:
      - kind: integration
        ref: tests/integration/remake-projects/keyframe-action-sheet.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Durable track, candidate, adoption, and invalidation graph
    requirement: KFRM-03
    verification:
      - kind: integration
        ref: tests/integration/remake-projects/keyframe-persistence.test.ts
        status: pass
    human_judgment: false
duration: 45min
completed: 2026-08-10
status: complete
---

# Phase 8 Plan 01 Summary

**Durable Remake keyframe generation history with deterministic revision-bound action sheets and append-only invalidation.**

## Accomplishments

- Added Prisma models and a forward migration for selected slots, frozen generation batches, candidates, and adoption history.
- Added deterministic Start/Middle/End action-sheet preparation, fingerprinting, rendering, and provenance persistence hooks.
- Centralized revision/keyframe invalidation and exposed current keyframe-generation state in the Remake snapshot.

## Task Commits

1. Task 1 tests: `ce81c0c`
2. Task 1 persistence: `8955712`
3. Tasks 2-3 and summary: pending this commit

## Verification

- `npx tsc --noEmit --pretty false`
- `BILLING_TEST_BOOTSTRAP=0 DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/integration/remake-projects/keyframe-action-sheet.test.ts`

## Next Phase Readiness

Plan 08-02 can connect the durable contracts to API submission, task routing, and the image worker.
