---
phase: 02-multi-shot-fast-path
verified: 2026-04-19T04:57:31Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/11
  gaps_closed:
    - "Workspace navigation surfaces the dedicated multi-shot confirmation step with its own label."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "在真实 multi_shot 剧集里点击“确认并开始绘制”，观察 capsule nav、确认页停留、以及逐段参考操作"
    expected: "进入后停留在 `multi-shot-storyboard`，顶部显示专用“多镜头确认”标签；确认页展示真实派生片段，并且每段可见上传/生成/替换参考动作，且不会自动进入 videos"
    why_human: "需要真实 workspace 的交互壳层、React Query 刷新时序、文件上传/参考板生成按钮的可用性与视觉呈现确认，静态代码与单测不能完全覆盖"
---

# Phase 2: Multi-Shot Fast Path Verification Report

**Phase Goal:** Make multi-shot mode the real fast path by skipping the bloated traditional storyboard-script generation and directly producing 15-second multi-shot generation payloads, while keeping traditional mode alive.
**Verified:** 2026-04-19T04:57:31Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | multi-shot mode now derives finer 15s segment drafts instead of keeping coarse clip-sized groups | ✓ VERIFIED | [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L212) derives windows with `Math.ceil(duration / 15)` and [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L247) emits one draft per derived window; [episode-draft-builder.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts#L59) proves `2` coarse `60s` clips become `8` ordered drafts. |
| 2 | multi-shot confirmation/storyboard stage is a real intermediate step before videos and is reachable from the script page flow | ✓ VERIFIED | [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L134) awaits `ensureEpisodeMultiShotDrafts()` then routes to `multi-shot-storyboard`; [useWorkspaceProjectSnapshot.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot.ts#L33) normalizes stale `storyboard` URLs to the multi-shot stage; [WorkspaceStageContent.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx#L20) renders the dedicated stage component. |
| 3 | confirmation stage renders per-segment review and reference image actions before final video generation | ✓ VERIFIED | [MultiShotStoryboardStage.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx#L62) mounts [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L203) in `review` mode; the review branch renders per-segment prompt/review cards and upload/generate/replace actions at [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L247) and [ShotGroupVideoSection.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx#L351); [multi-shot-storyboard-stage.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts#L125) asserts these affordances and absence of video-generation CTAs. |
| 4 | back navigation and labels reflect the dedicated multi-shot confirmation path | ✓ VERIFIED | [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L51) now labels the multi-shot capsule with `t('stages.multiShotStoryboard')`; translations exist in [stages.json](/Users/jamiezhao/projects/waoowaoo/messages/zh/stages.json#L1) and [stages.json](/Users/jamiezhao/projects/waoowaoo/messages/en/stages.json#L1); [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L36) sends back navigation to `multi-shot-storyboard` for multi-shot mode; [multi-shot-stage-routing.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts#L300) locks both the label and the back-nav behavior. |
| 5 | traditional mode remains intact | ✓ VERIFIED | [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L135) keeps `traditional` on `runScriptToStoryboardFlow`; [useWorkspaceStageNavigation.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts#L55) preserves `stages.storyboard` for traditional; [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L37) returns traditional users to `storyboard`; [multi-shot-stage-routing.test.ts](/Users/jamiezhao/projects/waoowaoo/tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts#L196) covers the classic branch. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/lib/novel-promotion/multi-shot/episode-draft-builder.ts` | 派生真实 15s segment draft 集合 | ✓ VERIFIED | 按 clip 时长切段并输出 `segmentKey`、`segmentOrder`、prompt、dialogue、rhythm。 |
| `src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts` | 按派生 segment 持久化/复用 shot groups | ✓ VERIFIED | 以 `segmentKey` 为主复用键，`summary.totalSegments` 等于派生段数。 |
| `src/lib/novel-promotion/stage-readiness.ts` | 让 draft shot groups 足以点亮确认阶段 | ✓ VERIFIED | `draftMetadata.segmentKey` 即可判定 storyboard readiness。 |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts` | 多镜头确认专用 nav label | ✓ VERIFIED | multi-shot 分支使用 `stages.multiShotStoryboard`。 |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx` | 真实确认页 shell | ✓ VERIFIED | 显示确认边界文案，并以 `mode="review"` 挂载 review surface。 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `useWorkspaceStageRuntime.ts` | `multi-shot-drafts` flow | `ensureEpisodeMultiShotDrafts()` then `handleStageChange('multi-shot-storyboard')` | ✓ WIRED | 脚本页 CTA 先造 drafts，再进入中间确认阶段。 |
| `useNovelPromotionWorkspaceController.ts` | `stage-readiness.ts` | `resolveStageArtifactsEpisodeData(...)` + `resolveEpisodeStageArtifacts(...)` | ✓ WIRED | 新 query 数据会进入 shell readiness，而不是只看旧 prop。 |
| `useWorkspaceStageNavigation.ts` | `messages/*/stages.json` | `t('stages.multiShotStoryboard')` | ✓ WIRED | 之前失败的标签链路已修复。 |
| `MultiShotStoryboardStage.tsx` | `ShotGroupVideoSection.tsx` | `mode="review"` | ✓ WIRED | `ShotGroupVideoSection` 被直接导入并在确认页以 review 模式渲染。 |
| `VideoStageRoute.tsx` | `multi-shot-storyboard` | `onBack` | ✓ WIRED | 视频页返回 dedicated confirmation path。 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `episode-draft-builder.ts` | derived draft windows | clip `duration` / `start` / `end` | Yes | ✓ FLOWING |
| `multi-shot-drafts/route.ts` | `drafts` -> persisted `shotGroups` | `buildEpisodeMultiShotDrafts(...)` + Prisma create/update | Yes | ✓ FLOWING |
| `MultiShotStoryboardStage.tsx` | `shotGroups` | `useWorkspaceEpisodeStageData()` | Yes | ✓ FLOWING |
| `ShotGroupVideoSection.tsx` | visible review cards | `shotGroups` + parsed `draftMetadata` | Yes | ✓ FLOWING |
| `useWorkspaceStageNavigation.ts` | storyboard step status/label | `stageArtifacts.hasStoryboard` + mode branch | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| 2 个粗 clip 会派生 8 个 15s drafts | `npx vitest run tests/unit/novel-promotion/multi-shot/episode-draft-builder.test.ts` | `6` tests passed | ✓ PASS |
| route 按 segment 级持久化并复用 | `npx vitest run tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts` | `3` tests passed | ✓ PASS |
| routing/nav/confirmation UI 保持专用路径 | `npx vitest run tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts` | `12` tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `MODE-03` | `02-02-PLAN.md`, `02-05-PLAN.md` | 用户可以切换该集为传统模式 | ✓ SATISFIED | runtime、nav、back-nav 都保留 `traditional` 分支，见 [useWorkspaceStageRuntime.ts](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts#L135) 和 [VideoStageRoute.tsx](/Users/jamiezhao/projects/waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx#L36). |
| `TRAD-01` | `02-02-PLAN.md`, `02-05-PLAN.md` | 传统模式继续走经典链路 | ✓ SATISFIED | `traditional` 仍执行 `script -> storyboard -> videos`。 |
| `TRAD-02` | `02-02-PLAN.md`, `02-05-PLAN.md` | 传统模式保留既有 storyboard 能力与入口 | ✓ SATISFIED | traditional nav label/back route 未变。 |
| `MSHT-01` | `02-01-PLAN.md` | 多镜头模式默认不预生成传统分镜剧本 | ✓ SATISFIED | draft route 只创建 shot groups，不创建 storyboard。 |
| `MSHT-02` | `02-01-PLAN.md`, `02-04-PLAN.md` | 每个 15 秒片段生成一个视频单元 | ✓ SATISFIED | builder 按 15 秒窗口派生，见 [episode-draft-builder.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/novel-promotion/multi-shot/episode-draft-builder.ts#L212). |
| `MSHT-03` | `02-01-PLAN.md`, `02-04-PLAN.md` | prompt 基于剧本页内容与片段结构 | ✓ SATISFIED | narrative prompt 组合了 summary/location/characters/props/content/dialogue。 |
| `MSHT-04` | `02-01-PLAN.md`, `02-04-PLAN.md` | 每段最多 9 镜头并体现节奏推进 | ✓ SATISFIED | `expectedShotCount` capped at `9`; rhythm guidance 按 slot 生成。 |
| `MSHT-05` | `02-01-PLAN.md`, `02-04-PLAN.md` | prompt 是模型可直接使用的细化描述 | ✓ SATISFIED | `剧情目标/场景与角色/镜头推进/对白嵌入/节奏提示` 组合直接进入 `groupPrompt/videoPrompt`。 |
| `MSHT-06` | `02-01-PLAN.md`, `02-04-PLAN.md` | 台词嵌入到对应片段 prompt | ✓ SATISFIED | `extractScreenplayDialogueItems` + `embeddedDialogue` + `narrativePrompt`。 |
| `SHOT-01` | `02-01-PLAN.md`, `02-04-PLAN.md` | 多镜头模式不自动创建单镜头 storyboard | ✓ SATISFIED | integration test 仍断言 route 不创建 storyboard rows。 |
| `UI-02` | `02-03-PLAN.md`, `02-05-PLAN.md` | 绕开不必要的传统 storyboard 步骤与文案 | ✓ SATISFIED | dedicated nav label、review stage、无视频 CTA、脚本页与确认页文案都已切到 fast-path 语义。 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx` | 27 | 标题/按钮文案仍为硬编码而非 i18n 资源 | ℹ️ Info | 不阻塞 Phase 2 目标，但后续国际化一致性仍有改进空间。 |

### Human Verification Required

### 1. Multi-Shot Confirmation In Live Workspace

**Test:** 在真实 `multi_shot` 剧集的 script 页点击“确认并开始绘制”，等待 draft 创建与 query 刷新完成后，检查 capsule nav、当前 stage、分段列表和每段参考动作。
**Expected:** 页面停留在 `multi-shot-storyboard`；顶部步骤名称显示“多镜头确认”；确认页展示真实派生的 segment 列表；无参考段显示“上传参考图/生成参考板”，已有参考段显示“替换参考图/替换参考板”；没有自动跳转到 `videos`。
**Why human:** 这涉及真实 UI 壳层、refetch 时序、文件选择器/图片生成动作的端到端可用性与视觉理解，静态验证无法完全替代。

### Gaps Summary

本次 re-verification 已确认上次唯一 gap 已闭合：`multi-shot-storyboard` 在主导航中现在使用专用标签，而不是通用 storyboard 文案。与此同时，02-04 的 segment 级修复也已真正落地，builder 和 route 不再停留在“一条粗 clip 对一条 draft”的旧形态，而是按 15 秒窗口派生并持久化独立 segment。

自动验证下，Phase 2 的目标已达成，没有剩余代码级 gaps。由于仍需要在真实 workspace 里确认专用确认页的交互壳层和参考动作最终表现，本报告状态为 `human_needed`，而不是 `passed`。

---

_Verified: 2026-04-19T04:57:31Z_
_Verifier: Claude (gsd-verifier)_
