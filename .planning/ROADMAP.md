# Roadmap: waoowaoo AI 影视 Studio

**Created:** 2026-04-19
**Project:** `.planning/PROJECT.md`
**Requirements:** `.planning/REQUIREMENTS.md`
**Mode:** interactive
**Granularity:** standard

## Summary

This roadmap focuses only on P1: splitting the production workflow into a default multi-shot fast path and a preserved traditional path, configured per episode from the script page before drawing starts.

**4 phases** | **20 v1 requirements mapped** | All v1 requirements covered ✓

## Phases

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 1 | Episode Mode Entry | Add per-episode mode selection on the script page with multi-shot as the default and clear pre-draw gating | MODE-01, MODE-02, MODE-04, UI-01, UI-03 |
| 2 | Multi-Shot Fast Path | Replace the default traditional storyboard-script hop with direct 15s multi-shot prompt generation while preserving traditional mode compatibility | MODE-03, TRAD-01, TRAD-02, MSHT-01, MSHT-02, MSHT-03, MSHT-04, MSHT-05, MSHT-06, SHOT-01, UI-02 |
| 3 | Editable Production Handoff | Support manual single-shot supplements and ensure generated multi-shot dialogue/prompt payloads flow into later drawing/video steps with editable overrides | MSHT-07, MSHT-08, SHOT-02, UI-04 |
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
- [ ] 02-01-PLAN.md — Build the episode multi-shot draft contract, metadata, and batch creation API
- [ ] 02-02-PLAN.md — Route multi-shot episodes through a dedicated confirmation stage while preserving the traditional storyboard path
- [ ] 02-03-PLAN.md — Finish the multi-shot confirmation surface and fast-path copy without regressing the traditional storyboard UI

**Success criteria:**
1. Traditional mode continues to execute the existing classic chain for users who need frame-by-frame control.
2. Multi-shot mode skips pre-generating the legacy verbose storyboard script by default after segment script generation.
3. The system produces one video-generation-ready prompt payload per 15-second segment, grounded in the episode script-page content and segment structure.
4. Each multi-shot segment payload supports up to 9 shots worth of motion, framing, and emotion progression inside a single video-generation unit.
5. Multi-shot mode removes or downgrades now-unnecessary traditional storyboard-script UI and steps from the default path.
6. Multi-shot mode does not auto-create single-shot storyboards up front.

### Phase 3: Editable Production Handoff

**Goal:** Ensure multi-shot outputs remain usable in real production by supporting dialogue override/editing in downstream video generation and allowing manual single-shot additions where needed.

**Requirements:** MSHT-07, MSHT-08, SHOT-02, UI-04

**UI hint:** yes

**Success criteria:**
1. Generated multi-shot prompts can include short dialogue aligned to action beats from the script.
2. Users can edit or override that dialogue later during video generation rather than being locked to the initial auto-generated text.
3. Users can manually add single-shot supplements to an episode even when the episode is running in multi-shot mode.
4. The “确认并开始绘制” action triggers downstream behavior that matches the currently selected episode mode.

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
- Phase 4 depends on Phases 1-3 and focuses on validation, regression control, and workflow stabilization.

## Coverage Check

- Total v1 requirements: 20
- Requirements mapped: 20
- Unmapped requirements: 0 ✓

## Immediate Next Focus

Start with Phase 1, because episode-level mode selection is the control point that unlocks every later change in this roadmap.

---
*Last updated: 2026-04-19 after project initialization*
