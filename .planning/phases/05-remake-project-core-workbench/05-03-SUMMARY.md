---
phase: 05-remake-project-core-workbench
plan: 03
subsystem: task-runtime
tags: [task, graph-run, scenedetect, executor, safe-projection]
requires:
  - phase: 05-remake-project-core-workbench
    provides: remake persistence and SceneDetect adapter boundary
provides:
  - SceneDetect analyze/extract task descriptors and dedupe contract
  - executor bridge using the existing submitTask path
  - safe project-scoped task projection API
affects: [05-04, 05-05, phase-6, phase-10]
actuals:
  tokens: 10000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns:
    - "SceneDetect capabilities are ordinary Waoo task types with descriptor-level dedupe"
    - "Task projection exposes callback semantics and redacted provenance only"
key-files:
  created:
    - src/lib/remake-projects/scenedetect/task-contract.ts
    - src/lib/remake-projects/scenedetect/executor.ts
    - src/app/api/remake-projects/[projectId]/tasks/route.ts
    - tests/unit/remake-projects/scenedetect-task-contract.test.ts
    - tests/integration/api/remake-projects-task-projection.test.ts
  modified:
    - src/lib/task/types.ts
    - src/lib/task/intent.ts
    - tests/contracts/task-type-catalog.ts
key-decisions:
  - "SceneDetect analyze and keyframe extraction use the existing text queue classification and task lifecycle; no queue or lifecycle table is added."
  - "The executor bridge returns only SceneDetect callback semantics; real algorithm execution remains Phase 6 work."
requirements-completed: [TASK-01, TASK-02, TASK-03, RMP-06]
coverage:
  - id: D1
    description: "SceneDetect operation descriptors produce stable dedupe keys across source and shot revisions."
    requirement: TASK-01
    verification:
      - kind: unit
        ref: tests/unit/remake-projects/scenedetect-task-contract.test.ts#dedupes the same project/source/shot revision and operation key
        status: pass
    human_judgment: false
  - id: D2
    description: "SceneDetect executor operations use the existing task submitter and callback projection."
    requirement: TASK-02
    verification:
      - kind: unit
        ref: tests/unit/remake-projects/scenedetect-task-contract.test.ts#submits both operations through the existing task submitter
        status: pass
    human_judgment: false
  - id: D3
    description: "Project task API returns safe status/provenance data and blocks cross-user enumeration."
    requirement: TASK-03
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-task-projection.test.ts
        status: pass
    human_judgment: false
---

# Phase 05 Plan 03 Summary

**SceneDetect analyze and keyframe capabilities registered as unified Waoo tasks with dedupe descriptors and safe project task projection.**

## Accomplishments

- Added analyze/extract task types, intent mapping, task catalog ownership, descriptor dedupe keys, and callback conversion.
- Added an executor bridge that delegates to the existing `submitTask` contract and does not start external processes.
- Added an ownership-safe task projection route that strips raw payload, billing, session, command, and environment details.

## Task Commits

1. **Task 1 and Task 2: executor contract and safe task projection** - `9be8aab`

## Verification

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/scenedetect-task-contract.test.ts tests/integration/api/remake-projects-task-projection.test.ts` passed: 5 tests.
- `npm run check:test-tasktype-coverage` passed: 44 task types.
- `npm run check:api-handler` passed: 151 routes.
- `npm run typecheck` passed.

## Deviations from Plan

None - no second queue, worker lifecycle, or task state center was introduced.

## Next Phase Readiness

05-04 can now establish the canonical vendored SceneDetect complete-App entry and compile-check its native project/runtime contract against these adapter and task boundaries.

---
*Phase: 05-remake-project-core-workbench*
*Plan: 03*
*Completed: 2026-08-07*
