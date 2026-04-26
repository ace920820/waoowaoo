# Quick Task Plan — Dialog opacity and shot-group image generation

## Boundary
- Improve storyboard package import preview dialog readability.
- Fix failed shot-group reference/composite image generation for the current Google Nano Banana 2 configuration.
- Do not change unrelated storyboard/video production flows.

## Evidence
- Dev log shows `image_shot_group` worker failures with Google `INVALID_ARGUMENT` from `resolveImageSourceFromGeneration`.
- DB task payload confirms recent failures for both `targetField=reference` and `targetField=composite`.
- Project capability override for `google::gemini-3.1-flash-image-preview` is `resolution: 0.5K`.
- Google generator currently sends `imageConfig.imageSize = 0.5K` for image-conditioned Nano Banana 2 requests.

## Write set
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/StoryboardPackageImportDialog.tsx`
- `src/lib/generators/image/google.ts`
- `tests/unit/generators/google-gemini-image-generator.test.ts`
- `.planning/quick/260426-rln-fix-storyboard-import-dialog-opacity-and/PLAN.md`
- `.planning/quick/260426-rln-fix-storyboard-import-dialog-opacity-and/SUMMARY.md`
- `.planning/STATE.md`

## Steps
1. Make import dialog overlay/card more opaque.
2. Omit unsupported `0.5K` imageSize for Nano Banana 2 image-conditioned requests.
3. Add focused generator regression test.
4. Run targeted tests and typecheck.
