---
status: resolved
trigger: "Prompt image analysis returned 500 and whole-video analysis returned 400"
created: 2026-08-09
updated: 2026-08-09
---

# Prompt Analysis Submission

## Symptoms

- Image Prompt submission returned HTTP 500.
- Whole-video Prompt submission returned HTTP 400 for a project with 48 current, keyframe-complete shots.

## Current Focus

- hypothesis: resolved.
- next_action: none

## Evidence

- timestamp: 2026-08-09; the video endpoint compared 48 valid current-source snapshots against all stored shots, including historical source revisions.
- timestamp: 2026-08-09; Redis at `127.0.0.1:16379` was closed, so image task enqueueing raised a server error.
- timestamp: 2026-08-09; RED: `submits whole-video analysis using only shots from the current source revision` returned 400 before the filtering fix.
- timestamp: 2026-08-09; GREEN: the focused prompt API and task-contract tests passed, as did `npm run typecheck`.
- timestamp: 2026-08-09; a real target-project media UUID resolved to `images/scenedetect/...jpg`, and the stored object read as a valid JPEG (`ffd8`).

## Resolution

- root_cause: historical `RemakeShot` records were incorrectly included in the whole-video completeness check; Redis was initially stopped; and prompt workers treated persisted `MediaObject.id` UUIDs as local file paths.
- fix: compare only non-retired current revisions matching the active source revision; start the configured Redis service (`docker compose up -d redis`); resolve media IDs through `getMediaObjectById` before reading storage.
- verification: `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-prompt-analyze.test.ts tests/unit/worker/remake-prompt.test.ts`; `npm run typecheck`; Redis TCP health check on port 16379; real JPEG read check.
- files_changed: `src/app/api/remake-projects/[projectId]/prompts/analyze/route.ts`, `src/lib/workers/handlers/remake-prompt.ts`, `tests/integration/api/remake-projects-prompt-analyze.test.ts`, `tests/unit/worker/remake-prompt.test.ts`.
