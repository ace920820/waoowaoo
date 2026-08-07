# Milestones

## v1.0 milestone (Shipped: 2026-08-07)

**Closeout:** `override_closeout`; Phase 4 Hardening And Rollout was formally canceled and is not counted as delivered.

**Phases completed:** 8 phases, 31 plans, 20 tasks

**Key accomplishments:**

- Episode-level production mode persistence with conservative legacy backfill and validated create/update APIs
- Started-episode mode switching now routes through the existing workspace confirmation flow with broader downstream artifact checks
- The script-page right rail now exposes per-episode mode selection and an unchanged draw CTA that branches by production mode
- Workspace query contracts now expose episodeProductionMode end-to-end for episode-scoped UI and runtime decisions
- Clip-ordered 15-second multi-shot draft payloads with persisted draft metadata, placeholder recovery, and one-call episode draft creation
- Mode-aware workspace routing that prepares multi-shot drafts, lands on a dedicated confirmation stage, and preserves the classic storyboard path for traditional episodes
- Review-only multi-shot confirmation with per-segment reference actions and script-page copy that routes users through confirmation before videos
- Two coarse episode clips now expand into ordered 15-second multi-shot draft slots with stable segment identity and per-segment route reuse
- Multi-shot confirmation now stays reachable from fresh draft data, shows its dedicated capsule label, and frames the reference-review handoff before videos
- Persisted multi-shot dialogue overrides in shot-group draft metadata and resolved effective dialogue into a dedicated video-prompt block with explicit fallback behavior
- Multi-shot video production units now expose separate prompt and dialogue editors, persist override-clear semantics through draft metadata, and keep the mode-aware handoff locked by regression tests
- Multi-shot confirmation now creates manual single-shot supplements inline and the video stage presents them as a secondary section beneath the primary multi-shot production units
- Aligned the multi-shot draft rebuild route with the persisted metadata merge contract so saved review/video edits survive rebuilds while regenerated segment structure still refreshes from current drafts
- Multi-shot review and video drafts now survive harmless shot-group rerenders while still reseeding from real server-side updates

**Known verification overrides:** Early phases lack current-format verification reports; Phase 2 retains one open human UAT scenario. See `.planning/STATE.md`.

---
