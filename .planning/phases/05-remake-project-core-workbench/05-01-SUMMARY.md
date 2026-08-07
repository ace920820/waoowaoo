---
phase: 05-remake-project-core-workbench
plan: 01
subsystem: database-api
tags: [prisma, remake-project, snapshot, invalidation, task]
requires: []
provides:
  - "Explicit remake project type with transactional creation and idempotency key"
  - "Stable Waoo remake project/source/shot/revision/output/provenance/invalidation schema"
  - "Allowlisted remake snapshot API dispatch and empty not-imported workbench entry"
affects: [05-02, 05-03, 05-05, phase-6]
actuals:
  tokens: 18000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Explicit project type dispatch preserves the legacy novel-promotion path"
    - "Remake snapshots expose database-backed allowlisted state without fake shots"
key-files:
  created:
    - prisma/migrations/20260807184000_add_remake_project_core/migration.sql
    - src/lib/remake-projects/service.ts
    - tests/integration/api/remake-project-core.test.ts
    - tests/regression/remake-project-api-boundary.test.ts
  modified:
    - prisma/schema.prisma
    - src/app/api/projects/route.ts
    - src/app/api/projects/[projectId]/data/route.ts
    - src/app/[locale]/workspace/[projectId]/page.tsx
    - src/types/project.ts
    - messages/zh/workspaceDetail.json
    - messages/en/workspaceDetail.json
key-decisions:
  - "Use Waoo UUIDs as remake shot primary keys; external identity remains nullable provenance data."
  - "Initialization is represented by the existing Task table; no second queue or task center is introduced."
  - "Revision changes set needs_review and retain prior records instead of auto-approving outputs."
requirements-completed: [RMP-01, RMP-02, RMP-03, RMP-04, RMP-05, RMP-06]
coverage:
  - id: D1
    description: "Transactional explicit remake project creation creates project metadata and one initialization task without fake shots."
    requirement: RMP-01
    verification:
      - kind: integration
        ref: tests/integration/api/remake-project-core.test.ts#creates one explicit remake project with an empty shot collection and initialization task
        status: pass
    human_judgment: false
  - id: D2
    description: "Remake project snapshot restores allowlisted source, shot, provenance, and task state."
    requirement: RMP-02
    verification:
      - kind: integration
        ref: tests/integration/api/remake-project-core.test.ts#restores only allowlisted remake snapshot fields without inventing shots
        status: pass
    human_judgment: false
  - id: D3
    description: "Revision changes preserve history and mark downstream state for manual review."
    requirement: RMP-04
    verification:
      - kind: integration
        ref: tests/integration/api/remake-project-core.test.ts#records a new revision and marks affected outputs for review without auto-approval
        status: pass
    human_judgment: false
  - id: D4
    description: "The detail route enters an explicit remake empty state while legacy projects retain their existing workspace path."
    requirement: RMP-03
    verification: []
    human_judgment: true
    rationale: "The full browser workbench and responsive evidence are intentionally deferred to 05-05."
---

# Phase 05 Plan 01 Summary

**Prisma-backed remake project core with idempotent creation, stable shot lineage, allowlisted snapshots, and manual-review invalidation.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-07T18:34:00Z
- **Completed:** 2026-08-07T18:46:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added remake-specific Prisma models and migration with explicit UUID identity, revision/output/provenance history, and invalidation relations.
- Added transactional, idempotent `createRemakeProject`, allowlisted snapshot loading, and revision invalidation service functions.
- Added explicit API dispatch and a real database-backed not-imported detail state while preserving legacy project behavior.

## Task Commits

1. **Task 1: 建立翻拍核心模型与项目创建/恢复事务** - `6444fcb`
2. **Task 2: 接入翻拍 mode 与真实状态摘要** - `3bea45b`

## Verification

- `npx prisma validate` passed.
- `npm run typecheck` passed.
- Focused remake and legacy project tests passed: 7 tests.
- Full `npm run test:all` was attempted by the commit hook; it remains red on 11 pre-existing failures in `json-repair` and `VideoPanelCardBody` tests unrelated to this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added regression-location API test**
- **Found during:** Task 1 commit validation
- **Issue:** The repository changed-file impact guard does not recognize a top-level `tests/integration/api` file as coverage for API route changes.
- **Fix:** Added an executable route regression under `tests/regression/` while retaining the planned integration test.
- **Verification:** `tests/regression/remake-project-api-boundary.test.ts` passed and the changed-file impact guard passed.
- **Committed in:** `6444fcb`

**Total deviations:** 1 auto-fixed. **Impact:** The extra test only satisfies the repository's existing coverage gate; no product scope was added.

## Next Phase Readiness

05-02 can now define SceneDetect adapter contracts against stable Waoo project/shot/revision/provenance IDs. The source remains `not_imported` until later plans inject a real SceneDetect runtime; no fake business shots are created.

---
*Phase: 05-remake-project-core-workbench*
*Plan: 01*
*Completed: 2026-08-07*
