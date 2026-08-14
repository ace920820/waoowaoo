# Deferred Items — Phase 09.1

Out-of-scope discoveries logged during plan execution (scope boundary rule:
pre-existing issues in unrelated files are NOT auto-fixed here).

## 1. Pre-existing failing test: `remake-keyframe-task-contract.test.ts`

- **Found during:** 09.1-01 final verification sweep (post-Task 3)
- **Issue:** `tests/unit/remake-projects/remake-keyframe-task-contract.test.ts:81`
  asserts `schema.toContain('outputVersionId String @unique')` (single-space
  separators), but `prisma/schema.prisma:741` uses aligned multi-space
  formatting (`outputVersionId   String                        @unique`), so the
  substring never matches. Verified pre-existing: `prisma/schema.prisma` is
  byte-identical to the state at 09.1-01 Task 1 HEAD (`0d56322`) and was last
  modified by an earlier phase commit (`906a83c`), not by this plan.
- **Impact:** 1 test failure in the broad `tests/unit/remake-projects` sweep
  (223/224 pass). Unrelated to the unit-video contracts; all 54 focused
  09.1-01 tests pass, typecheck passes.
- **Suggested fix (future):** either reformat the schema assertion to match
  Prisma's aligned output, or normalize the schema with `prisma format` and
  update the assertion. Owner: Phase 9 keyframe plan or a lint/format cleanup
  plan.
