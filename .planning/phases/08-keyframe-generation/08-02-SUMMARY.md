---
phase: 08-keyframe-generation
plan: 02
subsystem: api
tags: [remake, keyframes, image-queue, worker, prisma]
requires:
  - phase: 08-01
    provides: immutable keyframe persistence and action-sheet contracts
provides:
  - authenticated Remake keyframe image submission and existing image-worker execution
  - selected-slot, immutable history, and explicit candidate-adoption APIs
  - confirmed-revision action-sheet queue dispatch
affects: [08-03, 08-04, phase-09-video-generation]
actuals:
  tokens: 13155
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [frozen server-owned keyframe task descriptors, image-queue action-sheet delegation]
key-files:
  created:
    - src/lib/remake-projects/keyframes/service.ts
    - src/lib/workers/handlers/remake-keyframe-image.ts
    - src/lib/workers/handlers/remake-keyframe-action-sheet.ts
  modified:
    - src/lib/remake-projects/scenedetect/mutations.ts
    - src/app/api/remake-projects/[projectId]/keyframes/route.ts
    - src/app/api/remake-projects/[projectId]/keyframes/tracks/[trackId]/route.ts
key-decisions:
  - "Freeze generation descriptors from authorized current Shot, selection, adopted Prompt, and capability facts."
  - "Use the existing image queue for both generated keyframes and deterministic action-sheet persistence."
requirements-completed: [KFRM-01, KFRM-02, KFRM-03, KFRM-04, KFRM-05, KFRM-06, KFRM-07]
coverage:
  - id: D1
    description: Authenticated selected-slot image generation is submitted through the existing image queue and worker.
    requirement: KFRM-01
    verification:
      - kind: integration
        ref: tests/integration/api/remake-projects-keyframes.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/worker/remake-keyframe-image.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Selection, immutable batch history, and explicit candidate adoption remain server-authoritative.
    requirement: KFRM-03
    verification:
      - kind: integration
        ref: tests/integration/remake-projects/keyframe-service.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/api/remake-projects-keyframes-tracks.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Confirmed Shot revisions enqueue a deduplicated action-sheet Task on the image queue.
    requirement: KFRM-06
    verification:
      - kind: integration
        ref: tests/integration/remake-projects/keyframe-action-sheet-worker.test.ts
        status: pass
    human_judgment: false
duration: 24min
completed: 2026-08-10
status: complete
---

# Phase 08 Plan 02: Keyframe Generation Integration Summary

**Server-authoritative Remake keyframe generation, immutable candidate history, explicit adoption, and image-queue action-sheet execution.**

## Accomplishments

- Added authenticated, frozen Start/Middle/End generation submission through the existing Task, image queue, worker, storage, and capability-resolution paths.
- Added current-revision selection, immutable batch/history reads, and explicit transactional candidate adoption.
- Registered a deterministic action-sheet Task on the image queue and enqueue it for confirmed revisions with revision/fingerprint deduplication.

## Task Commits

1. Task 1: `9428605` - route Remake keyframe generation through the image worker.
2. Task 2: `5125b79` - add Remake keyframe selection and adoption history.
3. Task 3: `77d701c` - execute action sheets on the image queue.
4. Follow-up: `45664ea` - resolve selected reference media through storage.

## Verification

- Passed: focused keyframe API, service, track-route, image-worker, action-sheet renderer, and action-sheet-worker suites (13 assertions across 6 files).
- Passed: `npm run typecheck`, `npm run check:api-handler`, `npm run check:test-tasktype-coverage`, and `npm run check:no-media-provider-bypass`.
- Failed outside this plan's scope: `check:config-center-guards` reports four existing `modelId` downgrade violations in `src/lib/workers/video.worker.ts`.
- Failed outside this plan's scope: `tests/integration/api/remake-projects-scenedetect-mutations.test.ts` lacks the Plan 08-01 `remakeOutputVersion.findMany` fixture used by invalidation.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Missing Critical] Added Task intent and catalog ownership for both new Remake image Task types.
- Found during: Tasks 1 and 3.
- Fix: Registered each TaskType in the exhaustive intent and coverage registries required by the repository guard.
- Verification: `npm run check:test-tasktype-coverage` passes with 49 Task types.

2. [Rule 2 - Missing Critical] Resolved selected reference-media IDs to signed storage URLs before worker normalization.
- Found during: Task 1 follow-up.
- Fix: Reject unresolved media IDs and pass only signed storage URLs to the existing image-generation path.
- Verification: focused worker suite passes.

## Next Phase Readiness

Phase 8 UI and Phase 9 can consume server-owned selected slots, ordered batch candidates, adopted pointers, and action-sheet Task state. The two unrelated verification failures above should be repaired before a repository-wide green gate is required.

## Self-Check: PASSED

- Confirmed all four commits exist in git history.
- Confirmed the keyframe service, both worker handlers, and both API route surfaces exist.
