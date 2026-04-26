# Quick Task Summary — Fix storyboard package import review findings

## Completed
- Added schema validation for duplicate `segmentId` values across a storyboard package.
- Added schema validation for duplicate shot `index` values within each segment.
- Made commit-time segment lookup scene-qualified by `sceneId + segmentId`.
- Added visible preview upload error handling in the script-page import dialog.
- Added focused regression tests for validator and upload preview error UI.

## Validation
- `npx vitest run tests/unit/novel-promotion/storyboard-package/storyboard-package-validator.test.ts tests/unit/novel-promotion/storyboard-package-upload-ui.test.ts tests/integration/api/specific/novel-promotion-storyboard-package-import-route.test.ts`
- `npm run typecheck`

## Notes
- No unrelated product behavior was changed.
- The UI now keeps the import dialog open for preview failures so the user sees the error and can cancel/retry.
