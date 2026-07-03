# Quick Task 260703-lqd: Fix shot group videoReferencesJson overflow when storing long storyboard prompts

## Scope

Prevent imported multi-shot storyboard metadata and submitted generation prompts from exceeding the database capacity of `NovelPromotionShotGroup.videoReferencesJson`.

## Tasks

1. Add a schema-capacity regression
   - Files: `tests/unit/prisma/shot-group-video-references-schema.test.ts`
   - Action: Assert `videoReferencesJson` is backed by `LongText`, since it stores rich prompt/metadata snapshots.
   - Verify: Run the focused Vitest test and confirm it fails before the schema change.
   - Done: The guard catches the current `@db.Text` schema.

2. Widen the persisted column
   - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
   - Action: Change `videoReferencesJson` to `@db.LongText` and add a MySQL migration altering the existing column.
   - Verify: Focused schema test passes.
   - Done: Existing rich storyboard JSON can exceed 64KB without hitting MySQL `TEXT`.

3. Record outcome
   - Files: `.planning/quick/260703-lqd-fix-shot-group-videoreferencesjson-overf/260703-lqd-SUMMARY.md`, `.planning/STATE.md`
   - Action: Summarize change and append quick-task state.
   - Verify: Git diff only includes the scoped files plus expected planning artifacts.
