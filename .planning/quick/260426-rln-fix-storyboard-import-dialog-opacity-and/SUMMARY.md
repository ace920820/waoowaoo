# Quick Task Summary — Dialog opacity and shot-group image generation

## Completed
- Made the storyboard package import preview modal visually more opaque by using a darker overlay, backdrop blur, and the project modal surface token.
- Investigated local dev logs and DB task records for failed `image_shot_group` jobs.
- Root cause: current project uses `google::gemini-3.1-flash-image-preview` with `resolution: 0.5K`; when the shot-group reference/composite generation path sends reference images, Google rejects `imageConfig.imageSize = 0.5K` with `400 INVALID_ARGUMENT`.
- Updated the Google Gemini image generator to omit `0.5K` imageSize for Nano Banana 2 image-conditioned requests while preserving supported sizes like `2K`.
- Added focused regression coverage for the `0.5K` image-conditioned case.

## Validation
- `npx vitest run tests/unit/generators/google-gemini-image-generator.test.ts tests/unit/worker/shot-group-image-task-handler.test.ts tests/unit/novel-promotion/storyboard-package-upload-ui.test.ts`
- `npm run typecheck`

## Runtime
- Dev worker detected the generator change and restarted automatically.
