# Testing

## Summary

The repository has a large and intentionally layered test suite. Coverage is not just unit/integration based; it also includes contracts, regressions, system flows, and repository guard scripts that enforce architectural invariants.

## Main Test Framework

- Test runner: Vitest in [vitest.config.ts](/Users/jamiezhao/projects/waoowaoo/vitest.config.ts)
- Environment: `node`
- Setup files:
  - `tests/setup/env.ts`
  - `tests/setup/global-setup.ts`
- Coverage baseline config also exists in `vitest.core-coverage.config.ts`

## Test Layout

- `tests/unit/` - subsystem-focused unit tests
- `tests/integration/api/` - route and contract integration coverage
- `tests/integration/provider/` - provider behavior coverage
- `tests/integration/chain/` - chained flow behavior
- `tests/integration/task/` - async task flow coverage
- `tests/integration/run-runtime/` - workflow/run runtime coverage
- `tests/system/` - broader system scenarios
- `tests/regression/` - bug/regression prevention cases
- `tests/concurrency/billing/` - concurrency-sensitive billing behavior
- `tests/contracts/` - requirements matrix and integrity enforcement

## Scale Signals

- Roughly 291 `*.test.ts` files exist in the repo
- There are dedicated helper and fake layers in `tests/helpers/` and `tests/helpers/fakes/`
- Test layout mirrors domain boundaries closely, which makes it easier to find relevant coverage by subsystem

## Bootstrap And Infra Strategy

- `tests/setup/global-setup.ts` can bootstrap Dockerized MySQL and Redis for integration/system runs
- Prisma schema push is part of test bootstrap for relevant suites
- Bootstrapping is controlled by env flags like `BILLING_TEST_BOOTSTRAP` and `SYSTEM_TEST_BOOTSTRAP`

## Contract / Meta Testing

- `tests/contracts/requirements-matrix.test.ts` validates requirement IDs and verifies declared test file references exist
- Guard scripts in `scripts/guards/` act as additional quality gates outside Vitest
- `test:guards` and `check:*` scripts enforce repository rules that ordinary unit tests would miss

## Important NPM Test Commands

- `npm run test:unit:all`
- `npm run test:integration:api`
- `npm run test:integration:provider`
- `npm run test:integration:chain`
- `npm run test:integration:task`
- `npm run test:system`
- `npm run test:regression:cases`
- `npm run test:all`
- `npm run verify:commit`
- `npm run verify:push`

## Coverage Philosophy

- Coverage is selective in some configs; for example billing-focused coverage thresholds are defined in [vitest.config.ts](/Users/jamiezhao/projects/waoowaoo/vitest.config.ts)
- The repository appears to favor behavior and invariant coverage over a single blanket percent target
- Specialized guards exist for route coverage, task-type coverage, changed-file impact, and behavior quality

## Practical Testing Notes

- Some suites need Docker services and are slower/heavier than pure unit tests
- Local hooks are strict, so contributors should expect lint/typecheck/test gates before commit and push
- Because the app spans UI, route handlers, workers, providers, billing, and workflow runtime, focused subsystem test commands are useful before attempting `test:all`
