# Phase 1: Episode Mode Entry - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds an episode-level mode entry point to the script page so users choose the production path for the current episode before clicking `确认并开始绘制`. The scope is limited to surfacing and resolving that per-episode choice clearly, with multi-shot mode as the default path and traditional mode preserved as an option.

</domain>

<decisions>
## Implementation Decisions

### Mode entry placement
- **D-01:** The mode selector lives in the right-side action area at the bottom of the script page, directly below the `剧中资产` card and directly above the `确认并开始绘制` button.
- **D-02:** The selector is intentionally placed at the final pre-launch decision point so users confirm the episode path immediately before starting drawing.

### Switching policy
- **D-03:** Users can freely switch an episode’s mode before downstream drawing / storyboard / video artifacts exist.
- **D-04:** Once an episode already has downstream drawing, storyboard, or video-related artifacts, switching mode must require explicit confirmation because the downstream path may need to be rerun under the new mode.

### CTA and mode feedback
- **D-05:** The main CTA keeps the base label `确认并开始绘制`.
- **D-06:** The CTA area must also display the active mode clearly through mode labeling and/or supporting copy so users can immediately tell whether they are about to launch the multi-shot path or the traditional path.

### Legacy episode default strategy
- **D-07:** Newly configured episodes default to multi-shot mode.
- **D-08:** Existing historical episodes should use a conservative inheritance rule: episodes with clear traditional-pipeline traces default to traditional mode on migration, while all other legacy episodes default to multi-shot mode.

### the agent's Discretion
- Exact visual treatment of the mode selector card, including spacing, iconography, and microcopy style
- Whether the mode summary appears as inline helper text, pill badges, or a compact caption near the CTA, as long as the active path is unmistakable
- Exact confirmation dialog wording when switching a started episode to another mode

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` — Phase 1 goal, mapped requirements, and success criteria for episode-level mode entry
- `.planning/PROJECT.md` — Product context, brownfield constraints, and locked decisions about per-episode configuration and default multi-shot mode
- `.planning/REQUIREMENTS.md` — Source requirements for Phase 1: MODE-01, MODE-02, MODE-04, UI-01, UI-03

### Existing UI and interaction points
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx` — Composes the current two-column script page and passes the generate action into the right-side panel
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx` — Current right-side action area, asset card stack, readiness messaging, and `确认并开始绘制` button placement
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewScriptPanel.tsx` — Left-side episode clip/script display; useful for understanding current episode-scoped content flow
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx` — Existing episode selection shell and stage navigation; relevant to how per-episode state is surfaced in the workspace

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScriptViewRuntime.tsx`: already owns the script-stage composition and is the cleanest place to thread episode mode state into both left and right panels.
- `ScriptViewAssetsPanel.tsx`: already contains the final readiness area, missing-asset warning block, and the current launch CTA, making it the natural host for the new mode selector card.
- `WorkspaceHeaderShell.tsx`: already handles episode-level selection state, which aligns with the product decision that mode is configured per episode rather than per project.

### Established Patterns
- The script page is already organized as a left content column plus right control column, so the new entry should extend the existing right-side action stack instead of inventing a new layout region.
- Current workflow messaging uses inline helper cards above the CTA for readiness and missing assets, so mode feedback should likely follow the same pattern family.
- Episode-specific actions are already routed through selected episode state rather than project-global toggles, which supports storing and reading mode per episode.

### Integration Points
- The new selector needs to hook into the same path that currently powers `onGenerateStoryboard` / launch from `ScriptViewAssetsPanel.tsx`.
- Migration/default logic for legacy episodes will need an integration point in the episode data/config model and in the episode load path that hydrates the script page.
- Confirmation-on-switch behavior will need to inspect whether storyboard / drawing / video-related artifacts already exist for the selected episode before allowing a mode flip silently.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants the selector placed in the empty space below the `剧中资产` card and above the `确认并开始绘制` button on the right side of the script page.
- The selector should behave like a last-mile path choice rather than a distant global setting.
- The CTA should continue to feel like the familiar primary button, but with enough mode-specific labeling or helper copy that users immediately understand what path they are launching.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---
*Phase: 01-episode-mode-entry*
*Context gathered: 2026-04-19*
