# Quick Plan: Storyboard Package Mapper Prompt Formatter

## Goal
Import director-authored storyboard packages so visible review/video prompts and final model prompts include complete per-shot cinematic details without changing the database schema.

## Write Set
- `src/lib/novel-promotion/storyboard-package/mapper.ts`
- `src/lib/shot-group/prompt.ts`
- `tests/unit/novel-promotion/storyboard-package/storyboard-package-mapper.test.ts`
- `tests/unit/worker/shot-group-image-task-handler.test.ts`
- `tests/unit/worker/video-worker.test.ts`
- `.planning/quick/260428-sy7-storyboard-package-mapper-prompt-formatt/*`
- `.planning/STATE.md`

## Steps
1. Add reusable shot detail formatter in storyboard package mapper.
2. Compile director shot fields into visible reference/composite/video prompts and item prompts.
3. Expand final prompt formatter to consume durationSec, lens, dof, edit, purpose, etc.
4. Add focused mapper and final prompt regression tests.
5. Run targeted tests and typecheck.
