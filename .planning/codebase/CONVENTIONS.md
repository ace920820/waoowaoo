# Conventions

## Language And Module Style

- TypeScript is the default across app, lib, and tests
- Imports use the `@/` alias for `src/`
- Files often use single quotes, semicolon-light style, and explicit type imports
- Strict TypeScript mode is enabled in [tsconfig.json](/Users/jamiezhao/projects/waoowaoo/tsconfig.json)

## Naming Patterns

- Route handlers use `route.ts`
- Hook files start with `use...`
- React components are PascalCase
- Domain helpers frequently use descriptive suffixes such as:
  - `...runtime.ts`
  - `...helpers.ts`
  - `...mutations.ts`
  - `...guard.mjs`
  - `...service.ts`

## Logging Convention

- Prefer structured logging through `src/lib/logging/core.ts`
- The codebase uses `_ulogInfo`, `_ulogError`, `_ulogDebug`, and scoped logger helpers rather than raw `console.log` in application code
- Log output is JSON and redacted via `src/lib/logging/redact.ts`
- Project-specific logs can be written to per-project files in `src/lib/logging/file-writer.ts`

## Architectural Guardrails

The repo has many custom guard scripts in `scripts/guards/`, including checks for:

- no direct API route LLM calls
- no provider guessing
- no model key downgrade
- no multiple sources of truth
- route/test coverage alignment
- prompt i18n and regression contracts
- task loading and compensation invariants

These scripts indicate a strong convention of encoding architectural rules as executable checks, not just docs.

## Auth / Config Patterns

- Auth is centralized in [src/lib/auth.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/auth.ts)
- Model/provider configuration is centralized in [src/lib/api-config.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/api-config.ts)
- The project strongly discourages inference-based provider resolution and silent fallbacks

## Data And State Conventions

- Prisma models use UUID string IDs
- Rich AI state is often serialized into `String @db.Text` fields rather than deeply normalized relational tables
- URL/search params are used as a source of truth for some workspace UI state instead of mirroring to DB
- Query hooks and mutation modules under `src/lib/query/` centralize client-server sync

## Error Handling Patterns

- Domain-specific error helpers exist in `src/lib/errors/`, `src/lib/error-utils.ts`, `src/lib/api-errors.ts`, and `src/lib/prisma-error.ts`
- Worker code normalizes errors before publishing task/run events
- Retry behavior is explicit in queue config and runtime services rather than hidden in ad hoc retry loops

## Commit / Local Verification Conventions

- Husky pre-commit runs `npm run verify:commit`
- Husky pre-push runs `npm run verify:push`
- `verify:commit` and `verify:push` chain lint, typecheck, tests, and optionally build

## Exceptions / Looser Areas

- Diagnostic and migration scripts under `scripts/` still use `console.log`, which appears intentional for CLI/operator ergonomics
- Some files include Chinese comments and messages; the repo is bilingual in both UI and developer-facing context
- There are occasional ESLint suppressions and a few `any` usages, but they appear localized rather than pervasive
