---
phase: 05-remake-project-core-workbench
plan: 02
subsystem: api-adapter
tags: [scenedetect, adapter, zod, media-security, idempotency]
requires:
  - phase: 05-remake-project-core-workbench
    provides: stable remake project/shot/revision/provenance persistence
provides:
  - versioned SceneDetect v2 parser and native-project boundary
  - stable external-shot identity mapping and mutation commands
  - preview/commit import route with operation-key replay protection
  - media URL, MIME, byte-limit, and private-address guards
affects: [05-03, 05-04, 05-05, phase-6]
actuals:
  tokens: 15000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Parse external SceneDetect input before any persistence"
    - "Use operation-key provenance to make imports replay-safe"
key-files:
  created:
    - src/lib/remake-projects/scenedetect/contracts.ts
    - src/lib/remake-projects/scenedetect/adapter.ts
    - src/lib/remake-projects/scenedetect/id-map.ts
    - src/lib/remake-projects/scenedetect/media.ts
    - src/app/api/remake-projects/[projectId]/scenedetect/import/route.ts
    - tests/unit/remake-projects/scenedetect-adapter.test.ts
    - tests/integration/api/remake-projects-scenedetect-import.test.ts
  modified: []
key-decisions:
  - "Native SceneDetect project conversion is a boundary function; StageHost will consume native types in 05-04/05-05."
  - "Runtime/local media URLs are never persisted as permanent Waoo media facts."
requirements-completed: [RMP-03, RMP-06, TASK-02]
coverage:
  - id: D1
    description: "SceneDetect schema v2, frame bounds, stable identity, and native mutation conversion are validated."
    requirement: RMP-03
    verification:
      - kind: unit
        ref: tests/unit/remake-projects/scenedetect-adapter.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "Preview and commit import are ownership-checked and operation-key idempotent."
    requirement: TASK-02
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-scenedetect-import.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "Hostile media inputs are rejected before ingestion."
    requirement: RMP-06
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-scenedetect-import.test.ts#rejects private DNS results, URL credentials, and oversized media before ingestion
        status: pass
    human_judgment: false
---

# Phase 05 Plan 02 Summary

**Versioned SceneDetect v2 adapter with stable Waoo identity, replay-safe preview/commit import, and media boundary validation.**

## Accomplishments

- Added structural SceneDetect-native contracts with schema/version and frame-bound validation.
- Added stable external analysis/shot keys and conversion between Waoo snapshots and native project/mutation commands.
- Added authenticated import API and hostile media input guards, with focused unit and integration regressions.

## Task Commits

1. **Task 1 and Task 2: SceneDetect contracts, media normalization, and import API** - `32ad139`

## Verification

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/scenedetect-adapter.test.ts tests/integration/api/remake-projects-scenedetect-import.test.ts` passed: 6 tests.
- `npm run typecheck` passed.
- Full repository aggregation remains affected by the unrelated pre-existing failures recorded in 05-01.

## Deviations from Plan

None - plan executed within the declared adapter/API scope.

## Next Phase Readiness

05-03 can attach SceneDetect capability execution to the existing Task/GraphRun system. 05-04 must compile-check these native boundary functions against the canonical vendored SceneDetect types.

---
*Phase: 05-remake-project-core-workbench*
*Plan: 02*
*Completed: 2026-08-07*
