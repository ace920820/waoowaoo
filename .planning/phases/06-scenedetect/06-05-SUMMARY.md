---
phase: 06-scenedetect
plan: 05
status: complete
---

# Phase 06-05 Summary

Implemented the canonical SceneDetect embedded runtime boundary while preserving the upstream editor state machine.

- Upgraded `vendor-scenedetect.mjs` and `VENDOR.json` to schema v2 with upstream/vendored digests, aggregate hashes, registered patch metadata, deterministic replay checks, and drift detection.
- Added the registered `embedded-runtime` patch marker and restricted ESLint isolation to `src/vendor/scenedetect/**`.
- Added typed native runtime ports for source upload, canonical save token/remap, media resolution, analyze/keyframe task submission, task stages, and terminal reload.
- Added `runtime-client.ts` using Waoo source/project/task/media APIs with task polling and indeterminate executor-call progress.
- Added embedded App/Header policy props: no sample or IndexedDB restore, native upload/analyze/save branches, hidden project/export side effects, and unchanged undo/redo/edit orchestration.

Verification:

- `node scripts/vendor-scenedetect.mjs --sync`
- `node scripts/vendor-scenedetect.mjs --check`
- Focused SceneDetect contract, provenance, and duplicate-source guards: 5 tests passed
- `npm run typecheck` passed
- `npm run lint` passed with existing warnings only
