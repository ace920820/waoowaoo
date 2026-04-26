# Quick Task 260426-u23 — imageUrl referenceImages

## Goal
Ensure multi-shot auxiliary reference image generation hydrates selected character/location/prop asset image URLs before generation, so selected assets such as 李未 are always included in `referenceImages`.

## Boundary
- Fix pre-generation asset reference hydration for shot group image generation.
- Add focused tests proving a character asset with missing metadata `imageUrl` is resolved into provider reference images.
- Do not change cinematic prompts, model selection, or unrelated UI flows.

## Progressive Disclosure
1. Use searches and existing planning notes to identify candidate files.
2. First source read is limited to worker image handler, draft metadata resolver, and related tests.
3. Expand only if imports/call chains/tests require it.

## Validation
- Run focused unit test for shot group image task handler.
- Run typecheck if changes touch exported types.
