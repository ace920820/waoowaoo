---
status: resolved
trigger: "翻拍项目详情页错误触发小说推广自动创建剧集，导致 Novel promotion data not found"
created: 2026-08-07
updated: 2026-08-07
---

# Debug: Remake Project Episode Guard

## Current Focus

- hypothesis: Confirmed. The shared project detail page applied novel-promotion initialization effects before its remake render branch.
- next_action: Resolved.

## Evidence

- `shouldAutoCreateEpisode` only checks empty episodes and import status.
- `isInitializing` treats every project without `novelPromotionData` as loading.
- RED: `remake-workbench-entry.test.ts` failed until the remake guard existed.

## Resolution

- root_cause: The legacy novel-promotion initialization logic had no project-type guard.
- fix: Added `isRemakeProject`; automatic episode creation and the `novelPromotionData` loading gate now run only for non-remake projects.
- verification: 8 focused tests passed, targeted ESLint passed, and `npm run typecheck` passed.
- files_changed: `src/app/[locale]/workspace/[projectId]/page.tsx`, `tests/unit/remake-projects/remake-workbench-entry.test.ts`
