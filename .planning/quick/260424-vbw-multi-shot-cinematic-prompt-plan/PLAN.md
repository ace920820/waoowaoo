# Quick Task Plan: Multi-Shot Cinematic Prompt Plan

## Goal
Design a production-ready prompt/data plan for upgrading multi-shot script-to-storyboard output from one shared `narrativePrompt` into specialized cinematic prompts for concept reference images, storyboard boards, and final multi-shot video generation.

## Task Boundary
- Planning/design only; no business source code changes in this quick task.
- Focus on the multi-shot `Script->Storyboard` LLM step and its downstream fields: `辅助参考图提示词`, `剧情内容`, and video prompt seeds.
- Preserve backward compatibility with existing `narrativePrompt`, `embeddedDialogue`, `shotRhythmGuidance`, and `expectedShotCount` output.

## Evidence Files Read
- `lib/prompts/novel-promotion/multi_shot_segmentation.zh.txt`
- `src/lib/workers/handlers/script-to-storyboard-multi-shot.ts`
- `src/lib/novel-promotion/multi-shot/persist-drafts.ts`
- `src/lib/shot-group/prompt.ts`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx`

## Write Set
- `.planning/quick/260424-vbw-multi-shot-cinematic-prompt-plan/PLAN.md`
- `.planning/quick/260424-vbw-multi-shot-cinematic-prompt-plan/MULTI-SHOT-CINEMATIC-PROMPT-PLAN.md`
- `.planning/quick/260424-vbw-multi-shot-cinematic-prompt-plan/SUMMARY.md`
- `.planning/STATE.md`

## Steps
1. Document current LLM prompt and persistence flow.
2. Define upgraded cinematic segment schema.
3. Define prompt derivation strategy for reference, storyboard, and video.
4. Outline implementation phases and compatibility rules.
5. Record next-step recommendation in project state.
