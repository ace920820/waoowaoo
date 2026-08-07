---
phase: 01
slug: episode-mode-entry
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts tests/unit/workspace/rebuild-confirm.test.ts tests/unit/novel-promotion/script-view-mode-entry.test.ts` |
| **Full suite command** | `npm run test:behavior:full` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts tests/unit/workspace/rebuild-confirm.test.ts tests/unit/novel-promotion/script-view-mode-entry.test.ts`
- **After every plan wave:** Run `npm run test:behavior:full`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | MODE-01, MODE-02 | T-01-01-01, T-01-01-02 | Only `multi_shot` or `traditional` persist; legacy backfill stays conservative | integration | `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts` | ✅ planned | ⬜ pending |
| 01-04-01 | 04 | 1 | MODE-01 | T-01-04-01, T-01-04-02 | Shared query and stage contracts expose one episode-backed mode source of truth | integration | `npx vitest run tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts` | ✅ planned | ⬜ pending |
| 01-02-01 | 02 | 2 | MODE-01, UI-03 | T-01-02-01, T-01-02-02 | Started episodes require explicit confirmation before a mode flip mutates server state | unit | `npx vitest run tests/unit/workspace/rebuild-confirm.test.ts` | ✅ planned | ⬜ pending |
| 01-03-01 | 03 | 2 | MODE-04, UI-01, UI-03 | T-01-03-01, T-01-03-02 | Selector UI and draw CTA always reflect the selected episode's persisted mode | unit | `npx vitest run tests/unit/novel-promotion/script-view-mode-entry.test.ts` | ✅ planned | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/api/contract/novel-promotion-episode-production-mode.test.ts` — cover create, batch create, GET, and PATCH mode contract
- [ ] `tests/unit/workspace/rebuild-confirm.test.ts` — extend coverage for `switchEpisodeProductionMode`
- [ ] `tests/unit/novel-promotion/script-view-mode-entry.test.ts` — cover selector placement, helper copy, and CTA mode branching

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Right-rail selector sits below `剧中资产` and above `确认并开始绘制` across script-page breakpoints | UI-01 | Final visual hierarchy and focal order are easier to confirm in the live workspace than in unit tests alone | Open a script page with at least one episode, verify the selector card appears in the locked slot on desktop and narrow layouts, and confirm the active mode remains obvious before launch |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19
