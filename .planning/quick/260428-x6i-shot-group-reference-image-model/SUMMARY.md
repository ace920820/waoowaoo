# Quick Summary: Shot Group Reference Image Model

## Completed
- Added `shotGroupReferenceImageModel` to Prisma schema and migration.
- Added project config UI field “辅助参考图模型” / “Shot Group Reference Image Model”.
- Wired project PATCH/select/snapshot flow for the new field.
- Updated shot-group image route and worker selection so auxiliary reference images use the new model with fallback to `storyboardModel`.
- Confirmed storyboard board generation still uses `storyboardModel`.

## Validation
- `npx prisma generate`
- `npx vitest run tests/integration/api/specific/novel-promotion-generate-shot-group-image-assets.test.ts tests/unit/worker/shot-group-image-task-handler.test.ts`
- `npm run typecheck`
