# SceneDetect Reanalysis And Prompt Eligibility TDD Evidence

## User Journeys

- A remake user can rerun SceneDetect without accumulating a second active copy of every Shot.
- A remake user can submit image and whole-video Prompt analysis after automatic boundary detection has produced complete keyframes.

## RED

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/scenedetect-adapter.test.ts tests/unit/remake-projects/scenedetect-review-gate.test.ts tests/integration/api/remake-projects-scenedetect-import.test.ts`

Result: 3 intended failures. The stable key changed with `analysisId`; import never retired prior active revisions or updated `currentRevision`; and a pending automatic Shot was not prompt-eligible.

## GREEN

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-prompt-analyze.test.ts tests/unit/remake-projects/scenedetect-adapter.test.ts tests/unit/remake-projects/scenedetect-review-gate.test.ts tests/integration/api/remake-projects-scenedetect-import.test.ts`

Result: 4 files, 14 tests passed.

## Legacy Identity Migration

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-import.test.ts`

Result: the legacy `analysisId:shotId` identity reproducer failed before the migration lookup because import attempted a fresh stable-key upsert. After the fix, the focused suite passes and the importer reuses the historical Shot before appending a new revision.

## Historical Duplicate Identity Conflict

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-import.test.ts`

Result before the fix: the new reproducer failed because a broad legacy suffix lookup selected a duplicate `analysisId:scene-N` row, then `remakeShot.update()` tried to assign an `externalIdentity` already owned by the canonical `scene-N` row.

Result after the fix: the importer looks up the exact external identity first, then the current stable key, and only then a legacy suffix. The focused suite, related Prompt/SceneDetect suites, and `npm run typecheck` pass.

| Guarantee | Evidence |
| --- | --- |
| Reanalysis uses a stable external Shot identity rather than a run-specific analysis id. | `scenedetect-adapter.test.ts` |
| Import retires the previous active set and writes the new `currentRevision`. | `remake-projects-scenedetect-import.test.ts` |
| Automatic pending Shots stay unconfirmed but become Prompt-eligible when current and keyframe-complete. | `scenedetect-review-gate.test.ts` |
| The Prompt API accepts an eligible automatic Shot and queues the image analysis task. | `remake-projects-prompt-analyze.test.ts` |
| A legacy analysis-prefixed external identity is reused without a unique-constraint conflict. | `remake-projects-scenedetect-import.test.ts` |
| A canonical `scene-N` identity wins over duplicate legacy suffix matches. | `remake-projects-scenedetect-import.test.ts` |

## Additional Verification

`npm run typecheck` passed.

The repository coverage configuration only includes billing files and applies an 80% billing threshold. Running the focused SceneDetect/Prompt tests with `--coverage` therefore reports 0% for unrelated billing files and exits nonzero; it is not evidence of missing coverage in this fix. The focused behavior tests above are the relevant coverage evidence.
