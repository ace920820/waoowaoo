# Video Prompt Historical Shots TDD Evidence

## User Journey

As a remake user, I can analyze the complete current source video even when the project retains Shots from earlier analyses, so that the generated video Prompts appear for every current Shot.

## RED

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/task/remake-prompt-video-atomic.test.ts`

The new historical-Shot case failed with `REMAKE_PROMPT_VIDEO_RESULT_INVALID`. The persistence code compared all stored project Shots with the current manifest count.

## GREEN

`BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/task/remake-prompt-video-atomic.test.ts tests/unit/remake-projects/video-prompt-id.test.ts tests/unit/worker/remake-prompt.test.ts`

Result: 21 tests passed. `npm run typecheck` and targeted ESLint also passed.

## Production Verification

Task `9324de75-1443-447d-8d93-02f410b68444` completed using the current 48-Shot source snapshot. It created one `RemakePromptRun` and 48 `video` Prompt versions. Sample persisted `coreText` values were non-empty, confirming the Prompt UI read path has data to display.
