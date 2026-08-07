# Phase 3: Editable Production Handoff - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase completes the production handoff after the multi-shot fast path and asset-aware confirmation flow are already in place. The scope is to make downstream video production editable and usable in real work by moving dialogue editing into the video stage, preserving a short path from multi-shot confirmation into production, and allowing manual single-shot supplements without collapsing back into the traditional storyboard-first workflow.

</domain>

<decisions>
## Implementation Decisions

### Single-shot supplement entry
- **D-01:** The primary entry for adding manual single-shot supplements should live on the multi-shot confirmation page, not on the script page and not primarily inside the video page.
- **D-02:** This supplement entry should feel like an exception-handling path attached to the multi-shot flow, rather than a return to the traditional full-storyboard chain.

### Video-stage editing model
- **D-03:** In the video stage, each production unit should expose two editable text inputs: one for the video prompt and one for dialogue / spoken lines.
- **D-04:** Dialogue editing belongs in the video stage, not in the multi-shot confirmation page.
- **D-05:** The editable dialogue field is an override layer: generated dialogue may flow in from the script-derived draft, but users must be able to replace it before generation.

### Multi-shot and single-shot coexistence
- **D-06:** Manual single-shot supplements should be managed as production units parallel to multi-shot segments, not nested under a specific multi-shot segment.
- **D-07:** On the page layout, manual single-shot supplements should appear below the full list of multi-shot segments so the main fast path stays visually primary.
- **D-08:** The coexistence model should remain easy to scan: users first see the episode's generated multi-shot segments, then see any manually added single-shot supplements beneath them.

### Entry into the production page
- **D-09:** When users continue from multi-shot confirmation into the video stage, the page should default to expanding all relevant production units rather than collapsing to only one segment or prioritizing only incomplete items.
- **D-10:** The handoff should preserve a sense of continuity from confirmation into production: users should be able to immediately inspect and edit all multi-shot production units without extra reveal steps.

### Scope guard for this phase
- **D-11:** This phase is about editable production handoff and manual supplements; it does not expand into advanced omnireference inputs like `@` assets, multiple videos, or mp3 references.
- **D-12:** This phase also should not move the reference-confirmation responsibilities back into the video stage; multi-shot confirmation remains responsible for prompt/reference review before production.

### the agent's Discretion
- Exact button labels and helper copy for the single-shot supplement entry, as long as it clearly reads as a manual supplement path
- Whether single-shot supplements are created from a lightweight modal, inline card seed, or reused existing panel-creation flow, as long as the entry point stays on the multi-shot confirmation page
- Exact visual treatment for the expanded-by-default video stage, as long as all relevant multi-shot production units are immediately editable on entry

</decisions>

<specifics>
## Specific Ideas

- The user has already stated that dialogue, shot rhythm, and other production-facing text should live in the video-generation stage rather than in the multi-shot confirmation page.
- The user explicitly wants the production-stage text model split into separate fields so dialogue does not pollute the main video prompt.
- For coexistence, the user wants manual single-shot content to be parallel to multi-shot segments but visually placed after the full multi-shot section, keeping the fast path as the main narrative spine.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` — Defines Phase 3 goal, requirement mapping, and success criteria for editable production handoff
- `.planning/REQUIREMENTS.md` — Source requirements for Phase 3: MSHT-07, MSHT-08, SHOT-02, UI-04
- `.planning/STATE.md` — Current milestone status and previously locked assumptions carried from earlier phases
- `.planning/PROJECT.md` — Product intent and scope boundaries for this milestone

### Upstream multi-shot flow decisions
- `.planning/phases/02-multi-shot-fast-path/02-CONTEXT.md` — Defines the multi-shot fast path, per-segment payload shape, and confirmation-stage role
- `.planning/phases/02.1-multi-shot-asset-injection/02.1-CONTEXT.md` — Defines the asset-aware confirmation flow and confirms that confirmation remains a pre-production review step

### Existing production-stage code
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx` — Current mode-aware entry and back-navigation into the video stage
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx` — Current multi-shot production UI and the main surface that Phase 3 will extend
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel.tsx` — Existing single-shot video rendering surface
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx` — Existing single-shot card UI with editable dialogue override behavior
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/videoPanelRuntimeCore.tsx` — Existing runtime wiring for separate video-prompt and dialogue-override editors

### Existing single-shot creation path
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/usePanelCrudActions.ts` — Current panel creation flow that may be reused for manual single-shot supplements
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardCanvas.tsx` — Existing UI pattern for add-panel actions in storyboard land

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ShotGroupVideoSection.tsx` already acts as the multi-shot video production surface, so it is the natural place to add downstream editable fields and visibility behavior for multi-shot production units.
- `VideoPanelCardBody.tsx` and `videoPanelRuntimeCore.tsx` already support separate editing for video prompts and dialogue overrides on single-shot cards, which directly matches the user's chosen dual-input model.
- `usePanelCrudActions.ts` already contains a create-panel mutation path, which is the clearest existing hook for manual single-shot supplement creation without inventing a second persistence model.

### Established Patterns
- The workspace already treats multi-shot units and single-shot panels as distinct production objects, so a parallel coexistence model aligns with current domain separation better than nesting one under the other.
- Prompt editing in the video stage already uses local draft state plus save actions, so Phase 3 should preserve that editing pattern instead of inventing a one-off interaction model for multi-shot dialogue overrides.
- The multi-shot confirmation stage is already framed as a pre-production review step, so Phase 3 should extend the handoff into production rather than reassigning confirmation responsibilities.

### Integration Points
- `VideoStageRoute.tsx` is the transition point that determines how multi-shot episodes land in the video stage and how the back path behaves.
- `ShotGroupVideoSection.tsx` is where multi-shot production cards can gain editable prompt/dialogue fields and where layout coordination with manual single-shot supplements will likely happen.
- The current storyboard panel creation and video panel surfaces provide the most likely reuse path for manual supplement units, even if the entry point moves to the multi-shot confirmation page.

</code_context>

<deferred>
## Deferred Ideas

- Advanced omnireference controls such as `@` asset syntax, multi-video inputs, multi-image reference packs, and mp3-driven voice reference remain a later bonus phase.
- More sophisticated timeline-style interleaving of single-shot inserts among multi-shot segments is deferred; this phase only requires a parallel layout with single-shots listed below the multi-shot section.
- Any redesign that moves asset/reference confirmation responsibilities from the multi-shot confirmation page into the video page is out of scope for this phase.

</deferred>

---
*Phase: 03-editable-production-handoff*
*Context gathered: 2026-04-19*
