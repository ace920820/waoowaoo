---
phase: 01-episode-mode-entry
plan: 01
subsystem: database
tags: [prisma, api, episode, production-mode]
requires: []
provides:
  - episode-level production mode persistence
  - legacy migration/backfill for episode mode
  - create/batch/PATCH API support for episodeProductionMode
affects: [workspace, script-view, episode-query]
tech-stack:
  added: []
  patterns: [episode-scoped persisted workflow selection]
key-files:
  created: [prisma/migrations/20260419120000_add_episode_production_mode/migration.sql]
  modified: [prisma/schema.prisma, src/app/api/novel-promotion/[projectId]/episodes/route.ts, src/app/api/novel-promotion/[projectId]/episodes/batch/route.ts, src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts]
key-decisions:
  - "Persist mode on NovelPromotionEpisode as episodeProductionMode"
  - "Default new episodes to multi_shot"
  - "Backfill legacy episodes to traditional only from storyboard/panel traces"
patterns-established:
  - "Episode production mode is validated at the route boundary against multi_shot|traditional"
requirements-completed: [MODE-01, MODE-02]
duration: 30min
completed: 2026-04-19
---

# Phase 01: Episode Mode Entry Summary

**Episode-level production mode persistence with conservative legacy backfill and validated create/update APIs**

## Accomplishments
- Added `episodeProductionMode` to [schema.prisma](/Users/jamiezhao/projects/waoowaoo/prisma/schema.prisma) with default `multi_shot`.
- Added [migration.sql](/Users/jamiezhao/projects/waoowaoo/prisma/migrations/20260419120000_add_episode_production_mode/migration.sql) to backfill legacy rows conservatively.
- Updated episode create, batch-create, and PATCH routes to carry validated mode values.

## Verification
- `npx prisma generate`
- `npx prisma validate`
- `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts`

## Notes
- No git commit was created in this execution pass.
- Legacy migration keeps shot-group-only episodes on `multi_shot`; only storyboard/panel traces backfill to `traditional`.
