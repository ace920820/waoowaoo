# Quick Plan: Shot Group Reference Image Model

## Goal
Add a project-level `shotGroupReferenceImageModel` setting so auxiliary reference image generation can use a different image model from storyboard board generation.

## Scope
- Persist `shotGroupReferenceImageModel` on `NovelPromotionProject`.
- Add the field to project config UI under model parameters.
- Use `shotGroupReferenceImageModel` for `targetField=reference`, falling back to `storyboardModel` when unset.
- Keep `targetField=composite` storyboard board generation on existing `storyboardModel`.
- Add focused API/worker regressions.
