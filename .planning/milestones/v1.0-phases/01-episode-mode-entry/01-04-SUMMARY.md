---
phase: 01-episode-mode-entry
plan: 04
subsystem: api
tags: [react-query, typescript, workspace, episode]
requires:
  - phase: 01-01
    provides: persisted episodeProductionMode field
provides:
  - typed episodeProductionMode query contracts
  - workspace stage access to episode mode
affects: [script-view, runtime, confirmation]
tech-stack:
  added: []
  patterns: [server-backed episode state threaded through workspace hooks]
key-files:
  created: []
  modified: [src/lib/query/hooks/useProjectData.ts, src/types/project.ts, src/app/[locale]/workspace/[projectId]/page.tsx, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/types.ts, src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts]
key-decisions:
  - "Use one episode-backed source of truth instead of local mode mirrors"
patterns-established:
  - "Workspace stage hooks expose episodeProductionMode directly from episode data"
requirements-completed: [MODE-01]
duration: 12min
completed: 2026-04-19
---

# Phase 01: Episode Mode Entry Summary

**Workspace query contracts now expose episodeProductionMode end-to-end for episode-scoped UI and runtime decisions**

## Accomplishments
- Extended shared episode and project types with `episodeProductionMode`.
- Threaded the field through page-level episode summaries and workspace episode props.
- Exposed `episodeProductionMode` from [useWorkspaceEpisodeStageData.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts).

## Verification
- Covered by `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts`
- `npm run typecheck` no longer reports new errors from these files

## Notes
- Remaining `typecheck` failures are pre-existing `fetch.preconnect` test typing issues outside this phase.
