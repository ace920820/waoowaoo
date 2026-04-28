# Quick Summary: Storyboard Package Mapper Prompt Formatter

## Completed
- Compiled director-authored per-shot cinematic fields into visible imported prompts:
  - referencePromptText now includes emotional intent, visual strategy, and key visual anchors.
  - compositePromptText now includes a full director shot table.
  - videoPrompt now includes a full director video execution table.
- Enriched shot group item prompts with shotId, duration, dramatic beat, information unit, purpose, blocking, shot size, lens, dof, angle, movement, composition, lighting, edit, and image prompt.
- Expanded final prompt formatter to consume object emotionalIntent plus durationSec/lens/dof/edit/purpose/informationUnit/dramaticBeat/shotId.
- Preserved original imported prompts under cinematicPlan.importedRawPrompts for fallback/audit.

## Validation
- `npx vitest run tests/unit/novel-promotion/storyboard-package/storyboard-package-mapper.test.ts tests/unit/worker/shot-group-video-config.test.ts tests/unit/worker/shot-group-image-task-handler.test.ts tests/unit/worker/video-worker.test.ts`
- `npm run typecheck`
- Manual mapper check against `/Volumes/KINGSTON/剧本创作/小样测试/测试C_v1.4_AI替我做PPT_55秒2D动画喜剧_Waoo导入版.md` confirmed C14_SEG_003 visible prompts include WS/28mm/dof/static/composition/lighting/edit/purpose per-shot details.

## Risks
- Already-imported shot groups need re-import to get enriched visible prompts and item prompts.
- Prompt length grows with shot count; current scope intentionally does not add truncation or UI collapse behavior.
