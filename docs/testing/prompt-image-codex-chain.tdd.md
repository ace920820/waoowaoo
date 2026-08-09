# Prompt Image Codex Chain TDD Evidence

Source: approved implementation plan supplied in this task.

## User Journeys

- A user can analyze one selected Start, Middle, or End keyframe without changing the other cards.
- A user sees a completed image Prompt result created by Codex for the selected keyframe.
- Historical failures from the invalid Codex image schema no longer present as current Prompt failures.

## Evidence

| Guarantee | Test | Result |
| --- | --- | --- |
| Task slot is recovered from the immutable creation event without leaking payload data | `tests/integration/api/remake-project-core.test.ts` | PASS |
| Only the selected keyframe has a generation overlay | `tests/unit/remake-projects/prompt-image-generation-state.test.tsx` | PASS |
| Image JSON Schema is strict at every nested object and image media uses `--image` | `tests/unit/worker/remake-prompt.test.ts` | PASS |
| Nonzero Codex errors retain a redacted diagnostic | `tests/unit/worker/remake-prompt.test.ts` | PASS |
| Legacy failure repair is dry-run safe and idempotent | `tests/unit/remake-projects/supersede-legacy-prompt-schema-failures.test.ts` | PASS |

RED was observed before the corresponding production changes: absent legacy repair service, non-isolated image card state, non-strict nested output schema, and no image CLI argument.

GREEN command:

```sh
BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/prompt-image-generation-state.test.tsx tests/unit/remake-projects/prompt-contract.test.ts tests/unit/remake-projects/remake-prompt-stage-contract.test.ts tests/unit/remake-projects/supersede-legacy-prompt-schema-failures.test.ts tests/unit/worker/remake-prompt.test.ts tests/integration/api/remake-project-core.test.ts
```

Result: 6 test files, 29 tests passed. `npm run typecheck` also passed.

The database-backed `tests/integration/task/remake-prompt-image.test.ts` could not run because its isolated MySQL server at `127.0.0.1:3307` was unavailable. Production-db smoke validation submitted one normal Middle-frame task for project `e44be650-a801-4a76-b7e3-255d018d49b1`; it completed and persisted one `image:middle` Prompt version using `prompt.v2`.

## Follow-up: Video Button and Adoption Status

RED: `tests/unit/remake-projects/remake-prompt-stage-contract.test.ts` failed because the page-level action called the image batch helper and because an adopted version was presented as pending when a later unadopted version existed.

GREEN command:

```sh
BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-prompt-stage-contract.test.ts tests/unit/remake-projects/prompt-image-generation-state.test.tsx
```

Result: 2 test files, 9 tests passed. The action now calls only `analyzeVideo` and uses the existing `analyzeVideo` translation. Card and filter state treat an adopted version as approved unless the track requires review.
