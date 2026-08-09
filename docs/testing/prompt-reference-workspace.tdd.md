# Prompt Reference Workspace TDD Evidence

## Source And Journeys

The journeys were derived during this TDD run from the supplied Prompt analysis reference page.

- A creator can inspect the start, middle, and end keyframe Prompt states and the video Prompt for one shot without switching tabs.
- A creator can filter the shot list by pending review or approved work while preserving the existing server-driven task, review, version, and approval behavior.

## RED

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-prompt-stage-contract.test.ts`

The new contract failed because `PromptStage.tsx` lacked `prompt-keyframe-section` and still contained `prompt-tabs`.

## GREEN

The Prompt stage now renders the reference-style continuous review workspace: the three existing `PromptImageTab` panels are followed by the existing `PromptVideoTab`. The existing tabs' data and mutations were retained rather than replaced with prototype data.

| # | Guaranteed behavior | Test or command | Type | Result |
|---|---|---|---|---|
| 1 | Keyframe and video Prompt sections are visible together, without a tab switch | `remake-prompt-stage-contract.test.ts` | Unit contract | PASS |
| 2 | Image analysis remains per-frame and video analysis remains project-level | `remake-prompt-stage-contract.test.ts` | Unit contract | PASS |
| 3 | Prompt versions, comparisons, and server review state remain available | `remake-prompt-stage-contract.test.ts` | Unit contract | PASS |
| 4 | Prompt image/video request and worker contracts remain valid | Focused Prompt API and worker suites | Integration/unit | PASS, 18 tests |
| 5 | Prompt source compiles | `npm run typecheck` | Type check | PASS |

## Validation

Passed:

```text
BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-prompt-stage-contract.test.ts tests/unit/remake-projects/prompt-task-contract.test.ts tests/integration/api/remake-projects-prompt-analyze.test.ts tests/unit/worker/remake-prompt.test.ts
# 18 tests passed

npm run typecheck
# passed
```

`npx vitest run --coverage tests/unit/remake-projects/remake-prompt-stage-contract.test.ts` runs but reports 0% global coverage because the repository-wide threshold includes unrelated, unimported billing modules. It is not a useful coverage measurement for this source-contract UI test and is intentionally not claimed as passing coverage evidence.

Visual browser verification remains blocked by the local app's unauthenticated page; no authenticated session was bypassed.

## Translation Regression Fix

RED: `tests/unit/i18n/remake-workbench-messages.test.ts` failed after requiring the `all` key used by the Prompt shot filter. The failure reproduced `MISSING_MESSAGE: remakeWorkbench.all`.

GREEN: added `all` in both `messages/zh/remake-workbench.json` and `messages/en/remake-workbench.json`. The focused message, Prompt stage, Prompt API, and worker suites passed 17 tests; `npm run typecheck` passed. This guarantees the filter can render and an image Prompt request still returns `202` before worker execution.
