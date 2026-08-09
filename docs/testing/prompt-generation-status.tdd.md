# Prompt generation status TDD evidence

## User journey

As a remake user, after I request an image Prompt analysis, I can see that the
selected keyframe is being analyzed until the background task completes.

## RED and GREEN

The regression is caused by a task-type casing mismatch: persisted tasks use
`remake_image_prompt_analyze` and `remake_video_prompt_analyze`, while the
frontend looked for uppercase names. The rendered state therefore remained
idle even when the task was queued or processing.

| Guarantee | Test | Result |
| --- | --- | --- |
| A persisted lowercase image task is found before its Prompt track exists | `remake-prompt-stage-contract.test.ts` | PASS |
| Queued and processing image tasks render the in-image generation overlay | `prompt-image-generation-state.test.tsx` | PASS |
| Active lowercase Prompt tasks keep snapshot polling active | `remake-snapshot-refresh.test.ts` | PASS |
| The Prompt API can accept an image analysis request | `remake-projects-prompt-analyze.test.ts` | PASS |
| The worker can resolve persisted media before invoking Codex | `remake-prompt.test.ts` | PASS |

## Commands

```sh
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/remake-projects/prompt-image-generation-state.test.tsx \
  tests/unit/remake-projects/remake-prompt-stage-contract.test.ts \
  tests/unit/remake-projects/remake-snapshot-refresh.test.ts \
  tests/integration/api/remake-projects-prompt-analyze.test.ts \
  tests/unit/worker/remake-prompt.test.ts
npm run typecheck
```

Both commands passed: 22 focused tests passed and TypeScript completed without
errors. The repository's default coverage configuration only includes billing
modules, so it cannot measure this Prompt-only test target and its 80% global
threshold is not applicable to this change.
