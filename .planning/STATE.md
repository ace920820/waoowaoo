---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: AI 视频翻拍工作台整合
current_phase: 09.1
current_phase_name: 短镜头合并 unit 视频生成
status: verifying
stopped_at: Phase 09.1 all 6 plans executed
last_updated: "2026-08-14T03:20:21.355Z"
last_activity: 2026-08-14
last_activity_desc: Phase 09.1 execution started
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 36
  completed_plans: 33
  percent: 50
---

# STATE

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-08-07)

**Core value:** 用户只做镜头判断、Prompt 修订和版本选择等高价值决策，系统自动完成从原始视频到可编辑 Shot 视频素材之间的重复生产工作，并保证所有中间状态可追踪、可回退、可重试。
**Current focus:** Phase 09.1 — 短镜头合并 unit 视频生成

## Current Roadmap Status

- Phase 1: Episode Mode Entry — implemented
- Phase 2: Multi-Shot Fast Path — verified
- Phase 02.1: Multi-Shot Asset Injection — user accepted
- Phase 3: Editable Production Handoff — user accepted
- Phase 03.1: Multi-Shot Cinematic Prompting — implemented
- Phase 03.2: Storyboard Package Import Contract — implemented
- Phase 03.3: Import API And Persistence — implemented
- Phase 03.4: Script Page Upload UI — implemented
- Phase 4: Hardening And Rollout — canceled 2026-08-07; will not be executed
- Phase 5: 翻拍项目与核心工作台 — completed 2026-08-07; Phase 6 handoff recorded
- Phase 6: SceneDetect 镜头与关键帧审核 — 已纳入 v1.1 Roadmap，待规划
- Phase 7: Prompt 分析与人工审核 — 已纳入 v1.1 Roadmap，待规划
- Phase 8: 新关键帧生成与版本选择 — 已纳入 v1.1 Roadmap，待规划
- Phase 9: 新视频镜头生成与版本选择 — 已纳入 v1.1 Roadmap，待规划
- Phase 10: 批量任务编排与恢复 — 已纳入 v1.1 Roadmap，待规划
- Phase 11: 最终素材检查与导出 — 已纳入 v1.1 Roadmap，待规划

## Deferred Items

Items acknowledged and deferred at v1.0 milestone close on 2026-08-07. These are audit metadata gaps or work records, not claims that the corresponding implementation is incomplete.

| Category | Item | Status |
|----------|------|--------|
| quick_task | `260424-fkk-add-progressive-code-disclosure-protocol` | unknown |
| quick_task | `260424-lens-language-phase-31-prompts` | unknown |
| quick_task | `260424-vbw-multi-shot-cinematic-prompt-plan` | unknown |
| quick_task | `260426-mj1-fix-storyboard-package-import-review-fin` | unknown |
| quick_task | `260426-rln-fix-storyboard-import-dialog-opacity-and` | unknown |
| quick_task | `260426-u23-imageurl-referenceimages` | unknown |
| quick_task | `260427-0dt-seedance-2-0-contentitems` | unknown |
| quick_task | `260427-seedance-reference-consistency` | missing |
| quick_task | `260428-sy7-storyboard-package-mapper-prompt-formatt` | unknown |
| quick_task | `260428-w7y-gpt-image-2-high-medium-low-auto-quality` | unknown |
| quick_task | `260428-x6i-shot-group-reference-image-model` | unknown |
| quick_task | `260502-trl-implement-lightweight-one-command-local-` | missing |
| quick_task | `260507-cpz-fix-frontend-result-page-missing-fields-` | unknown |
| quick_task | `260507-dh5-fix-frontend-result-page-grouped-field-m` | unknown |
| quick_task | `260703-lqd-fix-shot-group-videoreferencesjson-overf` | unknown |
| uat_gap | `Phase 02 / 02-HUMAN-UAT.md` | partial; 1 open scenario |
| verification_gap | `Phase 02 / 02-VERIFICATION.md` | human_needed |

### Milestone Closeout Override

- Closeout type: `override_closeout`
- Phase 4 was explicitly canceled by the user and is not counted as delivered.
- 31/31 implementation plans across Phases 1-03.4 have summaries, but only Phase 3 has a current-format passing verification report; missing or human-needed reports remain documented as known verification overrides.

## Accumulated Context

### Quick Tasks Completed

| Date | Task | Summary |
|------|------|---------|
| 2026-04-24 | `260424-fkk-add-progressive-code-disclosure-protocol` | Added progressive code disclosure rules to `AGENTS.md` and created reusable Codex skill `progressive-code-disclosure`. |
| 2026-04-24 | `260424-vbw-multi-shot-cinematic-prompt-plan` | Designed a cinematic prompt upgrade plan for multi-shot Script->Storyboard output, recommending an inserted `03.1 Multi-Shot Cinematic Prompting` phase before Phase 4. |
| 2026-04-24 | `260424-lens-language-phase-31-prompts` | Incorporated `data/镜头语言.md` lens-language research into Phase 03.1 segmentation and downstream prompt builders. |
| 2026-04-26 | `260426-mj1-fix-storyboard-package-import-review-fin` | Fixed storyboard package import review findings: duplicate segment/shot validation, scene-qualified commit lookup, and visible preview upload errors. |
| 2026-04-26 | `260426-rln-fix-storyboard-import-dialog-opacity-and` | Improved storyboard import modal opacity and fixed Nano Banana 2 reference-image generation failures caused by `0.5K` imageSize. |
| 2026-04-26 | `260426-u23-imageurl-referenceimages` | Hydrated missing character/location/prop asset image URLs before shot-group reference generation and added a regression ensuring 李未 enters `referenceImages`. |
| 2026-04-27 | `260427-0dt-seedance-2-0-contentitems` | Added configurable Seedance reference materials for multi-shot video: concept images, selected character/scene/prop/shot images, character voice audio, `contentItems`, and `@Image`/`@Audio` prompt instructions. |
| 2026-04-28 | `260428-sy7-storyboard-package-mapper-prompt-formatt` | Enriched storyboard package import mapping so visible prompts and final model prompts include director per-shot cinematic fields without schema changes. |
| 2026-04-28 | `260428-w7y-gpt-image-2-high-medium-low-auto-quality` | Exposed OpenAI-compatible `gpt-image-2` as high/medium/low/auto quality aliases; follow-ups allowed the `{{quality}}` placeholder and accepted `b64_json` template image responses. |
| 2026-04-28 | `260428-x6i-shot-group-reference-image-model` | Added project-level auxiliary reference image model selection (`shotGroupReferenceImageModel`) and routed multi-shot reference image generation to it while keeping storyboard board generation on `storyboardModel`. |
| 2026-05-07 | `260507-cpz-fix-frontend-result-page-missing-fields-` | Fixed storyboard package frontend result/preview rendering for shot-level `focalLength`, `dof`, and `lighting` while preserving backend generation contracts. |
| 2026-07-03 | `260703-lqd-fix-shot-group-videoreferencesjson-overf` | Widened `NovelPromotionShotGroup.videoReferencesJson` to MySQL `LONGTEXT` so imported cinematic plans and submitted storyboard prompts can persist without overflowing the column. |
| 2026-08-07 | `260807-vrz-remakeworkbench` | Verified the video-remake creation entry and `RemakeWorkbench` mount; 7 focused tests and typecheck passed. |
| 2026-08-12 | `20260812-storyboard-go-prompt-sync` | 分镜页「前往 Prompt 页」按钮改为客户端 stage 切换（复用 updateStage('prompt')），与顶部标签一致，整页跳转改为直接切换并保持当前选中的镜头片段。 |
| 2026-08-12 | `20260812-shorten-shot-labels-unify-prompt-header` | 简化 prompt/分镜/成片三页镜头名称为「镜头XX」；prompt 分析页顶部卡片改为与分镜/成片统一的 p-5 pill 指标样式（含分析中任务数实时显示）。 |
| 2026-08-13 | `20260813-remake-video-generation-feedback` | 视频生成结果反馈：任务运行中显示「视频生成中…」、失败显示 errorCode/errorMessage、成功自动出现版本；snapshot 对视频生成任务自动轮询（3s）。 |

### UAT / Verification Notes

- 2026-04-24: Phase 02.1 Multi-Shot Asset Injection accepted by user; `02.1-UAT.md` remains complete with 4/4 checks passed.
- 2026-04-24: Phase 03 targeted and cross-phase regression suites reran successfully: 12 test files / 72 total assertions across the two commands, all passing. User confirmed the real-workspace refresh/rebuild edit preservation check; Phase 03 is accepted.
- 2026-04-24: Phase 03.1 Multi-Shot Cinematic Prompting implemented. Rich LLM output now separates reference/storyboard/video prompts, persists cinematic metadata, routes shot-level film language into reference image, storyboard composite, and multi-shot video prompts, and passes focused Vitest regressions.
- 2026-04-24: `data/镜头语言.md` lens-language research was distilled into Phase 03.1 segmentation and prompt builder instructions; focused prompt regressions passed.

### Roadmap Evolution

- 2026-04-26: Phase 03.4 Script Page Upload UI implemented. Added upload button, file preview flow, preview dialog, commit/cancel handling, import client mutations, runtime navigation to multi-shot confirmation, i18n copy, and focused UI/API regressions.
- 2026-04-26: Phase 03.4 planned with three executable plans: import client/runtime wiring, script-page upload preview UI, and commit/cancel/navigation test hardening.
- 2026-04-26: Phase 03.3 Import API And Persistence implemented. Added secured preview/commit route, import service, asset matching, shot-group persistence, draft metadata identity, item prompt writes, and 6 focused integration tests; focused lint, typecheck, and 03.2 contract regressions passed.
- 2026-04-26: Phase 03.3 planned with three executable plans: preview API/asset matching, commit persistence, and integration hardening.
- 2026-04-26: Phase 03.2 Storyboard Package Import Contract implemented. Added pure schema/parser/mapper modules for `waoo.storyboard_package` v1.0, Markdown fenced JSON extraction, semantic validation, internal import-plan mapping, and 19 focused unit tests.
- 2026-04-24: Phase 03.1 planning artifacts created from the cinematic prompt quick plan: CONTEXT, RESEARCH, VALIDATION, and three executable PLAN files.
- 2026-04-26: Phase 03.2 added: Storyboard Package Import Contract, covering `waoo.storyboard_package` v1.0 schema, parser, validator, fenced Markdown JSON extraction, and mapper unit tests.
- 2026-04-26: Phase 03.3 added: Import API And Persistence, covering preview/commit import route, asset matching, shot-group persistence, draft metadata, cinematic plan, item prompts, and integration tests.
- 2026-04-26: Phase 03.4 added: Script Page Upload UI, covering upload button, browser file read, preview UI, asset matching display, overwrite strategy, commit navigation, and focused UI tests.
- 2026-04-26: Phase 03.2 planned and implemented with three completed plans: schema/validation, parser, and mapper/unit tests. Focused Vitest suite and TypeScript typecheck passed.
- Phase 02.1 inserted after Phase 2: Multi-Shot Asset Injection (URGENT)
- Proposed next insertion: Phase 03.1 Multi-Shot Cinematic Prompting, focused on splitting one shared `narrativePrompt` into specialized reference/storyboard/video prompts plus shot-level cinematic plans before final Phase 4 hardening.
- Phase 09.1 inserted after Phase 9: 短镜头合并 unit 视频生成 (URGENT)

## Initialization Notes

- This is a brownfield initialization built on an existing AI video production product.
- Existing codebase mapping lives in `.planning/codebase/`.
- This milestone explicitly targets only P1 workflow reform.
- P2 asset injection and P3 advanced omnireference remain deferred.

## Working Assumptions

- Episode-level mode selection belongs on the script page before “确认并开始绘制”.
- Multi-shot mode is the default for newly configured episodes.
- A typical episode is treated as roughly 2 minutes, or about 8 multi-shot segments of 15 seconds each.
- Each 15-second segment is the minimum video generation unit and can contain up to 9 shots.
- Multi-shot prompts may include short dialogue embedded into action progression, but later video-stage editing must remain possible.

---
*Initialized: 2026-04-19*

## Current Position

Phase: 09.1 (短镜头合并 unit 视频生成) — EXECUTING
Plan: 6 of 6
Status: Phase complete — ready for verification
Last activity: 2026-08-14 — Phase 09.1 execution started

Progress: [█████████░] 92%

## Operator Next Steps

- **规划新插入的 Phase 09.1（短镜头合并 unit 视频生成，URGENT）**：`/gsd-plan-phase 09.1`，设计见 `.planning/remake-video-merge-unit-design.md`。
- 执行 Phase 08 人工验收（桌面/移动端视觉与交互走查）：画面描述可编辑并即时生效、空卡生成按钮、悬浮浮窗、候选比较 radio。
- 修复 `check:config-center-guards` 中 `video.worker.ts` 的 4 个既有 modelId 降级违规（历史遗留，非本 wave 范围）。
- Phase 07-04 的 verification/真实 Codex/人工验收仍需在 Phase 07 关闭前完成。

## Session

**Last session:** 2026-08-14T03:20:21.345Z
**Stopped at:** Phase 09.1 all 6 plans executed
**Resume file:** None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 07-prompt P03 | 10h 29m | 3 tasks | 28 files |
| Phase 09.1-unit P01 | 30min | 3 tasks | 14 files |
| Phase 09.1 P02 | 5min | 3 tasks | 7 files |
| Phase 09.1-unit P03 | 15min | 3 tasks | 9 files |
| Phase 09.1 P04 | 12min | 2 tasks | 14 files |
| Phase 09.1 P05 | 8min | 2 tasks | 7 files |

## Decisions

- [Phase ?]: Prompt full output is fetched only from authorized track detail, not the snapshot.
- [Phase ?]: Image analysis is per-frame; Video analysis is project-level only.
- [Phase ?]: The standalone Prompt reference remains untracked and excluded from root TypeScript compilation.
- [Phase 09.1-unit]: shot_keyframe role ordered between end_keyframe and action_sheet; persisted rows store role strings so renumbering is safe
- [Phase 09.1-unit]: assertVideoReferenceOrder relaxed from strictly-increasing to non-decreasing (equal role order allowed) - admits N consecutive member keyframes, preserves single-shot guarantees
- [Phase 09.1-unit]: unit input snapshot is strict/frozen with promptText = D-09 timed prompt + reference suffix; members carry per-member promptVersionId (batch-level promptVersionId = first member's, resolved in 09.1-03 T3 per Open Question 1)
- [Phase 09.1-unit]: unit task dedupe key remake-video-unit:{projectId}:{operationKey}:{fingerprint}; parseVideoUnitTaskPayload re-verifies fingerprint after stripping runtime keys (D-22)
- [Phase ?]: Dedup key = (role, assetId): a character keeps both character_reference and character_audio_reference while the same asset across members collapses to one of each
- [Phase ?]: Grid rule (D-07 discretion): 2-6 unit sources -> 2 columns, 7-9 -> 3 columns; cells are 640x360 cover-fit + 34px 镜头{N} label bar
- [Phase ?]: buildUnitReferencePlan delegates sorting/truncation to the existing buildRemakeReferencePlan (T-091-05: member keyframes emitted before assets so degrade never drops a frame)
- [Phase ?]: buildUnitSubmissionPreview derives total duration via deriveDefaultVideoDuration(sum, definitions ?? []) only when totalDurationSeconds is not supplied; preview promptText/orderedReferences are byte-identical to buildUnitTimedPrompt / buildUnitReferencePlan (D-16 WYSIWYG)
- [Phase ?]: renderUnitActionSheet bounds sources 2..9 and rejects outside (T-091-07)
- [Phase ?]: Pure reference-plan helpers extracted to a prisma-free module (unit/reference-plan.ts) so the D-16 preview stays client-safe; references.ts re-exports them
- [Phase ?]: Open Question 1 resolution: unit batch promptVersionId = first member's promptVersionId; per-member promptVersionIds stay in the frozen snapshot members[]
- [Phase ?]: RemakeVideoUnitMember.shotRevisionId is a plain column (no FK) — D-04 uniqueness enforced by @@unique([shotRevisionId])
- [Phase ?]: adoptVideoUnitVersion stale check = every frozen member revision still active/current; keyframe media equality stays in append-time assertVideoUnitSubmissionCurrent
- [Phase ?]: unit outputVersion: shotId/revisionId = first member's, kind video_candidate_unit, fingerprint operationKey:inputFingerprint:1, provenance schema remake-video-unit-generation@1
- [Phase ?]: invalidateRemakeVideoUnitVersions marks only completed unit versions needs_review (T-091-12) and never touches adoption pointers
- [Phase 09.1]: Deferred action-sheet marker (W5): the frozen orderedReferences action_sheet entry carries mediaUrl 'unit-action-sheet://deferred/{unitActionSheetFingerprint}' — deterministic and fingerprint-covered; the worker (09.1-05) replaces it with the persisted media ref after render+persist

D-21 PARAMS reason = member's shot-revision payload has no parseable time range at all; partial data falls back to the 3s convention (missing end -> start+3, missing start -> 0) matching memberDurationSeconds
D-05 gate fires on the raw duration sum > model max (capability duration options max, default 15) BEFORE deriveDefaultVideoDuration, throwing REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG:{sum}:{max} with a Chinese split hint
Unit asset toggles hardcoded to single-shot defaults (characters/scene/props on, audio off) since the generate action schema carries no asset toggles
collectUnitMemberKeyframeCandidates now returns the chosen keyframe slot (needed by the snapshot selectedKeyframe + D-22 currentness re-check)
createVideoUnit accepts optional userLabel; new updateVideoUnitLabel service fn for the PATCH userLabel route (09.1-03 shipped neither)

- [Phase 09.1]: Shared helper location: src/lib/workers/ark-content-items.ts exports buildArkContentItems + isImageReference + SignedReference; both handlers import it — single-shot output unchanged
- [Phase 09.1]: Unit reference resolver is a small unit variant (resolveVideoUnitReferenceStorageKeys(snapshot, actionSheetMediaId?)) rather than widening the single-shot signature; the W5 deferred action-sheet marker resolves through the persisted sheet MediaObject
- [Phase 09.1]: The frozen snapshot is passed unmutated to appendVideoUnitBatch (the deferred marker stays in the persisted orderedReferences); provider references are resolved from a derived copy so the D-22 fingerprint is never invalidated
- [Phase 09.1]: generationMode forced to normal unconditionally (D-09) — snapshot.options.generationMode is never honored for units (never firstlastframe)
- [Phase 09.1]: renderAndPersistUnitActionSheet nullable mediaId is guarded in the handler (REMAKE_VIDEO_REFERENCE_UNAVAILABLE) since the schema column is String?
