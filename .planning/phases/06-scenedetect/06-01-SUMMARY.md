---
phase: 06-scenedetect
plan: 01
subsystem: source-ingest
tags: [scenedetect, upload, storage, prisma, revision, idempotency]
requires:
  - phase: 05-remake-project-core-workbench
    provides: remake project/source persistence and authenticated workbench boundary
provides:
  - project-scoped SceneDetect source upload route
  - current source revision and source history persistence
  - server-side video validation and ffprobe metadata
  - replay-safe storage upload with database-failure compensation
affects: [06-02, 06-03, 06-04]
actuals:
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Source media is written to Waoo storage before transactional source revision persistence, with cleanup on DB failure."
    - "Operation keys replay the existing source revision and never create duplicate source records."
key-files:
  created:
    - prisma/migrations/20260807190000_add_remake_source_ingest/migration.sql
    - src/app/api/remake-projects/[projectId]/source/route.ts
    - src/lib/remake-projects/scenedetect/source.ts
    - src/lib/remake-projects/scenedetect/video-probe.ts
    - tests/integration/api/contract/remake-projects-scenedetect-source.contract.test.ts
    - tests/integration/api/remake-projects-scenedetect-source.test.ts
  modified:
    - prisma/schema.prisma
    - tests/contracts/route-catalog.ts
requirements-completed: [SHOT-01]
coverage:
  - id: D1
    description: "Authenticated source upload validates extension, MIME, size, and file header before storage or persistence."
    requirement: SHOT-01
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-scenedetect-source.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "Valid source media receives ffprobe metadata and becomes the current source revision while preserving history."
    requirement: SHOT-01
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-scenedetect-source.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "Repeated operation keys replay safely and failed database persistence removes the uploaded object."
    requirement: SHOT-01
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-scenedetect-source.test.ts
        status: pass
      - kind: contract
        ref: tests/integration/api/contract/remake-projects-scenedetect-source.contract.test.ts
        status: pass
    human_judgment: false
---

# Phase 06 Plan 01 Summary

**Project-scoped SceneDetect source ingest with validated video metadata, revision history, idempotent replay, and storage compensation.**

## Accomplishments

- Added `POST /api/remake-projects/[projectId]/source` with project ownership checks and multipart upload validation.
- Added source revision/history fields, current-source linkage, and shot revision metadata required by later SceneDetect plans.
- Added MP4/WebM/MOV/M4V header checks, configurable size limits, server-side `ffprobe`, Waoo storage upload, and DB-failure cleanup.
- Added focused route catalog, contract, and integration coverage.

## Task Commits

1. **Task 1 and Task 2: source ingest, revision persistence, replay, and compensation** - `7507bd8`

## Verification

- Focused source and contract tests passed: 3 files, 11 tests.
- `npm run typecheck` passed.
- Full `verify:commit` passed, including lint, 251 unit test files / 936 tests, billing integration and concurrency, API/chain/task/system/regression suites.

## Deviations from Plan

- A separate baseline test-contract commit (`19c2028`) was required because the repository's full commit gate exposed stale assertions for the existing default multi-shot behavior. It does not change SceneDetect production behavior.

## Next Phase Readiness

`06-02` can now bind versioned SceneDetect result envelopes and transactional imports to a persisted current source revision and Waoo storage facts.

---
*Phase: 06-scenedetect*
*Plan: 01*
*Completed: 2026-08-08*
