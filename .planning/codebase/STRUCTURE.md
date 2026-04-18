# Structure

## Top-Level Layout

- `src/app/` - Next.js App Router pages and API handlers
- `src/components/` - shared UI components
- `src/features/` - higher-level feature modules, especially video editor
- `src/lib/` - primary domain, service, runtime, infra, and integration code
- `src/i18n/` - locale routing/navigation wiring
- `src/styles/` - styling support
- `prisma/` - Prisma schemas
- `tests/` - unit, integration, system, regression, contracts, helpers
- `scripts/` - diagnostics, migrations, guards, and ops scripts
- `public/` and `images/` - static assets

## App Router Areas

- `src/app/[locale]/auth/` - auth screens
- `src/app/[locale]/home/` - home/dashboard surfaces
- `src/app/[locale]/workspace/` - main product workspace
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/` - core product UI for script, storyboard, voice, video, and related runtime hooks
- `src/app/api/` - broad REST-like API surface with roughly 147 route handlers
- `src/app/m/[publicId]/` - media/public asset pathing

## Important Domain Directories

- `src/lib/novel-promotion/` - story-to-script, storyboard, panel, stage runtime logic
- `src/lib/assets/` - asset hub domain and asset selection/state helpers
- `src/lib/task/` - task types, queueing, presentation, publisher/service logic
- `src/lib/run-runtime/` - graph-like run orchestration and recovery
- `src/lib/workers/` - async processors and handlers
- `src/lib/model-gateway/` - provider routing and OpenAI-compatible adaptation
- `src/lib/providers/` - provider-specific integrations
- `src/lib/storage/` - storage abstraction and provider implementations
- `src/lib/query/` - React Query keys, hooks, and mutation orchestration
- `src/lib/billing/` - usage accounting, policy, and ledger logic

## Feature-Specific Areas

- `src/features/video-editor/` - Remotion-based editing/playback surface
- `src/components/assistant/` and `src/lib/assistant-platform/` - assistant/runtime platform concepts
- `src/components/shared/assets/` and `src/app/api/asset-hub/` - asset hub UI and endpoints

## Testing Layout

- `tests/unit/` - broad unit test coverage by subsystem
- `tests/integration/api/` - API integration/contract tests
- `tests/integration/provider/` - provider integration behavior
- `tests/integration/task/` and `tests/integration/run-runtime/` - async/runtime coverage
- `tests/system/` - broader scenario tests
- `tests/regression/` - regression-focused cases
- `tests/contracts/` - requirements matrix and coverage integrity checks
- `tests/helpers/` and `tests/setup/` - fixtures, env bootstrapping, fakes

## Script Layout

- `scripts/guards/` - repository guardrails enforcing invariants
- `scripts/migrations/` - targeted data/config migrations
- `scripts/` root - diagnostics, media utilities, billing reconciliation, watchdog, Bull Board bootstrap, and ad hoc operational helpers

## Naming And File Patterns

- App Router handlers consistently use `route.ts`
- Tests primarily use `*.test.ts`
- Many runtime helper modules use descriptive suffixes like `-runtime.ts`, `-helpers.ts`, `-mutations.ts`, `-guard.mjs`
- Alias `@/` maps to `src/` via [tsconfig.json](/Users/jamiezhao/projects/waoowaoo/tsconfig.json)

## Scale Signals

- `src/lib/` is the largest subtree in the repo
- `src/app/` is nearly as large, indicating substantial UI plus API surface
- `src/components/` is relatively smaller than `src/lib/`, reinforcing that business logic is domain/service heavy

## Suggested Orientation Path

For onboarding, the most effective path is:

1. Read [README.md](/Users/jamiezhao/projects/waoowaoo/README.md)
2. Inspect [src/app/[locale]/workspace/[projectId]/page.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/page.tsx)
3. Read [prisma/schema.prisma](/Users/jamiezhao/projects/waoowaoo/prisma/schema.prisma)
4. Inspect [src/lib/task/queues.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/task/queues.ts) and [src/lib/workers/shared.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/workers/shared.ts)
5. Follow the relevant subsystem in `src/lib/novel-promotion/`, `src/lib/assets/`, or `src/lib/model-gateway/`
