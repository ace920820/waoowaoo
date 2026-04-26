# Quick Task Plan — Fix storyboard package import review findings

## Boundary
Fix the three code review findings for storyboard package import without changing unrelated flows.

## Candidate files
- `src/lib/novel-promotion/storyboard-package/schema.ts`
- `src/lib/novel-promotion/storyboard-package/import-service.ts`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`
- `tests/unit/novel-promotion/storyboard-package/storyboard-package-validator.test.ts`
- `tests/unit/novel-promotion/storyboard-package-upload-ui.test.ts`

## Write set
- `src/lib/novel-promotion/storyboard-package/schema.ts`
- `src/lib/novel-promotion/storyboard-package/import-service.ts`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`
- `tests/unit/novel-promotion/storyboard-package/storyboard-package-validator.test.ts`
- `tests/unit/novel-promotion/storyboard-package-upload-ui.test.ts`
- `.planning/quick/260426-mj1-fix-storyboard-package-import-review-fin/PLAN.md`
- `.planning/quick/260426-mj1-fix-storyboard-package-import-review-fin/SUMMARY.md`
- `.planning/STATE.md`

## Steps
1. Reject duplicate scene segment IDs and duplicate shot indexes in schema validation.
2. Make commit lookup scene-qualified to avoid relying on segment IDs alone.
3. Catch preview upload failures and show a visible dialog error.
4. Add focused regression tests.
5. Run targeted tests.
