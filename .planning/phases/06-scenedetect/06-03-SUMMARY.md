---
phase: 06-scenedetect
plan: 03
status: complete
---

# Phase 06 Plan 03 Summary

Implemented the restricted local SceneDetect capability and connected both SceneDetect operations to the existing text worker lifecycle.

## Delivered

- Added a server-only executor client with a localhost default (`http://127.0.0.1:8000`), fixed `/api/health`, `/api/analyze`, and `/api/keyframes` paths, timeout controls, source/response byte limits, JSON/schema validation, and stable error codes.
- Added task payload allowlisting for detector, threshold, frame tuple, source/shot revision, operation key, and operation fields.
- Added synchronous FastAPI response fixtures and focused client tests covering fixed paths, absent token headers, HTTP/non-JSON/schema/size failures.
- Added the SceneDetect worker handler: current source ownership/revision validation, storage read, truthful stage-only progress, executor invocation, versioned result envelope, and transactional importer handoff.
- Dispatched `scenedetect_analyze` and `scenedetect_extract_keyframes` through the existing text queue and updated task behavior coverage.

## Contract Deviation

The plan's original remote `SCENEDETECT_EXECUTOR_BASE_URL` / `SCENEDETECT_EXECUTOR_TOKEN` setup precondition was not applied. SceneDetect is the local FastAPI project at `/Volumes/KINGSTON/projects/SceneDetect`; the client defaults to `127.0.0.1:8000` and sends no auth header or user-controlled URL. An explicitly configured server base URL is still constrained to an origin-only HTTP(S) URL, with paths fixed by the client.

## Verification

- `npx vitest run tests/unit/remake-projects/scenedetect-executor.test.ts tests/unit/remake-projects/scenedetect-task-contract.test.ts`
- `npx tsc --noEmit`
- `npm run check:test-tasktype-coverage` (`OK taskTypes=45`)
- Local executor health: `GET http://127.0.0.1:8000/api/health` returned `{"status":"ok"}`.
