# Architecture

## Summary

The application is organized as a full-stack Next.js product with a thick domain layer in `src/lib/`, a large App Router UI in `src/app/`, and asynchronous job execution handled by BullMQ workers. The main product flow centers on turning source story content into structured assets, storyboard panels, voice, and final video outputs.

## Primary Architectural Shape

- UI and route handlers live in `src/app/`
- Shared reusable UI components live in `src/components/`
- Domain and service code live in `src/lib/`
- Specialized feature code lives in `src/features/`
- Background processing lives in `src/lib/workers/`
- Database schema and persistence model live in `prisma/`

This is not a thin-controller app. Much of the product logic is pushed into `src/lib/` modules rather than being kept inside pages or route handlers.

## Main Product Flow

The domain model in [prisma/schema.prisma](/Users/jamiezhao/projects/waoowaoo/prisma/schema.prisma) shows a core `NovelPromotionProject` with related episodes, clips, storyboards, panels, locations, characters, voice lines, shot groups, and video editor projects. That maps closely to the workspace route and stage system in [src/app/[locale]/workspace/[projectId]/page.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/page.tsx), which exposes stages such as `config`, `script`, `assets`, `storyboard`, `videos`, `voice`, and `editor`.

## Request / UI Layer

- Locale middleware wraps most non-API routes in [middleware.ts](/Users/jamiezhao/projects/waoowaoo/middleware.ts)
- Workspace and product screens live under `src/app/[locale]/...`
- The workspace page is a large client page that coordinates query hooks, URL state, and modal gating
- Query/mutation orchestration is centralized under `src/lib/query/hooks/` and `src/lib/query/mutations/`

## Service / Domain Layer

Key service-heavy areas include:

- `src/lib/novel-promotion/` for story/script/storyboard/video domain logic
- `src/lib/assets/` for asset hub and selection semantics
- `src/lib/media/` for media normalization and URL handling
- `src/lib/model-gateway/` for provider routing and compatibility
- `src/lib/run-runtime/` for workflow/run state, events, leases, recovery, and publishing
- `src/lib/billing/` for cost policy, runtime usage, and ledger behavior

## Async Execution Model

- Tasks are enqueued by task type into four BullMQ queues in [src/lib/task/queues.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/task/queues.ts)
- Worker bootstrap happens in [src/lib/workers/index.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/workers/index.ts)
- Shared worker lifecycle, billing, progress, event publishing, and failure handling are centralized in [src/lib/workers/shared.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/workers/shared.ts)
- Text/image/video/voice specific logic is split into worker files and many `src/lib/workers/handlers/*`

## Run Runtime Overlay

There is a second orchestration layer beyond raw tasks:

- Run records, steps, events, checkpoints, and artifacts are modeled in `src/lib/run-runtime/`
- Task SSE events can be mirrored into run events via `src/lib/run-runtime/task-bridge.ts`
- Workflow dependency resolution lives in `src/lib/workflow-engine/dependencies.ts`

This suggests the codebase is moving toward more explicit workflow graphs on top of legacy task queues.

## Data Access Pattern

- Prisma client singleton in [src/lib/prisma.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/prisma.ts)
- Route handlers and service modules call Prisma directly
- Rich JSON/text columns are used heavily in the schema for AI-generated payloads and evolving state

## Cross-Cutting Infrastructure

- Structured JSON logging with project-scoped file writing in `src/lib/logging/`
- Env/base URL helpers in `src/lib/env.ts`
- Storage abstraction in `src/lib/storage/`
- Auth/session and user preference management under `src/lib/auth.ts` and user API routes

## Architectural Pressure Points

- Very large `src/lib/` indicates the domain layer is broad and still accreting responsibilities
- Large client page files exist, especially in workspace flows
- Queue-based task orchestration and newer run-runtime orchestration coexist, increasing cognitive load
- Many domain entities encode nested JSON in text fields, which can accelerate iteration but complicate validation and migrations
