# Roadmap: waoowaoo AI 影视 Studio

**Created:** 2026-04-19
**Project:** `.planning/PROJECT.md`
**Requirements:** `.planning/REQUIREMENTS.md`
**Mode:** interactive
**Granularity:** standard

## Summary

This roadmap focuses only on P1: splitting the production workflow into a default multi-shot fast path and a preserved traditional path, configured per episode from the script page before drawing starts.

**9 phases** | **20 v1 requirements mapped** | Storyboard package upload UI added ✓

## Phases

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 1 | Episode Mode Entry | Add per-episode mode selection on the script page with multi-shot as the default and clear pre-draw gating | MODE-01, MODE-02, MODE-04, UI-01, UI-03 |
| 2 | Multi-Shot Fast Path | Replace the default traditional storyboard-script hop with direct 15s multi-shot prompt generation while preserving traditional mode compatibility | MODE-03, TRAD-01, TRAD-02, MSHT-01, MSHT-02, MSHT-03, MSHT-04, MSHT-05, MSHT-06, SHOT-01, UI-02 |
| 3 | Editable Production Handoff | Support manual single-shot supplements and ensure generated multi-shot dialogue/prompt payloads flow into later drawing/video steps with editable overrides | MSHT-07, MSHT-08, SHOT-02, UI-04 |
| 03.1 | Multi-Shot Cinematic Prompting | Upgrade the multi-shot Script->Storyboard LLM output from one shared narrative prompt into specialized cinematic reference, storyboard, video, and shot-level prompt plans | MSHT-03, MSHT-04, MSHT-05, MSHT-07, UI-04 |
| 03.2 | Storyboard Package Import Contract | Define `waoo.storyboard_package` v1.0 plus parser, validator, Markdown fenced-block extraction, and mapping into multi-shot draft / shot-group payloads | SBPI-01..SBPI-12 |
| 03.3 | Import API And Persistence | Add backend storyboard package import API with preview/commit modes and persistence into multi-shot shot groups, draft metadata, and item prompts | SBPI-13..SBPI-21 |
| 03.4 | Script Page Upload UI | Add script-page upload flow for director-authored storyboard packages with preview, asset matching, overwrite strategy, commit, and navigation | SBPI-22..SBPI-30 |
| 4 | Hardening And Rollout | Validate both modes end-to-end, reduce regression risk, and document the new episode-level workflow | Supporting all Phase 1-3 requirements through verification |

## Phase Details

### Phase 1: Episode Mode Entry

**Goal:** Let users choose the production path per episode from the script page before clicking “确认并开始绘制”, with multi-shot mode preselected as the default.

**Requirements:** MODE-01, MODE-02, MODE-04, UI-01, UI-03

**UI hint:** yes

**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Persist episode production mode and legacy defaults
- [ ] 01-02-PLAN.md — Add the script-page mode selector, confirmation, and CTA path feedback

**Success criteria:**
1. Each episode exposes a visible mode setting on the script page without requiring navigation to another area.
2. Newly configured episodes default to multi-shot mode unless the user explicitly changes them.
3. Users receive clear UI feedback about which downstream generation path the current episode will follow.
4. The script page prevents ambiguous launch behavior by resolving mode choice before drawing starts.

### Phase 2: Multi-Shot Fast Path

**Goal:** Make multi-shot mode the real fast path by skipping the bloated traditional storyboard-script generation and directly producing 15-second multi-shot generation payloads, while keeping traditional mode alive.

**Requirements:** MODE-03, TRAD-01, TRAD-02, MSHT-01, MSHT-02, MSHT-03, MSHT-04, MSHT-05, MSHT-06, SHOT-01, UI-02

**UI hint:** yes

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Build the episode multi-shot draft contract, metadata, and batch creation API
- [x] 02-02-PLAN.md — Route multi-shot episodes through a dedicated confirmation stage while preserving the traditional storyboard path
- [x] 02-03-PLAN.md — Finish the multi-shot confirmation surface and fast-path copy without regressing the traditional storyboard UI

**Success criteria:**
1. Traditional mode continues to execute the existing classic chain for users who need frame-by-frame control.
2. Multi-shot mode skips pre-generating the legacy verbose storyboard script by default after segment script generation.
3. The system produces one video-generation-ready prompt payload per 15-second segment, grounded in the episode script-page content and segment structure.
4. Each multi-shot segment payload supports up to 9 shots worth of motion, framing, and emotion progression inside a single video-generation unit.
5. Multi-shot mode removes or downgrades now-unnecessary traditional storyboard-script UI and steps from the default path.
6. Multi-shot mode does not auto-create single-shot storyboards up front.

### Phase 02.1: Multi-Shot Asset Injection (INSERTED)

**Goal:** Make the multi-shot storyboard/reference confirmation step asset-aware so each derived 15-second segment can generate references from persisted character, prop, location, and mood inputs while still remaining card-local, editable, and non-blocking when some assets are missing.
**Requirements**: AST-01, AST-02, AST-03, AST-04
**Depends on:** Phase 2
**Plans:** 3 plans

Plans:
- [ ] 02.1-01-PLAN.md — Persist segment asset/mood metadata, auto-preselection, and warning state on shot-group drafts
- [ ] 02.1-02-PLAN.md — Add per-card asset and mood controls to the multi-shot confirmation cards
- [ ] 02.1-03-PLAN.md — Wire hover preview management and asset-aware reference-board generation

### Phase 3: Editable Production Handoff

**Goal:** Ensure multi-shot outputs remain usable in real production by supporting dialogue override/editing in downstream video generation and allowing manual single-shot additions where needed.

**Requirements:** MSHT-07, MSHT-08, SHOT-02, UI-04

**UI hint:** yes

**Plans:** 5 plans

Plans:
- [ ] 03-01-PLAN.md — Persist editable multi-shot dialogue overrides and inject them into video prompt generation
- [ ] 03-02-PLAN.md — Expose split video-prompt and dialogue editors on multi-shot production units in the video stage
- [ ] 03-03-PLAN.md — Add the manual single-shot supplement entry and secondary supplement section without leaving the multi-shot flow
- [ ] 03-04-PLAN.md — Preserve saved editable metadata when multi-shot drafts are rebuilt
- [ ] 03-05-PLAN.md — Keep unsaved review and video edits through benign shot-group refreshes

**Success criteria:**
1. Generated multi-shot prompts can include short dialogue aligned to action beats from the script.
2. Users can edit or override that dialogue later during video generation rather than being locked to the initial auto-generated text.
3. Users can manually add single-shot supplements to an episode even when the episode is running in multi-shot mode.
4. The “确认并开始绘制” action triggers downstream behavior that matches the currently selected episode mode.

### Phase 03.1: Multi-Shot Cinematic Prompting (INSERTED)

**Goal:** Upgrade the multi-shot `Script->Storyboard` generation step so each 15-second segment receives differentiated cinematic prompt payloads for concept/reference image generation, storyboard-board generation, and final multi-shot video generation, backed by shot-level professional film language.

**Requirements:** MSHT-03, MSHT-04, MSHT-05, MSHT-07, UI-04

**Depends on:** Phase 3

**UI hint:** yes

**Plans:** 3 plans

Plans:
- [ ] 03.1-01-PLAN.md — Upgrade multi-shot segmentation prompt schema and parser with cinematic plan fallback compatibility
- [ ] 03.1-02-PLAN.md — Persist specialized prompt fields and shot-level item prompts into shot-group drafts
- [ ] 03.1-03-PLAN.md — Route specialized prompts into reference, storyboard, and video generation with focused regression coverage

**Success criteria:**
1. The multi-shot `Script->Storyboard` LLM step can return specialized `referencePrompt`, `storyboardPrompt`, `videoPrompt`, emotional intent, visual strategy, and 4-9 shot-level prompt beats per segment.
2. Existing outputs that only contain `narrativePrompt`, `embeddedDialogue`, `shotRhythmGuidance`, and `expectedShotCount` still parse and persist without regressions.
3. Newly generated multi-shot confirmation cards seed `辅助参考图提示词` and `剧情内容` from distinct specialized fields instead of always mirroring the same narrative prompt.
4. Generated storyboard boards and videos receive ordered shot-level cinematic prompt data including shot size, angle, camera movement, composition, lighting, blocking, and emotional beat.
5. The review UI remains editable and preserves user overrides across draft rebuilds and benign refreshes.

### Phase 03.2: Storyboard Package Import Contract (INSERTED)

**Goal:** Define the `waoo.storyboard_package` v1.0 contract for importing director-authored storyboard packages, including parser, validator, mapper unit tests, and Markdown fenced JSON block extraction.

**Requirements:** SBPI-01, SBPI-02, SBPI-03, SBPI-04, SBPI-05, SBPI-06, SBPI-07, SBPI-08, SBPI-09, SBPI-10, SBPI-11, SBPI-12

**Depends on:** Phase 03.1

**UI hint:** no

**Plans:** 3 plans

Plans:
- [x] 03.2-01-PLAN.md — Define `waoo.storyboard_package` v1.0 schema and semantic validation
- [x] 03.2-02-PLAN.md — Implement raw JSON and Markdown fenced-block parser
- [x] 03.2-03-PLAN.md — Map validated packages into internal multi-shot import payloads

**Success criteria:**
1. A typed `waoo.storyboard_package` v1.0 schema exists for scenes, segments, review config, video config, assets, cinematic plans, and shot-level prompts.
2. Parser supports raw `.json` and Markdown fenced blocks marked `waoo-storyboard-package+json`.
3. Validator rejects unsupported schema versions, invalid templates, malformed scenes / segments, invalid video reference modes, and incompatible shot counts.
4. Mapper translates director-authored package semantics into internal multi-shot draft / shot-group persistence payloads without requiring the director team to know Waoo database fields.
5. Unit tests cover parser, validator, mapper, happy paths, and common invalid package errors.

### Phase 03.3: Import API And Persistence (INSERTED)

**Goal:** Add backend import API for storyboard packages with preview and commit modes, writing imported segments into multi-shot shot groups and draft metadata.

**Requirements:** SBPI-13, SBPI-14, SBPI-15, SBPI-16, SBPI-17, SBPI-18, SBPI-19, SBPI-20, SBPI-21

**Depends on:** Phase 03.2

**UI hint:** no

**Plans:** 3 plans

Plans:
- [x] 03.3-01-PLAN.md — Add secured import route, preview service, and asset matching
- [x] 03.3-02-PLAN.md — Implement commit persistence for shot groups, metadata, and items
- [x] 03.3-03-PLAN.md — Harden preview/commit integration tests and overwrite behavior

**Success criteria:**
1. A secured import route exists under the novel-promotion project/episode API surface.
2. Preview mode parses and validates packages, matches assets, and returns create/update plans, warnings, and overwrite strategy without mutating data.
3. Commit mode creates or replaces imported shot groups and persists review config, video config, draft metadata, cinematic plan, and shot-group item prompts.
4. Asset matching prefers package `externalId` / `matchName` against existing project locations, characters, and props; missing matches produce warnings or script-derived fallback, not silent asset creation.
5. Integration tests cover preview, commit, asset matching, missing asset fallback, item prompt persistence, draft metadata persistence, and repeated import behavior.

### Phase 03.4: Script Page Upload UI (INSERTED)

**Goal:** Add upload storyboard package UI to the script page multi-shot mode so users can import director-authored package files instead of confirming auto-generated drafts.

**Requirements:** SBPI-22, SBPI-23, SBPI-24, SBPI-25, SBPI-26, SBPI-27, SBPI-28, SBPI-29, SBPI-30

**Depends on:** Phase 03.3

**UI hint:** yes

**Plans:** 3 plans

Plans:
- [x] 03.4-01-PLAN.md — Add import API client mutations and workspace runtime wiring
- [x] 03.4-02-PLAN.md — Add script-page upload button, file read, and preview dialog
- [x] 03.4-03-PLAN.md — Complete commit/cancel flow, navigation, and focused UI tests

**Success criteria:**
1. The script page multi-shot mode shows “上传分镜表” beside “确认并开始绘制”.
2. Users can select `.md` / `.json` package files and request preview through the import API.
3. Preview clearly lists scenes / segments, shot counts, template choices, asset matching status, validation warnings, and overwrite behavior.
4. Confirming import commits the package, then navigates to the multi-shot confirmation / video stage with imported fields prefilled.
5. Imported fields remain editable and preserve Phase 3 safeguards for unsaved edits and saved metadata.
6. Focused UI tests cover button visibility, preview rendering, asset warnings, commit success navigation, and cancel/no-op behavior.

### Phase 4: Hardening And Rollout

**Goal:** Prove the two-mode workflow is stable across the existing workspace, avoid regressions, and make the new episode-level operating model clear to future work.

**Requirements:** Verification coverage for all Phase 1-3 requirements

**UI hint:** no

**Success criteria:**
1. Both traditional and multi-shot episode flows pass end-to-end verification from script page selection through downstream production entry.
2. Existing projects and episodes can still use the traditional mode without breaking prior workflows.
3. Core UI and runtime regressions around episode selection, draw entry, and downstream generation are covered by tests or verification steps.
4. Documentation/state artifacts reflect that episode-level mode selection is now part of the product’s core operating model.

## Dependency Notes

- Phase 1 must land before any downstream fast-path branching can be trusted.
- Phase 2 depends on Phase 1 because the selected episode mode determines which generation path is activated.
- Phase 3 depends on Phase 2 because editable handoff requires the new multi-shot prompt payload structure to exist first.
- Phase 03.1 depends on Phase 3 because it refines the already-editable multi-shot prompt handoff before final rollout.
- Phase 03.2 depends on Phase 03.1 because director package mapping targets the same specialized reference/storyboard/video prompt and cinematic-plan surfaces.
- Phase 03.3 depends on Phase 03.2 because the API must use the finalized package parser, validator, and mapper contract.
- Phase 03.4 depends on Phase 03.3 because the upload UI needs the preview/commit import API.
- Phase 4 depends on Phases 1-3 and 03.1-03.4 before final rollout hardening.

## Coverage Check

- Total v1 requirements: 20
- Requirements mapped: 20
- Storyboard import contract requirements mapped: SBPI-01..SBPI-12
- Storyboard import API requirements mapped: SBPI-13..SBPI-21
- Storyboard upload UI requirements mapped: SBPI-22..SBPI-30
- Unmapped current requirements: 0 ✓

## Immediate Next Focus

Proceed to real workspace UAT for Phase 03.4, then Phase 4 hardening/rollout.

---
*Last updated: 2026-04-26 after completing Phase 03.4 Script Page Upload UI*
