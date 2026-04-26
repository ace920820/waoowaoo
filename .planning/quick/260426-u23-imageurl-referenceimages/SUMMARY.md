# Quick Task 260426-u23 — imageUrl referenceImages Summary

## Result
Fixed multi-shot shot-group reference image generation so selected character/location/prop assets with missing draft `imageUrl` are hydrated from project asset records before calling the image generator.

## Changes
- `src/lib/workers/handlers/shot-group-image-task-handler.ts`: resolves missing asset image URLs for selected/preselected/script-derived/effective bindings before building `referenceImages`.
- `tests/unit/worker/shot-group-image-task-handler.test.ts`: adds regression coverage proving 李未, scene, and prop images enter `referenceImages` when draft metadata only has asset IDs.

## Validation
- `npx vitest run tests/unit/worker/shot-group-image-task-handler.test.ts`
- `npm run typecheck`
- `npm run lint -- src/lib/workers/handlers/shot-group-image-task-handler.ts tests/unit/worker/shot-group-image-task-handler.test.ts`

## Notes
- This fixes the pre-generation reference-image input chain only; it does not change model selection, prompt wording, or UI behavior.
