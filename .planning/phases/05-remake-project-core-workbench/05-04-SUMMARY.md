---
phase: 05-remake-project-core-workbench
plan: 04
subsystem: vendor-runtime
tags: [scenedetect, vendoring, native-types, provenance, guards]
requires:
  - phase: 05-remake-project-core-workbench
    provides: adapter contracts and unified SceneDetect task bridge
provides:
  - canonical complete SceneDetect application vendor closure
  - auditable source commit/file hash manifest and sync/check script
  - native-type-driven integration runtime port
  - provenance and no-duplicate source guards
affects: [05-05, phase-6]
actuals:
  tokens: 12000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Complete App.tsx closure is vendored as one canonical source unit"
    - "Integration runtime ports consume native SceneDetect types directly"
key-files:
  created:
    - scripts/vendor-scenedetect.mjs
    - src/vendor/scenedetect/VENDOR.json
    - src/vendor/scenedetect/index.ts
    - src/lib/remake-projects/scenedetect/integration-runtime.ts
    - tests/contracts/remake-scenedetect-native-contract.test.ts
    - tests/guards/remake-scenedetect-vendor-provenance.test.ts
    - tests/guards/remake-scenedetect-no-duplicate-source.test.ts
  modified: []
key-decisions:
  - "Canonical index exports only complete SceneDetectEmbeddedApp and native project/shot/metadata types."
  - "No allowed source patches are registered in Phase 5; runtime integration remains a port only."
requirements-completed: [RMP-03, RMP-04, RMP-06, TASK-02]
coverage:
  - id: D1
    description: "Complete SceneDetect App static closure has reproducible source/version/hash provenance."
    requirement: RMP-03
    verification:
      - kind: other
        ref: node scripts/vendor-scenedetect.mjs --check
        status: pass
    human_judgment: false
  - id: D2
    description: "Canonical vendor/native runtime contract compiles and round-trips native project data."
    requirement: TASK-02
    verification:
      - kind: unit
        ref: tests/contracts/remake-scenedetect-native-contract.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
  - id: D3
    description: "Canonical root is protected against deep imports and duplicate editor source."
    requirement: RMP-04
    verification:
      - kind: unit
        ref: tests/guards/remake-scenedetect-no-duplicate-source.test.ts
        status: pass
    human_judgment: false
---

# Phase 05 Plan 04 Summary

**Auditable canonical SceneDetect complete-App vendor closure with native type/runtime contract and anti-duplication guards.**

## Accomplishments

- Added a repeatable vendor sync/check tool and 19-file static closure from the pinned SceneDetect source commit.
- Added canonical index exports for the complete App and native SceneDetect types only.
- Added native runtime ports and provenance/import/no-duplicate guard coverage without implementing real runtime execution.

## Task Commits

1. **Task 1 and Task 2: canonical vendor and native runtime guards** - `09856a7`

## Verification

- `node scripts/vendor-scenedetect.mjs --check` passed.
- `npm run typecheck` passed.
- Native contract, provenance, and no-duplicate guards passed: 4 assertions.

## Deviations from Plan

None - source was vendored without patches and real runtime behavior remains deferred.

## Next Phase Readiness

05-05 can mount `SceneDetectEmbeddedApp` from the canonical index and provide the Waoo shell/StageHost. Phase 6 remains responsible for injecting real persistence, media, analysis, and editor writeback runtime.

---
*Phase: 05-remake-project-core-workbench*
*Plan: 04*
*Completed: 2026-08-07*
