---
phase: 06-scenedetect
plan: 02
status: complete
commits:
  - 887f44f
---

# Phase 06 Plan 02 Summary

## Delivered

- Added strict v1 result-envelope validation, stable error codes, source-revision checks, and the explicit `legacy_json_import` compatibility wrapper.
- Made the import boundary envelope-first, idempotent by operation key, source-revision aware, and resistant to client/runtime media URLs. Stale revisions map to HTTP 409.
- Added active-latest revision native projection behavior with Waoo shot UUIDs and opaque media IDs; runtime URLs and provenance/storage details do not enter the native editor payload.

## Commits

- `887f44f feat(scenedetect): harden result import boundary`

## Verification

- PASS: `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/scenedetect-result-envelope.test.ts tests/unit/remake-projects/scenedetect-adapter.test.ts tests/contracts/remake-scenedetect-native-contract.test.ts tests/integration/api/remake-projects-scenedetect-import.test.ts tests/integration/api/remake-projects-workbench.test.ts tests/integration/api/remake-project-core.test.ts` (6 files, 22 tests).
- PASS: `npx tsc --noEmit --pretty false`.
- PASS: `git diff --check`.
- The repository commit hook started the full suite but did not finish successfully in the available output; it also reported pre-existing lint warnings only. The scoped commit was therefore made after focused verification.

## Deviations

- `src/lib/remake-projects/service.ts` and `tests/integration/api/remake-project-core.test.ts` had pre-existing uncommitted changes. Their snapshot compatibility edits remain intentionally unstaged and were not included in this plan commit, per execution ownership constraints.

## Self-Check: PASSED

