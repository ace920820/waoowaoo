# Concerns

## Summary

The codebase is ambitious and already has meaningful internal guardrails, but it is also large, fast-moving, and operationally dense. The main risks are complexity concentration, dual orchestration models, operational defaults that should never leak into production, and the maintenance burden of a wide provider/API surface.

## Complexity Concentration

- `src/lib/` is extremely large and appears to contain most domain, infra, runtime, and integration logic
- `src/app/[locale]/workspace/[projectId]/page.tsx` is a large client entrypoint coordinating many concerns
- Novel-promotion workspace code is spread across many hooks, components, and service modules, making end-to-end changes costly to reason about

## Dual Orchestration Models

- Legacy/primary task queue flow lives under `src/lib/task/` plus `src/lib/workers/`
- Newer run/workflow runtime lives under `src/lib/run-runtime/` and `src/lib/workflow-engine/`
- `src/lib/workers/shared.ts` bridges task events into run events, which is powerful but adds transitional complexity
- Risk: duplicated concepts, drift between task state and run state, and harder debugging when failures cross both systems

## Data Modeling Tradeoffs

- Many Prisma models store AI-derived structures in large text fields instead of normalized tables
- This speeds iteration, but makes schema guarantees, partial updates, and queryability harder
- The presence of migration/repair scripts suggests the team already pays some of this maintenance cost

## Operational / Security Risks

- [.env.example](/Users/jamiezhao/projects/waoowaoo/.env.example) and [docker-compose.yml](/Users/jamiezhao/projects/waoowaoo/docker-compose.yml) contain obvious placeholder/default secrets; fine for local bootstrap, risky if copied unchanged into shared environments
- `trustHost: true` in [src/lib/auth.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/auth.ts) is pragmatic for LAN/dev use, but deserves careful review in internet-facing deployments
- API/provider configuration is sensitive and broad; a bug there can affect billing, provider routing, or model correctness globally

## Test / Release Weight

- Pre-commit and pre-push hooks are intentionally strict
- Full verification is likely expensive because it chains lint, typecheck, many test suites, and build
- Risk: contributors may avoid full local verification or rely on partial subsets, especially during rapid iteration

## Guardrail Maintenance Cost

- The repo has many custom guard scripts, which is a strength
- It also means architectural intent is partially encoded in a large, growing set of bespoke checks
- Risk: when guards become stale or too noisy, teams may work around them rather than improve them

## Provider Surface Area

- Multiple provider families are supported, plus compatibility routing
- Storage also supports multiple backends
- Risk: combinatorial bugs around capability mismatches, signed URLs, protocol differences, and per-provider edge cases

## Signs Of Ongoing Cleanup

- Scripts like `cleanup-remove-legacy-voice-data.ts`, multiple migrations, and media/backfill tools suggest active refactoring
- Presence of `schema.sqlit.prisma` alongside the main MySQL schema suggests alternate or legacy test/dev paths that could drift
- Diagnostic scripts and regression tests imply the team is actively patching real production-grade issues

## Where To Be Most Careful

- `src/lib/api-config.ts`
- `src/lib/model-gateway/`
- `src/lib/task/`, `src/lib/workers/`, and `src/lib/run-runtime/`
- workspace stage runtime code under `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/`
- media URL/storage normalization paths under `src/lib/media/` and `src/lib/storage/`
