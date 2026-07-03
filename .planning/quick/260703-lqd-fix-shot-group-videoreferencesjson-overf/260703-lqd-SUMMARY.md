# Quick Task 260703-lqd Summary — Fix shot group videoReferencesJson overflow

## Status

Completed on 2026-07-03.

## Root Cause

`NovelPromotionShotGroup.videoReferencesJson` was stored as MySQL `TEXT`, which caps the rich storyboard metadata snapshot at roughly 64KB. Imported storyboard packages can persist long cinematic plans and per-shot prompts, and the image worker later appends submitted model prompts into the same JSON snapshot. Long multi-shot segments could therefore fail after generation when Prisma attempted to update `videoReferencesJson`.

## Delivered

- Changed `NovelPromotionShotGroup.videoReferencesJson` from `@db.Text` to `@db.LongText`.
- Added a migration that widens the existing MySQL column to `LONGTEXT`.
- Added a focused schema regression test so the field is not accidentally narrowed again.

## Verification

- `npx vitest run tests/unit/prisma/shot-group-video-references-schema.test.ts` failed before the schema change and passed after it.
- `npx prisma validate`
- `npx vitest run tests/unit/worker/shot-group-image-task-handler.test.ts tests/unit/prisma/shot-group-video-references-schema.test.ts`
