---
status: resolved
trigger: RemakeWorkbench renders IntlError MISSING_MESSAGE for remakeWorkbench.stages.storyboard / stages.video in zh locale
created: 2026-08-10
updated: 2026-08-10
---

# Debug: Remake Workbench Stages I18n

## Symptoms

- Expected: The five-stage navigation (overview / scenedetect / prompt / storyboard / video) renders labels in both locales.
- Actual: `t('stages.storyboard')` and `t('stages.video')` throw `IntlError: MISSING_MESSAGE` repeatedly in the console for locale `zh`.
- Reproduction: Open a remake project; the workbench nav maps `REMAKE_WORKBENCH_STAGES` and calls `t(\`stages.${item}\`)`.

## Current Focus

- hypothesis: The namespace loads (previous fix), but `stages` in both locale JSON files only defines overview/scenedetect/prompt.
- test: Read `messages/{zh,en}/remake-workbench.json` stages keys and compare with `REMAKE_WORKBENCH_STAGES`.
- expecting: storyboard and video keys missing from both files.
- next_action: none

## Evidence

- timestamp: 2026-08-10; `REMAKE_WORKBENCH_STAGES = ['overview','scenedetect','prompt','storyboard','video']` (RemakeWorkbench.tsx:15), while `stages` in zh/en JSON contains only overview/scenedetect/prompt.

## Resolution

- root_cause: The five-stage nav (`storyboard`, `video`) was added to `REMAKE_WORKBENCH_STAGES` without syncing the `stages` keys in `messages/zh/remake-workbench.json` and `messages/en/remake-workbench.json`.
- fix: Added `storyboard` (分镜 / Storyboard) and `video` (成片 / Video) to the `stages` object in both locale files; added a regression test asserting stage key coverage for both locales.
- verification: `vitest run tests/unit/i18n/remake-workbench-messages.test.ts` → 3/3 passed; targeted ESLint clean (JSON outside lint scope); typecheck unaffected (message-only change).
- files_changed: messages/zh/remake-workbench.json, messages/en/remake-workbench.json, tests/unit/i18n/remake-workbench-messages.test.ts
