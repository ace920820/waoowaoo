# Phase 2: Multi-Shot Fast Path - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns `多镜头片段模式` into a real fast path after the script page decision has already been made in Phase 1. The scope is to auto-create production-ready multi-shot segment drafts for the current episode, route users through a dedicated multi-shot reference-confirmation step, and preserve traditional mode compatibility without reintroducing the legacy verbose storyboard-script hop as the default path.

</domain>

<decisions>
## Implementation Decisions

### Fast-path trigger behavior
- **D-01:** In `multi_shot` mode, clicking `确认并开始绘制` must auto-generate the current episode's multi-shot segment drafts instead of only jumping to the existing video page.
- **D-02:** The system should treat one episode as roughly `2 minutes`, or about `8` multi-shot segments of `15s` each, while still allowing the actual segment set to reflect the script-page clip structure.
- **D-03:** Each `15s` segment is the minimum video-generation unit and maps to one multi-shot video output.
- **D-04:** The fast path stops after draft creation plus reference-confirmation entry; it must not auto-complete final video generation without user confirmation of storyboard/reference inputs.

### Segment draft payload
- **D-05:** For each `15s` segment, the system generates a standard production payload containing: segment order, segment title, scene label, narrative prompt, embedded dialogue, and suggested shot-rhythm guidance.
- **D-06:** The generated narrative prompt should read like a model-ready multi-shot production prompt with motion, framing, emotion, and progression baked in, rather than a traditional verbose storyboard script.
- **D-07:** Embedded dialogue should be written directly into the action progression so the timing of speech relative to movement or camera beats is easy to control later.
- **D-08:** Suggested shot-rhythm guidance should stay compact and production-oriented; it should not expand back into a full traditional shot-by-shot screenplay.

### Page flow and navigation
- **D-09:** The multi-shot fast path should become: `script -> multi-shot storyboard/reference confirmation -> videos`.
- **D-10:** Multi-shot mode should use a dedicated multi-shot storyboard/reference confirmation experience rather than falling back to the traditional storyboard mental model by default.
- **D-11:** From the video stage in multi-shot mode, the back action should return to the multi-shot storyboard/reference confirmation step, not to the traditional storyboard stage.
- **D-12:** The reference-confirmation step is where users review the auto-generated segment drafts and manually generate or upload the reference board/image needed for each segment before video generation.

### Failure and partial-result strategy
- **D-13:** When auto-generating the episode's segment drafts, the system should still create the expected segment slots even if some segments fail to generate content.
- **D-14:** Failed segments should appear as empty or incomplete placeholders that users can identify and repair later, rather than causing the whole episode draft creation to roll back.

### Traditional compatibility and scope guard
- **D-15:** Traditional mode continues to use the existing classic chain and retains current storyboard-related capabilities.
- **D-16:** This phase does not include asset-library injection into multi-shot references or advanced omnireference inputs; those remain deferred to later phases.

### the agent's Discretion
- Exact naming of the new intermediate stage, as long as it clearly communicates that this is the multi-shot reference-confirmation step
- Exact microcopy for partially failed segments and placeholder states
- Whether the multi-shot confirmation UI is implemented as a dedicated variant of the existing storyboard stage or as a new stage component, as long as the user-facing flow matches the locked decisions above

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` — Phase 2 goal, mapped requirements, and success criteria for the real multi-shot fast path
- `.planning/PROJECT.md` — Product intent, episode sizing assumptions, and out-of-scope boundaries for this milestone
- `.planning/REQUIREMENTS.md` — Source requirements for Phase 2: MODE-03, TRAD-01, TRAD-02, MSHT-01, MSHT-02, MSHT-03, MSHT-04, MSHT-05, MSHT-06, SHOT-01, UI-02
- `.planning/STATE.md` — Current milestone focus and already locked assumptions carried from Phase 1
- `.planning/phases/01-episode-mode-entry/01-CONTEXT.md` — Prior phase decisions that define mode placement, defaulting, and pre-launch CTA behavior

### Existing workflow runtime and stage routing
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts` — Current mode-aware launch branching; today `multi_shot` only jumps to `videos`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts` — Episode-scoped access to clips, storyboards, shot groups, and production mode
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/StoryboardStage.tsx` — Current storyboard stage shell and `script -> storyboard -> videos` navigation
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx` — Current video-stage entry and back-navigation behavior, which still routes back to `storyboard`

### Existing multi-shot production UI
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx` — Current multi-shot video workflow, draft creation, composite reference upload, and generation actions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useWorkspaceStageRuntime.ts` already owns the launch decision behind `确认并开始绘制`, making it the core runtime integration point for turning `multi_shot` into an actual auto-draft flow.
- `useWorkspaceEpisodeStageData.ts` already exposes `clips`, `storyboards`, and `shotGroups` at the episode level, which matches the requirement to generate drafts per episode and per segment.
- `StoryboardStage.tsx` already provides a middle-stage shell with `onBack` and `onNext`, which could be adapted or specialized for the new multi-shot reference-confirmation step.
- `ShotGroupVideoSection.tsx` already contains the current multi-shot draft object model, reference upload handling, and generation affordances, so it is the clearest existing surface to evolve rather than replacing the whole downstream stack.

### Established Patterns
- Stage movement is currently controlled through explicit runtime `handleStageChange(...)` calls, so the new fast path should preserve that explicit stage-driven navigation model.
- The workspace already distinguishes episode-scoped data instead of project-global state for clips and shot groups, which fits the product requirement that all mode behavior is configured and executed per episode.
- Existing multi-shot generation expects a composite/reference image before submission, which aligns with the new decision that reference confirmation remains a manual checkpoint even on the fast path.

### Integration Points
- The main fast-path change starts where `onRunScriptToStoryboard` currently branches on `episodeProductionMode`.
- The current storyboard stage and current video stage both need mode-aware navigation so the multi-shot path no longer feels like a disguised traditional flow.
- The current multi-shot video area assumes users manually create shot groups; Phase 2 planning must decide how auto-generated segment drafts map into that existing shot-group model without reintroducing a redundant traditional storyboard-script layer.

</code_context>

<specifics>
## Specific Ideas

- The user wants the system to auto-create the whole episode's multi-shot segment draft set first, but still requires a human confirmation step for storyboard/reference imagery before actual video generation.
- One episode should be thought of as about `8` segments of `15s`, and each `15s` segment can contain up to `9` shots.
- The user wants prompt outputs in the style of detailed cinematic multi-shot descriptions, similar to the provided examples, not short labels and not legacy storyboard-script prose.
- Dialogue should be embedded into the prompt flow itself so users can control when lines happen relative to movement and camera beats.
- Multi-shot mode should feel like its own direct production path, not a relabeled detour through traditional storyboard navigation.

</specifics>

<deferred>
## Deferred Ideas

- Injecting character / prop / scene assets into multi-shot reference generation remains deferred to the next phase.
- Advanced omnireference capability such as `@` asset syntax, multiple videos, more images, or mp3-based character voice reference remains deferred to a later bonus phase.
- Later-stage dialogue editing / override and manual single-shot supplements remain part of the following handoff-focused phase, not this one.

</deferred>

---
*Phase: 02-multi-shot-fast-path*
*Context gathered: 2026-04-19*
