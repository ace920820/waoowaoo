---
status: resolved
trigger: "Prompt analysis shows no keyframe images after SceneDetect analysis"
created: 2026-08-09
updated: 2026-08-09
---

# Keyframe Images Missing

## Symptoms

- Expected: analyzed current shots expose Start/Middle/End thumbnails in Prompt analysis.
- Actual: a cached pre-transfer snapshot rendered "无关键帧" and Prompt showed 0/48 eligible.
- Reproduction: upload a video, run SceneDetect analysis, then open Prompt analysis.

## Current Focus

- hypothesis: resolved. The media references were persisted, but the browser kept an old snapshot taken before asynchronous keyframe transfer completed.
- next_action: none

## Evidence

- timestamp: 2026-08-09; `getRemakeProjectSnapshot()` for project `e44be650-a801-4a76-b7e3-255d018d49b1` returned 48 shots, 48 prompt-eligible reviews, and a non-empty media URL for every start/middle/end frame.
- timestamp: 2026-08-09; the first current image frame was read from storage as a valid JPEG (`ffd8ffdb` header).
- timestamp: 2026-08-09; RED: `tests/unit/remake-projects/remake-snapshot-refresh.test.ts` failed because no refresh policy existed for incomplete keyframes.
- timestamp: 2026-08-09; GREEN: focused Vitest run passed 6 tests and `npm run typecheck` passed.

## Resolution

- root_cause: `useRemakeProject` retained the snapshot created between SceneDetect shot import and asynchronous keyframe persistence. No query invalidation or refresh ran when that transfer completed.
- fix: while an analyzed project contains a shot with a missing renderable start/middle/end media URL, the snapshot refetches every second. It stops as soon as all current keyframes are available.
- verification: `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-snapshot-refresh.test.ts tests/integration/api/remake-project-core.test.ts`; `npm run typecheck`.
- files_changed: `src/lib/query/hooks/useRemakeProject.ts`, `tests/unit/remake-projects/remake-snapshot-refresh.test.ts`.
