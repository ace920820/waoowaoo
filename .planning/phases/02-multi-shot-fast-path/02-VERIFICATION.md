---
phase: 02-multi-shot-fast-path
verified: 2026-04-19T03:48:58Z
status: gaps_found
score: 10/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Workspace navigation surfaces the dedicated multi-shot confirmation step with its own label."
    status: failed
    reason: "The active capsule navigation switches the stage id to `multi-shot-storyboard` but still renders the generic `stages.storyboard` label, so the dedicated confirmation step is not clearly surfaced in primary navigation."
    artifacts:
      - path: "src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts"
        issue: "The multi-shot branch uses `id: 'multi-shot-storyboard'` but keeps `label: t('stages.storyboard')`."
      - path: "messages/en/stages.json"
        issue: "A dedicated `multiShotStoryboard` label exists but is not consumed by the active capsule navigation."
      - path: "messages/zh/stages.json"
        issue: "A dedicated `multiShotStoryboard` label exists but is not consumed by the active capsule navigation."
    missing:
      - "Use the dedicated `multiShotStoryboard` translation key for the `multi-shot-storyboard` capsule-nav item in multi-shot mode."
      - "Add a rendered navigation-label test so this regression is covered, not just stage ids."
---

# Phase 2: Multi-Shot Fast Path Verification Report

**Phase Goal:** Make multi-shot mode the real fast path by skipping the bloated traditional storyboard-script generation and directly producing 15-second multi-shot generation payloads, while keeping traditional mode alive.
**Verified:** 2026-04-19T03:48:58Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Traditional mode continues to use the classic storyboard branch. | ✓ VERIFIED | [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L134) sends `traditional` through `runScriptToStoryboardFlow`; [WorkspaceStageContent.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx#L24) still renders `StoryboardStage`. |
| 2 | Multi-shot mode skips pre-generating the legacy storyboard step by default. | ✓ VERIFIED | [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L140) prepares drafts then moves to `multi-shot-storyboard`; [novel-promotion-multi-shot-drafts-route.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts#L316) asserts no storyboard rows are created. |
| 3 | Each episode clip becomes one ordered segment draft or explicit placeholder, derived from clip structure rather than a hardcoded count. | ✓ VERIFIED | [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L153) maps `params.clips`; placeholders are emitted at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L162). |
| 4 | Each multi-shot draft is one 15-second video-generation unit with model-ready prompt text. | ✓ VERIFIED | [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L140) assembles prompt payloads; the confirmation UI calls each segment a `15 秒视频生成单元` at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L271). |
| 5 | The segment payload is grounded in episode script content, scene info, and dialogue. | ✓ VERIFIED | [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L71) derives scene labels from clip location/screenplay; [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L81) extracts screenplay dialogue; [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L128) folds summary, characters, props, content, and dialogue into the narrative prompt. |
| 6 | Each segment supports up to 9 shots and encodes rhythm/framing/emotion progression. | ✓ VERIFIED | [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L44) caps expected shots at 9; [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L102) emits slot-by-slot rhythm guidance. |
| 7 | Multi-shot mode does not auto-create single-shot storyboards up front. | ✓ VERIFIED | The draft route only creates `novelPromotionShotGroup` rows at [multi-shot-drafts/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L161); the integration test confirms no storyboard creation at [novel-promotion-multi-shot-drafts-route.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts#L316). |
| 8 | In `multi_shot`, clicking `确认并开始绘制` prepares drafts and lands on a dedicated confirmation stage instead of the traditional storyboard stage. | ✓ VERIFIED | [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L140) calls draft preparation then `handleStageChange('multi-shot-storyboard')`; [useWorkspaceProjectSnapshot.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot.ts#L34) normalizes stale `storyboard` URLs into the new stage. |
| 9 | The confirmation surface stops before video generation and only advances through an explicit continue action. | ✓ VERIFIED | [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L33) states generation has not started; [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L45) is the only forward action; review mode omits generation CTAs at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L203). |
| 10 | The script page downgrades traditional storyboard-specific cues for `multi_shot` while preserving traditional wording for `traditional`. | ✓ VERIFIED | [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L923) renders mode-specific helper text and [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L944) renders mode-specific CTA copy; locale strings exist in [scriptView.json](/Users/jamiezhao/projects/waoowaoo/messages/en/scriptView.json#L53) and [scriptView.json](/Users/jamiezhao/projects/waoowaoo/messages/zh/scriptView.json#L53). |
| 11 | Workspace navigation surfaces the dedicated multi-shot confirmation step with its own label. | ✗ FAILED | [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L51) switches the id to `multi-shot-storyboard` but [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L53) still labels it `t('stages.storyboard')`; dedicated labels exist in [stages.json](/Users/jamiezhao/projects/waoowaoo/messages/en/stages.json#L4) and [stages.json](/Users/jamiezhao/projects/waoowaoo/messages/zh/stages.json#L4) but are not used by the active capsule nav. |

**Score:** 10/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/lib/novel-promotion/multi-shot/episode-draft-builder.ts` | Clip-to-segment draft builder with placeholder handling and prompt assembly | ✓ VERIFIED | Substantive prompt assembly, placeholder handling, template selection, and dialogue extraction at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L153). |
| `src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts` | Episode-scoped multi-shot draft creation endpoint | ✓ VERIFIED | Authenticated route queries episode clips, reuses matching shot groups, and returns per-episode draft summary at [route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L47). |
| `src/lib/shot-group/draft-metadata.ts` | Persistent draft metadata contract stored with shot-group config | ✓ VERIFIED | Parse/merge helpers are implemented at [draft-metadata.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/shot-group/draft-metadata.ts#L35). |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts` | Mode-aware launch branching | ✓ VERIFIED | Branches `traditional` vs `multi_shot` and routes multi-shot into confirmation at [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L134). |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx` | Dedicated multi-shot confirmation shell | ✓ VERIFIED | Renders boundary copy, explicit continue CTA, and embeds review mode at [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L19). |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx` | Mode-aware back navigation from videos | ✓ VERIFIED | Back nav returns to `storyboard` or `multi-shot-storyboard` based on episode mode at [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L36). |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx` | Review-only confirmation body with reference actions and no generation CTA | ✓ VERIFIED | `review` branch shows prompt/dialogue/rhythm plus reference actions and placeholder messaging at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L203). |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx` | Script-page mode helper and CTA copy | ✓ VERIFIED | Multi-shot/traditional helper and CTA copy are selected from `episodeProductionMode` at [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L923). |
| `messages/zh/stages.json` | Localized stage label for the new confirmation step | ✓ VERIFIED | The label exists at [stages.json](/Users/jamiezhao/projects/waoowaoo/messages/zh/stages.json#L4), but its primary-nav wiring is incomplete. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `multi-shot-drafts/route.ts` | `episode-draft-builder.ts` | `buildEpisodeMultiShotDrafts(...)` | WIRED | Imported at [route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L7) and called at [route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L83). |
| `episode-draft-builder.ts` | `screenplay-dialogue.ts` | `extractScreenplayDialogueItems(...)` | WIRED | Imported at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L1) and used at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L82). |
| `shot-groups/route.ts` | `draft-metadata.ts` | snapshot merge / patch preservation | WIRED | Merge is applied at [shot-groups/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/shot-groups/route.ts#L115); PATCH preserves prior metadata at [shot-groups/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/shot-groups/route.ts#L309). |
| `useWorkspaceStageRuntime.ts` | `multi-shot-draft-mutations.ts` | `ensureEpisodeMultiShotDrafts()` | WIRED (indirect) | The hook is created in [useNovelPromotionWorkspaceController.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts#L115), passed into stage runtime at [useNovelPromotionWorkspaceController.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts#L175), and invoked at [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L140). |
| `useWorkspaceProjectSnapshot.ts` | `WorkspaceStageContent.tsx` | current stage normalization | WIRED | Snapshot normalizes `storyboard` to `multi-shot-storyboard` at [useWorkspaceProjectSnapshot.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot.ts#L34); content renders that stage at [WorkspaceStageContent.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx#L26). |
| `VideoStageRoute.tsx` | `MultiShotStoryboardStage.tsx` | `onBack` | WIRED | Video-stage back routing branches to `multi-shot-storyboard` at [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L36). |
| `MultiShotStoryboardStage.tsx` | `WorkspaceStageRuntimeContext.tsx` | `onContinueToVideos -> onStageChange('videos')` | WIRED | The CTA calls `runtime.onStageChange('videos')` at [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L13). |
| `MultiShotStoryboardStage.tsx` | `ShotGroupVideoSection.tsx` | embedded review surface via `mode="review"` | WIRED | Review embedding is explicit at [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L54). |
| `messages/*/scriptView.json` | `ScriptViewAssetsPanel.tsx` | script-page helper and CTA copy | WIRED | The panel reads `productionMode.helper.*` and `productionMode.cta.*` at [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L925). |
| `messages/*/stages.json` | primary workspace capsule nav | dedicated multi-shot stage label | NOT_WIRED | `stages.json` is loaded by [i18n.ts](/Users/jamiezhao/projects/waoowaoo/src/i18n.ts#L54), but the active capsule nav label comes from [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L53), which still uses `t('stages.storyboard')`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `episode-draft-builder.ts` | `clip.content`, `clip.screenplay`, `clip.shotCount` | [multi-shot-drafts/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L61) Prisma episode query over real clip rows | Yes | ✓ FLOWING |
| `multi-shot-drafts/route.ts` | `shotGroups` response payload | Creates/reuses DB `novelPromotionShotGroup` rows and returns hydrated data at [route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L161) | Yes | ✓ FLOWING |
| `MultiShotStoryboardStage.tsx` / `ShotGroupVideoSection.tsx` | `shotGroups` | [useEpisodeData](/Users/jamiezhao/projects/waoowaoo/src/lib/query/hooks/useProjectData.ts#L85) fetches [episodes/[episodeId]/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts#L27), which includes ordered `shotGroups` | Yes | ✓ FLOWING |
| `ScriptViewAssetsPanel.tsx` | `episodeProductionMode` | Mode is passed from workspace episode/runtime state and used for helper/CTA branching at [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L315) | Yes | ✓ FLOWING |
| `useWorkspaceStageNavigation.ts` | capsule-nav stage label | Primary nav uses `novelPromotion.stages.storyboard` instead of dedicated `stages.multiShotStoryboard` | No | ⚠️ STATIC |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Draft builder maps clips, templates, dialogue, and placeholders correctly | `npx vitest run tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts` | 4 tests passed | ✓ PASS |
| Batch route creates/reuses shot groups without creating storyboard rows | `npx vitest run tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts` | 3 tests passed | ✓ PASS |
| Multi-shot routing and review boundary behave as expected | `npx vitest run tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts` | 10 tests passed | ✓ PASS |
| Script-page mode copy diverges correctly between multi-shot and traditional | `npx vitest run tests/unit/novel-promotion/script-view-mode-entry.test.ts` | 2 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `MODE-03` | `02-02-PLAN.md` | User can switch an episode to traditional mode. | ✓ SATISFIED | Mode toggle buttons are rendered at [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L898); runtime persists mode changes via [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L117). |
| `TRAD-01` | `02-02-PLAN.md` | Traditional mode keeps the existing classic chain. | ✓ SATISFIED | Traditional branch stays on storyboard generation at [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L135). |
| `TRAD-02` | `02-02-PLAN.md` | Traditional users keep existing storyboard entry points and pages. | ✓ SATISFIED | `StoryboardStage` still renders at [WorkspaceStageContent.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx#L24), and video back-nav returns there at [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L36). |
| `MSHT-01` | `02-01-PLAN.md` | Multi-shot mode does not pre-generate verbose traditional storyboard scripts by default. | ✓ SATISFIED | Multi-shot launch prepares shot-group drafts only; no storyboard creation is exercised in [novel-promotion-multi-shot-drafts-route.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts#L316). |
| `MSHT-02` | `02-01-PLAN.md` | System generates one 15-second multi-shot unit per segment. | ✓ SATISFIED | Draft builder emits one draft per clip at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L153); review UI labels each as a `15 秒视频生成单元` at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L271). |
| `MSHT-03` | `02-01-PLAN.md` | Segment prompts are grounded in confirmed script-page content, scenes, and segment structure. | ✓ SATISFIED | Prompt assembly consumes clip summary, scene label, characters, props, content, and dialogue at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L128). |
| `MSHT-04` | `02-01-PLAN.md` | Each segment supports up to 9 shots and shows motion/framing/emotion progression. | ✓ SATISFIED | Shot count is capped and template-chosen at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L44); rhythm guidance is generated at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L102). |
| `MSHT-05` | `02-01-PLAN.md` | Prompts are model-ready detailed descriptions, not long storyboard scripts. | ✓ SATISFIED | Narrative prompts are short production-ready payloads at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L140), and the review UI explicitly frames them as model-ready prompts at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L304). |
| `MSHT-06` | `02-01-PLAN.md` | System can embed short dialogue aligned to action beats into segment prompts. | ✓ SATISFIED | Dialogue is extracted at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L81) and fed into prompt/rhythm output at [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L121). |
| `SHOT-01` | `02-01-PLAN.md` | Multi-shot mode does not auto-create single-shot storyboards up front. | ✓ SATISFIED | The fast-path route persists shot groups only at [multi-shot-drafts/route.ts](/Users/jamiezhao/projects/waoowaoo/src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts#L161). |
| `UI-02` | `02-03-PLAN.md` | Multi-shot script page hides/downgrades unnecessary traditional storyboard fields, buttons, or steps. | ✗ BLOCKED | Script-page copy and review mode downgrade traditional cues at [ScriptViewAssetsPanel.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx#L923) and [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L203), but the primary capsule nav still labels the multi-shot step as storyboard at [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L53). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts` | 53 | Multi-shot nav item reuses `stages.storyboard` label | 🛑 Blocker | The primary workspace nav still presents the confirmation step as generic storyboard, weakening the intended path split. |
| `tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts` | 326 | Test asserts stage ids only, not rendered labels | ⚠️ Warning | The dedicated-label regression slipped through because the test never checks displayed nav copy. |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx` | 27 | Hardcoded stage copy bypasses locale resources | ℹ️ Info | The phase added locale strings for the confirmation boundary, but the component currently renders hardcoded copy instead of consuming them. |

### Human Verification Required

### 1. Multi-Shot Confirmation Label

**Test:** Open a `multi_shot` episode in the live workspace and inspect the top capsule navigation after entering the confirmation step.
**Expected:** The active step should read as a dedicated multi-shot confirmation step, not generic storyboard wording.
**Why human:** This is a user-facing navigation clarity check in the real UI shell.

### 2. Confirmation Review Flow With Real Assets

**Test:** Click `确认并开始绘制` on a real multi-shot episode, verify no video job starts automatically, then confirm each segment’s upload/generate/replace reference actions behave coherently before continuing to `videos`.
**Expected:** Draft creation stops at review, no video submission starts, placeholder segments are clearly repair targets, and the reference actions make sense with real media state.
**Why human:** This depends on actual visual behavior, interaction feel, and end-user comprehension.

### Gaps Summary

Phase 2 substantially achieves the fast-path backend and UI routing goals: the code now generates clip-derived 15-second multi-shot payloads, preserves the traditional branch, inserts a review boundary before videos, and avoids auto-creating single-shot storyboards. The remaining gap is user-facing but real: the primary workspace capsule nav still labels the multi-shot branch as generic storyboard, so the dedicated confirmation step is not fully surfaced where users navigate the flow.

That gap blocks a clean pass because Phase 2 explicitly introduced a separate confirmation stage and corresponding label resources. Until the active nav uses the dedicated `multiShotStoryboard` label, `UI-02` remains only partially achieved.

---

_Verified: 2026-04-19T03:48:58Z_  
_Verifier: Claude (gsd-verifier)_
