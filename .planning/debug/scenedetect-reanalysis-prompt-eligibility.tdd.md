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

| Guarantee | Evidence |
| --- | --- |
| Reanalysis uses a stable external Shot identity rather than a run-specific analysis id. | `scenedetect-adapter.test.ts` |
| Import retires the previous active set and writes the new `currentRevision`. | `remake-projects-scenedetect-import.test.ts` |
| Automatic pending Shots stay unconfirmed but become Prompt-eligible when current and keyframe-complete. | `scenedetect-review-gate.test.ts` |
| The Prompt API accepts an eligible automatic Shot and queues the image analysis task. | `remake-projects-prompt-analyze.test.ts` |

## Additional Verification

`npm run typecheck` passed.

The repository coverage configuration only includes billing files and applies an 80% billing threshold. Running the focused SceneDetect/Prompt tests with `--coverage` therefore reports 0% for unrelated billing files and exits nonzero; it is not evidence of missing coverage in this fix. The focused behavior tests above are the relevant coverage evidence.
