# Quick Task Summary — result page grouped shot fields

## Component Evidence
- Target result/confirmation component: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx`, specifically `ShotGroupVideoReviewSection`, which renders the user-facing `多镜头确认` result page for imported storyboard-package shot groups.
- Non-target import preview component: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/StoryboardPackageImportDialog.tsx`, which is only the upload/import preview dialog and was intentionally not changed for this task.

## Status
- Added frontend-only grouped display mapping in `ShotGroupVideoSection.tsx`.
- Movement group reads `cameraMovement`/`camera_movement` and `movementReason`/`movement_reason` when present.
- Camera group reads `focalLength`, `dof`, `lens`, `angle`, and `cameraHeight` aliases from persisted item data or imported `cinematicPlan.shots` metadata.
- Notes group reads `lighting`, `colorTemperature`, and common shoot/technical note aliases.
- Backend generation, Prisma schema, and storyboard-package JSON schema were not changed.

## Validation
- `./node_modules/.bin/tsc --noEmit --pretty false` passed.
