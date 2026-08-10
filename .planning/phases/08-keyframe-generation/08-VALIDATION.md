---
phase: 08-keyframe-generation
slug: keyframe-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-10
updated: 2026-08-10
---

# Phase 08 - Validation Strategy

> Execution-time Nyquist contract for the four Phase 8 plans, KFRM-01..KFRM-07, D-01..D-20, the UI-SPEC backstops, and ASVS L1 evidence.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 + Playwright 1.62.1 + Prisma/MySQL/Redis integration harness |
| Config files | `vitest.config.ts`, `playwright.config.ts`, `docker-compose.test.yml` |
| Quick run command | `npx vitest run tests/unit/remake-projects/remake-keyframe-task-contract.test.ts tests/unit/remake-projects/remake-video-input-contract.test.ts` |
| Full focused command | `npm run typecheck && npm run test:guards && node scripts/verify-remake-keyframes-ui.mjs` |
| Estimated runtime | Focused unit/API gates target 120 seconds; controlled migration/Worker/E2E gates may take up to 8 minutes |

## Execution Preconditions

- Plan 08-01 validates and applies `prisma/migrations/20260810120000_add_remake_keyframe_generation/migration.sql` to `mysql://root:root@127.0.0.1:3307/waoowaoo_test` before Plans 08-02..04 consume the schema.
- Worker/integration commands start only the tracked `docker-compose.test.yml` MySQL/Redis services and use `BILLING_TEST_BOOTSTRAP=0` after database bootstrap.
- Plan 08-04's browser harness validates the isolated database target, records the child app-server PID and port, and terminates only that child on exit.
- Every file marked `W0` below is created test-first by its mapped task. A skipped test, missing fixture, missing service, or environment-based early return is not green evidence.

## Sampling Rate

- After every task commit: run that task's `<verify><automated>` command.
- After Wave 1: run Prisma validate, the controlled migration deploy, Prisma generate, persistence, action-sheet, and SceneDetect invalidation suites.
- After Wave 2: run Plan 08-02 contract/API/service/Worker suites plus Task/API/provider/config guards and typecheck.
- After Wave 3: run Plan 08-03 navigation/Storyboard/Video suites, unchanged Novel Promotion compatibility suites, locale navigation, and typecheck.
- After Wave 4 and before `$gsd-verify-work`: run `npm run typecheck && npm run test:guards && node scripts/verify-remake-keyframes-ui.mjs`, then execute the human checkpoint.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement / Decision | Secure behavior | Automated command | Test artifact state |
|---------|------|------|------------------------|-----------------|-------------------|---------------------|
| 08-01-01 | 01 | 1 | KFRM-03/04/05; D-08/D-10..12/D-14/D-17/D-19/20 | Scoped relations, unique slot pointer, immutable records, no Novel entity writes | `DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx prisma validate --schema prisma/schema.prisma && DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/integration/remake-projects/keyframe-persistence.test.ts` | `keyframe-persistence.test.ts` W0 |
| 08-01-02 | 01 | 1 | KFRM-03/05/06; D-10/11/12/17 | Owned confirmed media only, deterministic provenance and Project/Shot-scoped invalidation contract | `BILLING_TEST_BOOTSTRAP=0 DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/integration/remake-projects/keyframe-action-sheet.test.ts` | action-sheet contract exists |
| 08-01-03 | 01 | 1 | KFRM-03/04/05; D-14/D-17 | Forward apply preserves Remake and Novel Promotion history without reset | `docker compose -f docker-compose.test.yml up -d mysql && DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx prisma migrate deploy --schema prisma/schema.prisma && DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx prisma generate --schema prisma/schema.prisma && DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/integration/remake-projects/keyframe-persistence.test.ts` | migration + persistence W0 |
| 08-02-01 | 02 | 2 | KFRM-01/02/03/05; D-08/09/D-13..17 | Authenticated frozen input reaches only existing image infrastructure; stale/cross-project/partial paths fail closed | `docker compose -f docker-compose.test.yml up -d mysql redis && BILLING_TEST_BOOTSTRAP=0 DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/unit/worker/remake-keyframe-image.test.ts tests/integration/api/remake-projects-keyframes.test.ts` | both files W0 |
| 08-02-02 | 02 | 2 | KFRM-01..07; D-07..10/D-13..20 | Server owns eligibility, immutable history, and explicit current-revision adoption | `BILLING_TEST_BOOTSTRAP=0 DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/integration/api/remake-projects-keyframes.test.ts tests/integration/remake-projects/keyframe-service.test.ts` | both files W0 |
| 08-02-03 | 02 | 2 | KFRM-03/05/06; D-10/11/12/17 | Confirmed revision creates one idempotent action-sheet Task, existing image queue dispatches it, and no provider/video path is introduced | `BILLING_TEST_BOOTSTRAP=0 DATABASE_URL=mysql://root:root@127.0.0.1:3307/waoowaoo_test npx vitest run tests/unit/worker/remake-keyframe-image.test.ts tests/integration/remake-projects/keyframe-action-sheet.test.ts tests/integration/api/remake-projects-scenedetect-mutations.test.ts && npm run check:test-tasktype-coverage` | worker and SceneDetect trigger files W0 |
| 08-03-01 | 03 | 3 | KFRM-01/02/07; D-01..05/D-13/D-15 | Free stage navigation and shared tools use one authorized snapshot; no navigation side effect submits work | `npx vitest run tests/unit/remake-projects/remake-workbench-keyframe-navigation.test.ts && npm run check:locale-navigation` | navigation file W0 |
| 08-03-02 | 03 | 3 | KFRM-01..07; D-06..10/D-14..20 | Local preview never mutates adoption; unavailable controls emit no mutation; original media remains evidence | `npx vitest run tests/unit/remake-projects/remake-keyframe-stage.test.ts` | keyframe-stage file W0 |
| 08-03-03 | 03 | 3 | KFRM-04/06/07; D-02/D-05/D-10..15/D-19 | Exact legal adopted subset, distinct auxiliary sheet, no video mutation, unchanged Novel behavior | `npx vitest run tests/unit/remake-projects/remake-video-input-contract.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/video-stage-runtime-regressions.test.ts` | Remake file W0; both Novel suites exist |
| 08-04-01 | 04 | 4 | KFRM-01..07; D-01..20 | Real-route ownership, persistence, responsive/accessibility states, and zero video requests/tasks | `node scripts/verify-remake-keyframes-ui.mjs` | fixture/spec/harness W0 |
| 08-04-02 | 04 | 4 | KFRM-01..07; D-01..20 | Full automated gate precedes human semantic and visual acceptance | `npm run typecheck && npm run test:guards && node scripts/verify-remake-keyframes-ui.mjs` | uses 08-04-01 artifacts |

*Artifact state: `W0` means the mapped task creates the currently missing test or harness file; existing compatibility files are run read-only.*

## Requirement Verification Matrix

| Requirement | Observable behavior | Primary automated evidence | Final evidence |
|-------------|---------------------|----------------------------|----------------|
| KFRM-01 | Current adopted approved Prompt generates each selected legal slot through the existing gateway | 08-02-01/02 | 08-04-01 real route |
| KFRM-02 | Per-submit model, size, quality, references, allowed parameters, and candidate count are capability-valid | 08-02-01/02 | 08-03-02 + 08-04-01 |
| KFRM-03 | Every immutable version retains Prompt/options/Task/output/provenance relationships | 08-01-01/03 + 08-02-01/02 | 08-04-01 reload/history |
| KFRM-04 | Users compare originals/candidates and explicitly adopt at most one version per slot | 08-01-01 + 08-02-02 + 08-03-02 | 08-04-01 replacement flow |
| KFRM-05 | Prompt/revision changes and regeneration preserve old Prompt, images, batches, Tasks, and adoption history | 08-01-02/03 + 08-02-02 | 08-04-01 invalidation/reload |
| KFRM-06 | Start/End-only and no-Middle states expose the actual legal input contract | 08-02-02 + 08-03-02/03 | 08-04-01 Storyboard/Video |
| KFRM-07 | Missing approved Prompts are blocked from default generation and visible as missing items | 08-02-02 + 08-03-01/02/03 | 08-04-01 missing-item state |

## Decision Verification Matrix

| Decisions | Owning evidence | Required observation |
|-----------|-----------------|----------------------|
| D-01..D-05 | 08-03-01, 08-04-01/02 | Real Storyboard/Video mounts, free navigation, explicit Prompt handoff count, complete shared tools |
| D-06..D-10 | 08-01-01, 08-02-02, 08-03-02, 08-04-01/02 | One two-layer Shot, immutable originals, persisted explicit selection, reused generation controls, adopted images as primary refs |
| D-11..D-12 | 08-01-01/02, 08-02-03, 08-03-03, 08-04-01/02 | Revision-bound action sheet remains auxiliary and is regenerated/inactivated without becoming a candidate |
| D-13..D-17 | 08-01-01/03, 08-02-01/02, 08-03-01/02, 08-04-01 | Shared project facts, frozen submissions, original gates/states, 1..4 override, immutable batches |
| D-18..D-20 | 08-01-01, 08-02-02, 08-03-02/03, 08-04-01/02 | Preview/comparison is non-mutating; one legal adopted pointer changes only through confirmed explicit adoption |

## Wave Gates and Evidence

| Wave | Plans | Required gate | Evidence recorded in |
|------|-------|---------------|----------------------|
| 1 | 08-01 | Prisma validate, controlled migrate deploy/generate, persistence, action-sheet, SceneDetect invalidation | `08-01-SUMMARY.md` |
| 2 | 08-02 | contracts, API/service, image Worker/action-sheet dispatch, Task/API/provider/config guards, typecheck | `08-02-SUMMARY.md` |
| 3 | 08-03 | navigation, Storyboard, Video, unchanged Novel compatibility, locale, typecheck | `08-03-SUMMARY.md` |
| 4 | 08-04 | isolated real-route desktop/mobile E2E, zero video evidence, full gate, human acceptance | `08-04-SUMMARY.md` |

## Wave 0 Requirements

- [ ] `tests/integration/remake-projects/keyframe-persistence.test.ts` - slot uniqueness, append-only batch/candidate/adoption, migration/domain compatibility.
- [ ] `tests/integration/remake-projects/keyframe-action-sheet.test.ts` - deterministic renderer/provenance/idempotency and current/waiting/stale results.
- [ ] `tests/unit/remake-projects/remake-keyframe-task-contract.test.ts` - strict slot/options/reference/count snapshot and dedupe identity.
- [ ] `tests/unit/worker/remake-keyframe-image.test.ts` - image generation and action-sheet Task routing, lifecycle, stale/failure handling, provider boundary.
- [ ] `tests/integration/api/remake-projects-keyframes.test.ts` - auth, ownership, selection, submission, history, adoption, conflict, and malformed input.
- [ ] `tests/integration/remake-projects/keyframe-service.test.ts` - eligibility, legal subsets, missing items, immutable history, explicit adoption.
- [ ] `tests/unit/remake-projects/remake-workbench-keyframe-navigation.test.ts` - free stages, Prompt handoff, shared tools, no navigation mutation.
- [ ] `tests/unit/remake-projects/remake-keyframe-stage.test.ts` - two-layer Shot, selection, controls, batches, preview/comparison/adoption, responsive/accessibility states.
- [ ] `tests/unit/remake-projects/remake-video-input-contract.test.ts` - primary/auxiliary groups, exact capability subset, disabled video seam.
- [ ] `tests/e2e/fixtures/remake-keyframe-project.ts` - deterministic authorized persistence/config/action-sheet fixture.
- [ ] `tests/e2e/remake-keyframes.spec.ts` - real-route desktop/mobile workflows, refresh/invalidation, shared tools, zero video requests/tasks.
- [ ] `scripts/verify-remake-keyframes-ui.mjs` - isolated migration/seed/server/Playwright harness with exact child cleanup.

Existing read-only regression inputs are `tests/integration/api/remake-projects-scenedetect-mutations.test.ts`, `tests/unit/novel-promotion/video-panel-card-body.test.ts`, and `tests/unit/novel-promotion/video-stage-runtime-regressions.test.ts`.

## ASVS L1 Evidence

| Control area | Evidence |
|--------------|----------|
| Authentication/session | 08-02 API tests require the current authenticated Project boundary; 08-04 uses authenticated real routes |
| Access control | Cross-Project Shot/track/candidate/reference ids fail in 08-01/02 persistence and API suites |
| Input validation | Strict Zod task/API contracts and centralized capability resolution run in 08-02-01/02 |
| Stored/output integrity | Current-revision fingerprint rechecks, append-only records, explicit adoption, and forward migration run in 08-01/02 |
| Error/privacy handling | Worker/API failure suites assert actionable redacted errors and no false completed output |
| Deferred execution boundary | 08-03/04 prove no Video mutation import, request, Task type, or Task row exists in Phase 8 |

## Manual-Only Verification

| Behavior | Requirement / Decision | Why manual | Test instructions |
|----------|------------------------|------------|-------------------|
| Visual hierarchy and semantic clarity of original evidence, adopted main preview, preview-only state, primary/auxiliary Video groups, and disabled Video generation | KFRM-04/06; D-02/D-10/D-12/D-18/D-20 | Automated DOM and screenshot assertions cannot fully judge whether authority and hierarchy are unmistakable | Execute Plan 08-04 Task 2 after every automated gate is green at desktop and mobile widths. |

## Validation Sign-Off

- [x] Exactly four plans and their actual task IDs, paths, commands, and waves are represented.
- [x] Every task has a runnable `<automated>` verification command.
- [x] Every KFRM requirement maps to focused evidence, a wave gate, and final E2E evidence.
- [x] D-01..D-20 map to owning task evidence and final acceptance.
- [x] Wave 0 owns every currently missing test/harness file; existing SceneDetect and Novel compatibility tests remain read-only.
- [x] No watch-mode flag, skip-as-success path, video execution path, or package installation appears in the validation contract.
- [ ] Wave 0 files exist and all focused commands are green.
- [ ] Wave 4 full gate and human acceptance are complete.
- [ ] Set `nyquist_compliant: true` and `status: validated` after all evidence is recorded.

**Approval:** pending execution evidence
