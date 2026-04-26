# Quick Task 260427-0dt — Seedance 2.0 Content Items

## Goal
Let multi-shot video generation configure and submit Seedance reference materials for visual and audio consistency across video groups.

## Scope
- Add persisted multi-shot video reference settings.
- Let video-stage UI choose concept image, character images, scene/prop images, shot frame images, and character voice references.
- Build Ark/Seedance `contentItems` with image/audio references and prompt `@Image` / `@Audio` usage instructions.
- Preserve non-Ark fallback behavior.

## Validation
- TypeScript typecheck.
- Focused worker and UI unit tests.
- Focused lint on touched files.
