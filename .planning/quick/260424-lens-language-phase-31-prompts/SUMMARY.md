# Quick Summary — Lens Language Phase 03.1 Prompts

## Outcome

Completed. Phase 03.1 prompt flow now explicitly incorporates the professional lens-language report from `data/镜头语言.md`.

## Changed

- `lib/prompts/novel-promotion/multi_shot_segmentation.zh.txt`
- `lib/prompts/novel-promotion/multi_shot_segmentation.en.txt`
- `src/lib/shot-group/prompt.ts`
- `tests/integration/api/specific/novel-promotion-generate-shot-group-image-assets.test.ts`
- `tests/unit/worker/shot-group-video-config.test.ts`
- `.planning/phases/03.1-multi-shot-cinematic-prompting/03.1-01-SUMMARY.md`
- `.planning/phases/03.1-multi-shot-cinematic-prompting/03.1-03-SUMMARY.md`
- `.planning/phases/03.1-multi-shot-cinematic-prompting/03.1-VERIFICATION.md`
- `.planning/STATE.md`

## Details

- Added upstream segmentation guidance for shot-size psychology, angle psychology, camera movement, composition, lighting, blocking, 180-degree rule, scene-pattern choices, and prompt-quality cautions.
- Added downstream `Lens-language discipline` / `镜头语言纪律` directives to reference image, storyboard composite, and video prompt builders.
- Kept the report distilled into prompt text because the LLM runtime cannot read local project files directly.
- Preserved existing provider, worker, asset, mood, dialogue, and reference mode behavior.

## Validation

- `npx vitest run tests/integration/api/specific/novel-promotion-generate-shot-group-image-assets.test.ts tests/unit/worker/shot-group-video-config.test.ts`

## Risk

- Still needs real generation sample review to tune whether these stronger constraints improve visual/video output without over-constraining the model.
