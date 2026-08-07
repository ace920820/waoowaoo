---
status: resolved
trigger: RemakeWorkbench renders IntlError MISSING_MESSAGE for remakeWorkbench in zh locale
created: 2026-08-08
updated: 2026-08-08
---

# Debug: Remake Workbench I18n

## Symptoms

- Expected: A remake project renders the Chinese workbench labels.
- Actual: `useTranslations('remakeWorkbench')` reports `MISSING_MESSAGE`.
- Reproduction: Open a remake project in the `zh` locale.

## Current Focus

- hypothesis: `src/i18n.ts` does not load `messages/{locale}/remake-workbench.json`.
- test: Add a loader regression that requires both locale imports and the returned namespace.
- expecting: The test fails before the loader is updated.
- next_action: none

## Evidence

- timestamp: 2026-08-08; Both locale JSON files define `remakeWorkbench`, while `src/i18n.ts` omits that import and namespace.

## Resolution

- root_cause: `src/i18n.ts` omitted the dynamic import and returned namespace for `remake-workbench.json`.
- fix: Added the locale message module to `Promise.all` and exposed it as `messages.remakeWorkbench`.
- verification: Focused i18n and workbench entry tests passed; targeted ESLint and `npm run typecheck` passed.
- files_changed: src/i18n.ts, tests/unit/i18n/remake-workbench-messages.test.ts
