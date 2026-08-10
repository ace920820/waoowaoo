# Phase 08: 新关键帧生成与版本选择 - Research

**Researched:** 2026-08-10
**Domain:** Remake Shot 图片生成、追加版本、分镜/成片 UI 适配
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 翻拍工作台阶段顺序扩展为“Prompt 分析 → 分镜 → 成片”。Phase 8 同时挂载原版分镜和成片的真实页面，不使用静态占位页。
- **D-02:** Phase 8 完整启用分镜图片生成；成片页读取真实 Shot、采用关键帧、Video Prompt、资产和模型配置，但真实视频生成按钮保持禁用并明确标示 Phase 9 启用边界。
- **D-03:** Prompt、分镜和成片页面始终可以自由进入。页面不得用严格顺序锁隐藏内容；具体操作按现有门禁禁用并展示缺失原因。
- **D-04:** Prompt 页面保留顶部阶段导航，并增加明确的“进入分镜”动作；动作旁展示当前可生成 Shot 数与总 Shot 数，不在批准最后一个 Prompt 后自动跳转。
- **D-05:** 分镜页和成片页原样保留原版页面中的资产库和项目配置入口及功能，不创建翻拍专用的简化资产选择器或第二套配置面板。
- **D-06:** 一个翻拍 Shot 在分镜页中呈现为一个双层 Shot 区块，不把 Start、Middle、End 保存或解释成三个独立 Shot。
- **D-07:** 上层“原始动作参考”固定展示当前 Shot revision 的原始 Start / Middle / End 三张卡。原始帧不可被生成图片覆盖，每张卡展示其图片 Prompt 的批准/失效状态和“用于生成”选择控件。
- **D-08:** 用户首次进入 Shot 时不预选任何 Prompt，必须明确选择至少一个已批准的 Start / Middle / End 图片 Prompt。选择结果持久化并在再次进入时恢复；未批准或已失效 Prompt 不可选且必须显示原因。
- **D-09:** 下层“新画面参考”为每个已选择 Prompt 建立独立生成槽位，并复用原版分镜页的图片生成卡能力：模型、允许参数、参考资产、候选数量、任务状态、候选查看、重新生成和采用。
- **D-10:** 已采用的新图片是下一阶段视频生成的主要画面参考；原始三帧不是等待替换的版本，而是永久保留的动作和画面变化证据。
- **D-11:** Shot 审核确认后，系统按 Start → Middle → End 固定顺序自动生成带位置与时间戳标识的横向三格“分镜动作表”，将其作为可追溯派生资产缓存到对象存储。Shot revision 或原始关键帧变化时，旧动作表保留但失效，并为新 revision 生成新版。
- **D-12:** Phase 9 的视频任务同时接收“已采用的新画面参考”和“当前 revision 的原始三帧动作表”；页面和任务必须区分主要画面参考与辅助动作参考，不能混为同一种版本。
- **D-13:** 分镜页和成片页共享当前项目的资产库、模型设置和项目配置；配置变更在两个页面使用同一事实来源，不为每个 Shot 复制一套长期配置。
- **D-14:** 每次生成任务提交时，冻结当次模型、能力参数、参考资产、Prompt 版本、Shot revision 和候选数量快照。之后修改项目配置不得改变旧任务或旧输出的可复现记录。
- **D-15:** 生成参数、门禁和缺失状态在首版全部沿用原版分镜和成片页面的现有配置与状态表达；只增加 Remake Shot/Prompt/Version 数据适配和 Phase 8/9 功能启用边界，不另行设计翻拍专用规则。
- **D-16:** 候选数量沿用原版分镜页能力。项目配置可以指定默认候选数量，用户可在每次生成前手动覆盖；覆盖值只影响本次任务并写入任务快照，不回写项目默认值。
- **D-17:** 同一次任务的多张输出属于一个生成批次，每张候选都是不可变版本。重新生成追加新批次，不覆盖旧 Prompt、旧图片、旧任务、旧采用记录或旧批次。
- **D-18:** 页面使用“当前采用主预览 + 按生成批次排列的候选缩略图 + 双图比较”结构。用户可比较原始帧与候选，也可比较任意两个候选。
- **D-19:** Start、Middle、End 每个已选择 Prompt 槽位最多采用一个生成版本，因此一个 Shot 最多有三张当前采用的新画面参考。Phase 9 按所选视频模型能力使用合法子集，并明确展示实际输入，不能静默丢弃或伪造不支持的帧。
- **D-20:** 点击候选只改变预览/比较对象，不改变当前采用指针。用户必须点击“采用此版本”才正式采用；已有采用版本被替换前需明确提示，旧版本继续保留在历史中。

### the agent's Discretion

- Remake Shot 到原版分镜/成片页面所需 view model、adapter 和组件 props 的精确拆分，只要不复制一套 Novel Promotion 持久化对象，也不改变上述领域语义。
- 双图比较使用 modal、drawer 或页面内展开的具体形式，以及缩略图批次的响应式排列。
- Phase 8 成片页禁用视频生成控件的精确提示文案和视觉状态，但页面必须继续可浏览、可配置并显示真实缺失项。

### Deferred Ideas (OUT OF SCOPE)

- Phase 9：启用真实视频生成、视频候选版本比较与采用，并按模型能力展示实际使用的主参考图和动作表输入。
- Phase 10：跨 Shot 批量生成、受控并发、取消、失败项重试和恢复。
- 根据真实翻拍使用反馈改造分镜与成片页面，而不是在首次接入阶段预先重构。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| KFRM-01 | 使用采用图片 Prompt 经现有网关生成 Start/Middle/End | 新 Remake image Task/worker 复用 gateway、Task、storage，输入必须绑定 adopted Prompt 和 slot。 |
| KFRM-02 | 选择模型、尺寸、质量、参考资产和允许参数 | 调用项目配置和 capability resolver；提交时冻结 resolved options。 |
| KFRM-03 | 追加不可变版本并记录关系 | 新 batch/candidate/adopted-pointer 数据模型、Task 与 provenance 快照。 |
| KFRM-04 | 比较原始帧与版本，并每位置采用一个 | 预览 state 与服务端 adopted pointer 分离；比较不写入。 |
| KFRM-05 | 改 Prompt 后重新生成但保留历史 | 以 adopted PromptVersion ID 和 Shot revision 建任务快照，永不更新候选内容。 |
| KFRM-06 | 只需要 Start/End 或不支持 Middle 时显示真实合同 | Snapshot 明确 slots 与模型 capability，不合成缺失帧。 |
| KFRM-07 | 未批准 Prompt 不进默认批量且列为缺失项 | 服务端 eligibility projection；本阶段只做缺失项投影，不实现 Phase 10 批量调度。 |
</phase_requirements>

## Summary

本阶段应新增 Remake 专属的图片生成和版本域，而不是尝试将 `RemakeShot` 塞入 Novel Promotion 的 Episode/Storyboard/Panel 数据链。原版 `StoryboardStage` 与 `VideoStageRoute` 都从 Novel Promotion workspace context 获取 episode、panels、storyboards 和运行时回调；它们不是可直接接收 Remake snapshot 的纯页面入口。[VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/StoryboardStage.tsx:8-30`; `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx:10-46`]

可复用的是同一层面的视觉和基础设施：Glass UI、图片候选展示、模型能力解析、项目资产库/配置入口、Task drawer、现有图片 gateway、对象存储和 Worker 生命周期。原版 Panel worker 会把候选写进 `NovelPromotionPanel.imageUrl` / `candidateImages`，因此不能作为 Remake 的持久化实现；应抽取或复用其“配置解析 -> 生成 -> 上传”的基础能力，随后由 Remake 服务将不可变批次和候选写入自己的表。[VERIFIED: `src/lib/workers/handlers/panel-image-task-handler.ts:248-254,335-378`]

**Primary recommendation:** 以 `RemakeKeyframeGenerationTrack -> RemakeKeyframeGenerationBatch -> RemakeKeyframeCandidateVersion` 追加模型实现每个 `(shot, revision, slot)` 的采用指针；在 adapter/view-model 层复用原版页面的卡片能力和资产/配置入口，绝不复制 Novel Promotion 实体。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| 分镜/成片导航与双层 Shot 呈现 | Browser / Client | Frontend Server | URL stage 和预览是交互状态；snapshot 是服务端事实。 [VERIFIED: `RemakeWorkbench.tsx:13-31,53-71`; `service.ts:84-175`] |
| Prompt 选择、资格与 adopted pointer | API / Backend | Database / Storage | 不可用 Prompt 不能被客户端绕过，采用必须由服务端事务更新。 [VERIFIED: `prompt/service.ts:35-37,273-318`; `schema.prisma:586-637`] |
| 图片生成、进度、重试 | API / Backend | Worker / Queue | API 仅提交 Task；图片生成和上传属于后台 Worker。 [VERIFIED: `task/types.ts:121-164`; `queues.ts:101-113`; `panel-image-task-handler.ts:200-385`] |
| 批次/候选/provenance 持久化 | Database / Storage | API / Backend | 版本、任务快照和对象存储 asset 必须可刷新恢复。 [VERIFIED: `schema.prisma:512-657`; `service.ts:84-175`] |
| 动作表派生媒体 | Worker / Queue | Database / Storage | 生成横向合成图和上传属于异步媒体处理，revision/status/provenance 属于持久化。 [ASSUMED] |
| Phase 8 成片浏览与禁用提交 | Browser / Client | API / Backend | 页面读取真实 inputs；禁用是 UI 边界，服务端仍不得暴露视频提交。 [VERIFIED: `08-CONTEXT.md` D-02; `VideoStageRoute.tsx:23-46`] |

## Standard Stack

### Core

| Library / existing module | Version | Purpose | Why Standard |
|---|---:|---|---|
| Next.js / React | `15.5.7` / `19.1.2` | Remake stage、route handler 与 client UI | 已是项目应用运行时，无新增依赖。 [VERIFIED: `package.json` dependencies inspected 2026-08-10] |
| Prisma / MySQL | `6.19.2` | append-only versions、adopted pointers、迁移 | 当前 Remake/Priority domain 的唯一持久化路径。 [VERIFIED: `package.json` dependencies inspected 2026-08-10; `schema.prisma:445-657`] |
| BullMQ / Redis | `5.67.3` | 异步图片任务与恢复 | 已有 image queue、Task 生命周期和队列路由。 [VERIFIED: `package.json` dependencies inspected 2026-08-10; `queues.ts:1-124`] |
| 现有 model gateway + storage | in-repo | 模型调用、参考图归一化、对象存储输出 | 避免直接 provider 调用和第二条资产路径。 [VERIFIED: `panel-image-task-handler.ts:8-20,248-254,343-357`] |

### Supporting

| Existing module | Purpose | When to Use |
|---|---|---|
| `resolveProjectModelCapabilityGenerationOptions` | 合并用户 defaults、项目 overrides、当前选择并校验 | 每一个图片提交前，冻结返回的 effective options。 [VERIFIED: `config-service.ts:193-239`] |
| `ImageSection` / candidate components | 图片、任务状态和候选呈现基线 | 只复用展示/交互模式；先解除 Panel-ID 和“选择即确认”的耦合。 [VERIFIED: `ImageSection.tsx:19-43,151-202`; `CandidateSelector.tsx:10-20,139-169`] |
| `RemakePromptTrack` / `RemakePromptVersion` | 已批准 Prompt 的单一来源 | 只读取当前 adopted version 作为可生成输入。 [VERIFIED: `schema.prisma:586-637`; `service.ts:150-160`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Remake generation tables | 复用/伪造 Novel Promotion Panel | 不可接受：原版 worker 会覆盖 Panel 字段，且真实 stage 依赖 Episode/Panel context。 [VERIFIED: `panel-image-task-handler.ts:360-378`; `StoryboardStage.tsx:8-30`] |
| Server adopted pointer | 前端 selected index | 不可接受：刷新、并发提交和预览会混淆；当前 Prompt projection 已区分 latest 与 adopted。 [VERIFIED: `service.ts:150-160`; `prompt/service.ts:309-318`] |

**Installation:** 无。Phase 8 不安装外部包。[VERIFIED: `08-UI-SPEC.md` Registry Safety]

## Package Legitimacy Audit

不适用：本阶段不引入或安装外部 package。[VERIFIED: `08-UI-SPEC.md` Registry Safety]

## Architecture Patterns

### System Architecture Diagram

```text
Remake Prompt stage / Storyboard UI
        | explicit selected approved slots
        v
Remake snapshot + eligibility adapter
        | submit frozen snapshot
        v
Remake keyframe API -> Task -> existing image queue/Worker -> model gateway
        |                                           |
        |                                           v
        |                                     object storage asset
        v
short Prisma transaction: append batch + candidates + provenance
        |
        +--> server-authoritative adopted pointer --refresh--> storyboard main preview
        |
        +--> revision/keyframe change --> invalidate action sheet and affected candidates

Video page (real Remake inputs, Phase 8 read/configure only)
        X video submission disabled until Phase 9
```

### Recommended Project Structure

```text
src/lib/remake-projects/keyframes/
├── contracts.ts          # slot, submission, snapshot and read DTO validation
├── service.ts            # selection, append batch/candidate, adoption, invalidation
├── task-contract.ts      # strict Task payload and dedupe identity
├── action-sheet.ts       # current revision three-frame derived asset
└── adapter.ts            # Remake snapshot -> storyboard/video view model
src/lib/workers/handlers/remake-keyframe-image.ts
src/app/api/remake-projects/[projectId]/keyframes/
src/app/[locale]/workspace/[projectId]/modes/remake/
├── storyboard/
└── video/
tests/unit/remake-projects/keyframe-*.test.ts
tests/integration/api/remake-projects-keyframes-*.test.ts
tests/integration/task/remake-keyframe-*.test.ts
```

### Pattern 1: adapter only at the domain boundary

**What:** `RemakeStoryboardAdapter` owns only view data and callbacks: current revision’s original frames, Prompt track status/adopted version, server selection, batches/candidates/adoption, asset/config launcher, and disabled Phase-9 submit state. It must not materialize Novel Promotion rows. [VERIFIED: `RemakeWorkbench.tsx:27-31,68-71`; `StoryboardStage.tsx:8-30`; `VideoStageRoute.tsx:10-46`]

**When to use:** Mounting either original page capability into Remake. The original Stage route wrappers are too coupled; extract/reuse lower-level presentational components or add a new Remake-specific shell with compatible props. [VERIFIED: `StoryboardStageShell.tsx:8-39`; `ImageSection.tsx:19-43`]

### Pattern 2: immutable task snapshot, append-only batch, explicit adopt

**What:** Submission validates project ownership, current active Shot revision, `RemakePromptTrack.adoptedVersionId`, selected slot and capability options. It serializes model key, resolved options, reference asset IDs, Prompt version ID, Shot revision ID, candidate count and input fingerprint into Task payload/provenance. A worker creates one batch and immutable candidate rows; only an authenticated adoption mutation changes a slot pointer. [VERIFIED: `prompt/contracts.ts:66-85`; `prompt/service.ts:35-37,309-318`; `task/types.ts:153-164`]

**When to use:** Every image generation and regeneration. The source proof for existing immutable Prompt version fields is: `"versionNumber"`, `"inputFingerprint"`, `"inputSnapshot"`, and `"taskId"`. [VERIFIED: `schema.prisma:604-637`]

### Pattern 3: server selection state, client preview state

**What:** A thumbnail click only changes local preview/comparison selection. `adoptCandidate` is a separate API mutation that verifies ownership, current revision and non-invalidated candidate, then transactionally writes the adopted pointer and returns the new snapshot. [VERIFIED: `CandidateSelector.tsx:68-72,107-110,152-165`; `prompt/service.ts:309-318`]

**When to use:** Candidate browsing and two-image comparison. Do not reuse the original selector’s `onConfirm` semantics unchanged because it treats selected candidate as the current Panel image. [VERIFIED: `CandidateSelector.tsx:10-20,139-169`; `panel-image-task-handler.ts:360-378`]

### Pattern 4: revision-bound action-sheet provenance

**What:** Create an action-sheet derivation only after the Shot is review-confirmed; load the active revision’s frame refs in exact `start -> middle -> end` order, upload the generated sheet, and store the source revision/frame references and layout/version in provenance. On keyframe/revision change, create invalidation records without deleting prior output. [VERIFIED: `service.ts:117-169,178-197`; `schema.prisma:512-583`; ordering mapping `start/middle/end` -> `first/middle/last` in `service.ts:142-149`]

**When to use:** The narrowest production tracer is one approved Shot, three stored source frame references and a deterministic generated sheet persisted as a derived asset; no broad batch scheduler, automatic acceptance or Phase-9 video Task is needed. [ASSUMED]

### Anti-Patterns to Avoid

- **Synthetic Novel Promotion rows:** Do not create Episode/Storyboard/Panel rows as a compatibility shim; they become a second source of truth. [VERIFIED: `StoryboardStage.tsx:8-30`; `VideoStageRoute.tsx:10-46`]
- **Reuse Panel overwrite persistence:** Do not write Remake candidates into `imageUrl`, `previousImageUrl` or `candidateImages`; this loses batch history. [VERIFIED: `panel-image-task-handler.ts:360-378`]
- **Adopt on preview:** Do not infer adoption from thumbnail index or task completion. [VERIFIED: `CandidateSelector.tsx:68-72,107-110`; `prompt/service.ts:309-318`]
- **Client-only eligibility:** Do not trust disabled buttons to guard unapproved/invalidated Prompts. [VERIFIED: `prompt/service.ts:48-57`; `08-CONTEXT.md` D-08]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Image provider invocation | direct HTTP/provider branching in Remix API | existing model gateway through image Worker helpers | Existing worker already normalizes references, resolves source and uploads to storage. [VERIFIED: `panel-image-task-handler.ts:8-20,343-357`] |
| Parameter validation | custom if/else capability checks | `resolveProjectModelCapabilityGenerationOptions` | It combines defaults/overrides/runtime selection and rejects invalid model keys/options. [VERIFIED: `config-service.ts:193-239`] |
| Async retries/state | browser polling or API-side long-running generate | Task + BullMQ + Worker lifecycle | Current queues identify image work and retain jobs/status. [VERIFIED: `task/types.ts:3-22,121-164`; `queues.ts:5-124`] |
| Media URL/storage | client-side blob URLs or duplicate asset bucket | existing storage upload and signed media route conventions | Remake snapshot already exposes opaque media routes. [VERIFIED: `service.ts:14-18,142-149`; `panel-image-task-handler.ts:356-357`] |
| Candidate gallery styling | a new visual system | existing ImageSection/CandidateSelector patterns and Glass primitives | UI contract locks existing Glass/UI patterns and no new component registry. [VERIFIED: `08-UI-SPEC.md` Design System; `ImageSection.tsx:151-202`] |

**Key insight:** reuse operational primitives and presentational patterns, not the original business identity or overwrite semantics.

## Common Pitfalls

### Pitfall 1: Original frames become replaceable output

**What goes wrong:** the worker or UI writes a generated image over the current revision’s `first/middle/last` media reference.

**How to avoid:** treat current revision refs as immutable source evidence and persist generated candidates separately; snapshot already maps the stable display slots from those refs. [VERIFIED: `service.ts:142-149`; `schema.prisma:512-534`]

### Pitfall 2: Task completes after upstream revision changes

**What goes wrong:** a long image job attaches to a newer Shot revision.

**How to avoid:** include source revision, Shot revision ID, Prompt version and frame refs in fingerprint; re-read them inside the short persistence transaction and reject stale input. Existing Prompt snapshot/fingerprint pattern proves the expected shape. [VERIFIED: `prompt/contracts.ts:66-85`; `prompt/service.ts:35-37,48-57`]

### Pitfall 3: Original candidate UX conflates preview and mutation

**What goes wrong:** reusing `onConfirmCandidate` makes choosing a thumbnail overwrite the active image.

**How to avoid:** split `selectPreview` from `adoptCandidate`, require the UI-SPEC confirmation when a pointer already exists, then refetch server snapshot. [VERIFIED: `CandidateSelector.tsx:10-20,139-169`; `08-UI-SPEC.md` Candidate, comparison and adoption]

### Pitfall 4: Project defaults mutate old results

**What goes wrong:** a batch detail re-resolves today’s model config and falsely displays it as historical execution.

**How to avoid:** persist the effective options and references in batch provenance at submit time; resolve defaults only for the next submission. [VERIFIED: `config-service.ts:193-239`; `08-CONTEXT.md` D-14]

### Pitfall 5: Phase 8 accidentally enables video generation

**What goes wrong:** a reused `VideoStageRoute` passes live `onGenerateVideo` callbacks.

**How to avoid:** mount real inputs/config/asset controls but inject a disabled submission boundary both client-side and server-side; no VGEN Task type or submit route belongs to this phase. [VERIFIED: `VideoStageRoute.tsx:23-46`; `08-CONTEXT.md` D-02; `REQUIREMENTS.md:61-67`]

### Pitfall 6: Action sheet lacks reproducible provenance

**What goes wrong:** only its asset URL is retained, so Phase 9 cannot prove which revision and source frames made it.

**How to avoid:** store exact ordered refs, timestamps, revision ID and derivation schema with the output; retain prior rows as invalidated. [VERIFIED: `schema.prisma:553-583`; `service.ts:142-149,178-197`]

## Code Examples

### Existing capability resolution boundary

```ts
const options = await resolveProjectModelCapabilityGenerationOptions({
  projectId,
  userId,
  modelType: 'image',
  modelKey,
  runtimeSelections,
})
```

The literal `"image"` is part of the declared union `"llm" | "image" | "video"`; the resolver rejects invalid model keys and invalid options before returning the resolved record. [VERIFIED: `src/lib/config-service.ts:193-221,224-239`]

### Existing input provenance shape to mirror

```ts
const inputSnapshot = {
  projectId,
  remakeProjectId,
  shotId,
  stableKey,
  sourceRevision,
  shotRevision,
  shotRevisionId,
  keyframeMediaRefs,
}
```

These property names are the verbatim `promptInputSnapshotSchema` contract; Phase 8 adds Prompt version, selected slot, effective options, asset references and candidate count rather than dropping the revision identity. [VERIFIED: `src/lib/remake-projects/prompt/contracts.ts:66-75`]

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Panel `imageUrl` plus one `candidateImages` list | Remake Prompt tracks already expose latest/adopted/needs-review projection | Phase 8 should carry the adopted-pointer pattern into image output rather than copy the Panel overwrite model. [VERIFIED: `panel-image-task-handler.ts:360-378`; `service.ts:150-160`] |

**Deprecated/outdated:** Directly calling the model from a route is not compatible with the existing Task/Worker architecture; reuse `TaskJobData` and queue routing. [VERIFIED: `task/types.ts:121-164`; `queues.ts:101-113`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A dedicated image-composition worker can produce and upload the three-frame action sheet with the current media/storage layer. | Architectural Responsibility / Pattern 4 | Planner must select the existing image composition helper or create a narrow deterministic implementation. |
| A2 | The minimal durable schema is a track/batch/candidate model; exact Prisma model names and relations remain implementation discretion. | Summary / Pattern 2 | Migration shape may need adjustment to local naming and query requirements. |

## Open Questions (RESOLVED)

1. **现有资产库和项目配置入口的最小可复用组件边界是什么？ — RESOLVED**
   - Use `WorkspaceTopActions` as the shared launcher, `WorkspaceAssetLibraryModal` as the complete `AssetsStage` host, `SettingsModal` for the existing configuration UI, and `useUpdateProjectConfig(projectId)` for the canonical project mutation/invalidation path. `WorkspaceTopActions` accepts only open/refresh callbacks and labels, while `WorkspaceAssetLibraryModal` accepts explicit project/loading/focus props, so a thin Remake controller can reuse the full capabilities without importing a Novel Promotion stage route or creating a second store. [VERIFIED: `WorkspaceTopActions.tsx:7-49`; `WorkspaceAssetLibraryModal.tsx:8-78`; `ConfigEditModal.tsx:41-159`; `useProjectConfigMutations.ts:83-125`]

2. **动作表的 renderer should use which existing composition primitive? — RESOLVED**
   - Use the installed `sharp@0.34.5` primitive in a narrow image Worker helper: normalize each source buffer with Sharp, use `withLabelBar`/the existing SVG label pattern for position and timestamp text, compose the three normalized cells horizontally with `sharp(...).composite(...)`, then persist through `uploadImageSourceToCos`. This is an in-repo composition/storage path, requires no package install, and keeps the renderer deterministic and revision-provenanced. [VERIFIED: `package.json:160`; `src/lib/image-label.ts:2-42`; `src/lib/workers/utils.ts:641-666`; `src/lib/workers/utils.ts:669-675`]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | Next/Worker/tests | yes | `v22.22.3` | — |
| npm | dependency/test commands | yes | `10.9.8` | — |
| Docker | MySQL/Redis integration test bootstrap | yes | `29.3.0` | focused unit tests |
| Redis CLI | queue diagnostics | yes | `8.6.2` | application test fakes |
| MySQL CLI | database diagnostics | yes | `9.6.0` | Prisma test bootstrap |

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest `2.1.8`; Playwright `1.62.1` for route UI smoke. [VERIFIED: `package.json` dependencies inspected 2026-08-10; `tests/e2e/remake-prompt.spec.ts:1-35`] |
| Config file | `vitest.config.ts` [VERIFIED: `.planning/codebase/TESTING.md`] |
| Quick run command | `npx vitest run tests/unit/remake-projects tests/unit/worker` [ASSUMED] |
| Full suite command | `npm run test:all` [VERIFIED: `package.json` scripts inspected 2026-08-10] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| KFRM-01/02 | adopted Prompt and valid capability config create Remake image Task | unit + API | `npx vitest run tests/unit/remake-projects/remake-keyframe-task-contract.test.ts tests/integration/api/remake-projects-keyframes-submit.test.ts` | Wave 0 |
| KFRM-03/05 | append batch/candidates and preserve old adopted pointer | integration DB | `npx vitest run tests/integration/remake-projects/keyframe-service.test.ts` | Wave 0 |
| KFRM-04 | preview differs from adopt; adopt returns server pointer | API + UI | `npx vitest run tests/integration/api/remake-projects-keyframes-adopt.test.ts tests/unit/remake-projects/remake-keyframe-stage.test.tsx` | Wave 0 |
| KFRM-06 | selected slots and video capability display no synthetic middle frame | unit + UI | `npx vitest run tests/unit/remake-projects/remake-video-input-contract.test.ts` | Wave 0 |
| KFRM-07 | unapproved/invalidated Prompt rejected and projects as missing | service + API | `npx vitest run tests/integration/remake-projects/keyframe-eligibility.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** focused unit/API command for changed contract.
- **Per wave merge:** `npm run typecheck` plus relevant integration tests.
- **Phase gate:** `npm run test:guards`, focused integration/task tests, and Playwright desktop/mobile no-overflow route smoke.

### Wave 0 Gaps

- [ ] `tests/unit/remake-projects/remake-keyframe-task-contract.test.ts` — immutable input/eligibility/slot contract.
- [ ] `tests/integration/remake-projects/keyframe-service.test.ts` — batch append/adoption/invalidation transaction.
- [ ] `tests/integration/api/remake-projects-keyframes-*.test.ts` — authorization and non-optimistic adoption API behavior.
- [ ] `tests/unit/remake-projects/remake-keyframe-stage.test.tsx` — original-vs-new layers, disabled reasons and no preview-adopt coupling.
- [ ] `tests/e2e/remake-keyframes.spec.ts` — real storyboard/video stages at `1440px` and `390px`, including disabled Phase-9 submit.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | authorize every Remake project/task/track mutation through current authenticated project ownership. [VERIFIED: `service.ts:84-92`; `tests/integration/api/remake-projects-prompt-review.test.ts:68-73`] |
| V3 Session Management | yes | existing NextAuth/session route path; no phase-specific session model. [VERIFIED: `.planning/codebase/INTEGRATIONS.md`] |
| V4 Access Control | yes | server validates candidate/track belongs to requested Project and user before adopt/read. [VERIFIED: `tests/integration/api/remake-projects-prompt-review.test.ts:68-85`] |
| V5 Input Validation | yes | Zod strict task/input contracts and capability resolver. [VERIFIED: `prompt/contracts.ts:66-85`; `prompt/task-contract.ts:7-83`; `config-service.ts:193-221`] |
| V6 Cryptography | no new crypto | use existing fingerprint hashing; do not invent signature/encryption logic. [VERIFIED: `prompt/service.ts:2,35-37`] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Cross-project candidate adoption/read | Elevation / Information disclosure | authenticated Project ownership checks and candidate-to-shot-to-project relation validation. [VERIFIED: `tests/integration/api/remake-projects-prompt-review.test.ts:68-85`] |
| Stale task writes to new revision | Tampering | immutable fingerprint and transactional current-state recheck. [VERIFIED: `prompt/service.ts:35-37,48-57`] |
| Untrusted provider/reference URL | Tampering | existing reference-image normalization and storage upload boundary. [VERIFIED: `panel-image-task-handler.ts:13,252-254,343-357`] |
| Capability/provider guessing | Tampering / Reliability | strict model key parser plus centralized resolver; no silent fallback. [VERIFIED: `config-service.ts:193-221`; `.planning/codebase/CONVENTIONS.md`] |

## Sources

### Primary (HIGH confidence)

- `prisma/schema.prisma` — Remake Shot/revision/output/provenance/invalidation and Prompt track/version contracts.
- `src/lib/remake-projects/service.ts` and `src/lib/remake-projects/prompt/*` — current snapshot, frame mapping, adopted Prompt and input fingerprint patterns.
- `src/lib/workers/handlers/panel-image-task-handler.ts` — existing image gateway, candidate count, reference normalization, upload and Panel overwrite limitation.
- `src/lib/config-service.ts` and `src/lib/model-config-contract.ts` — current configuration/capability resolution contract.
- `08-CONTEXT.md` and `08-UI-SPEC.md` — locked product and UI boundaries.

### Secondary (MEDIUM confidence)

- `.planning/codebase/*.md` — repository architecture, conventions and test topology.

### Tertiary (LOW confidence)

- None beyond A1-A2 in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components are installed/in-repo and source inspected.
- Architecture: HIGH — phase decisions plus active Stage, Task, persistence and Worker code inspected.
- Pitfalls: HIGH — derived from current overwrite, Stage coupling and adopted-pointer code paths.

**Research date:** 2026-08-10
**Valid until:** 2026-09-09
