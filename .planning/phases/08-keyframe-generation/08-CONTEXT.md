# Phase 8: 新关键帧生成与版本选择 - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段在现有视频翻拍工作台中，把原版“分镜”和“成片”真实页面接到“Prompt 分析”之后，并完成基于已批准图片 Prompt 的新关键帧生成、候选比较、版本保留和人工采用闭环。

Phase 8 只启用真实图片生成。“成片”页面在本阶段完成真实数据接入、浏览、配置和缺失状态呈现，但视频生成操作保持禁用；使用采用关键帧与已批准 Video Prompt 生成视频仍属于 Phase 9。Phase 8 不新增批量编排、自动接受结果或自动质量循环。

</domain>

<decisions>
## Implementation Decisions

### 页面接入与阶段边界
- **D-01:** 翻拍工作台阶段顺序扩展为“Prompt 分析 → 分镜 → 成片”。Phase 8 同时挂载原版分镜和成片的真实页面，不使用静态占位页。
- **D-02:** Phase 8 完整启用分镜图片生成；成片页读取真实 Shot、采用关键帧、Video Prompt、资产和模型配置，但真实视频生成按钮保持禁用并明确标示 Phase 9 启用边界。
- **D-03:** Prompt、分镜和成片页面始终可以自由进入。页面不得用严格顺序锁隐藏内容；具体操作按现有门禁禁用并展示缺失原因。
- **D-04:** Prompt 页面保留顶部阶段导航，并增加明确的“进入分镜”动作；动作旁展示当前可生成 Shot 数与总 Shot 数，不在批准最后一个 Prompt 后自动跳转。
- **D-05:** 分镜页和成片页原样保留原版页面中的资产库和项目配置入口及功能，不创建翻拍专用的简化资产选择器或第二套配置面板。— **Reversibility:** costly — 两个页面及后续任务输入都将依赖这套共享入口，改为另一套配置会涉及页面、任务合同和持久化迁移。

### 双层 Shot 区块
- **D-06:** 一个翻拍 Shot 在分镜页中呈现为一个双层 Shot 区块，不把 Start、Middle、End 保存或解释成三个独立 Shot。
- **D-07:** 上层“原始动作参考”固定展示当前 Shot revision 的原始 Start / Middle / End 三张卡。原始帧不可被生成图片覆盖，每张卡展示其图片 Prompt 的批准/失效状态和“用于生成”选择控件。
- **D-08:** 用户首次进入 Shot 时不预选任何 Prompt，必须明确选择至少一个已批准的 Start / Middle / End 图片 Prompt。选择结果持久化并在再次进入时恢复；未批准或已失效 Prompt 不可选且必须显示原因。
- **D-09:** 下层“新画面参考”为每个已选择 Prompt 建立独立生成槽位，并复用原版分镜页的图片生成卡能力：模型、允许参数、参考资产、候选数量、任务状态、候选查看、重新生成和采用。
- **D-10:** 已采用的新图片是下一阶段视频生成的主要画面参考；原始三帧不是等待替换的版本，而是永久保留的动作和画面变化证据。
- **D-11:** Shot 审核确认后，系统按 Start → Middle → End 固定顺序自动生成带位置与时间戳标识的横向三格“分镜动作表”，将其作为可追溯派生资产缓存到对象存储。Shot revision 或原始关键帧变化时，旧动作表保留但失效，并为新 revision 生成新版。— **Reversibility:** costly — 动作表会成为 Phase 9 视频任务的稳定输入资产，改变组成或身份合同需要迁移既有派生资产和 provenance。
- **D-12:** Phase 9 的视频任务同时接收“已采用的新画面参考”和“当前 revision 的原始三帧动作表”；页面和任务必须区分主要画面参考与辅助动作参考，不能混为同一种版本。

### 资产、配置与任务快照
- **D-13:** 分镜页和成片页共享当前项目的资产库、模型设置和项目配置；配置变更在两个页面使用同一事实来源，不为每个 Shot 复制一套长期配置。
- **D-14:** 每次生成任务提交时，冻结当次模型、能力参数、参考资产、Prompt 版本、Shot revision 和候选数量快照。之后修改项目配置不得改变旧任务或旧输出的可复现记录。
- **D-15:** 生成参数、门禁和缺失状态在首版全部沿用原版分镜和成片页面的现有配置与状态表达；只增加 Remake Shot/Prompt/Version 数据适配和 Phase 8/9 功能启用边界，不另行设计翻拍专用规则。

### 候选版本比较与采用
- **D-16:** 候选数量沿用原版分镜页能力。项目配置可以指定默认候选数量，用户可在每次生成前手动覆盖；覆盖值只影响本次任务并写入任务快照，不回写项目默认值。
- **D-17:** 同一次任务的多张输出属于一个生成批次，每张候选都是不可变版本。重新生成追加新批次，不覆盖旧 Prompt、旧图片、旧任务、旧采用记录或旧批次。
- **D-18:** 页面使用“当前采用主预览 + 按生成批次排列的候选缩略图 + 双图比较”结构。用户可比较原始帧与候选，也可比较任意两个候选。
- **D-19:** Start、Middle、End 每个已选择 Prompt 槽位最多采用一个生成版本，因此一个 Shot 最多有三张当前采用的新画面参考。Phase 9 按所选视频模型能力使用合法子集，并明确展示实际输入，不能静默丢弃或伪造不支持的帧。
- **D-20:** 点击候选只改变预览/比较对象，不改变当前采用指针。用户必须点击“采用此版本”才正式采用；已有采用版本被替换前需明确提示，旧版本继续保留在历史中。

### the agent's Discretion
- Remake Shot 到原版分镜/成片页面所需 view model、adapter 和组件 props 的精确拆分，只要不复制一套 Novel Promotion 持久化对象，也不改变上述领域语义。
- 双图比较使用 modal、drawer 或页面内展开的具体形式，以及缩略图批次的响应式排列。
- Phase 8 成片页禁用视频生成控件的精确提示文案和视觉状态，但页面必须继续可浏览、可配置并显示真实缺失项。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 产品边界与上游合同
- `.planning/ROADMAP.md` Phase 8 / Phase 9 — 图片与视频生成的阶段边界、成功标准及最多 4 Wave 约束。
- `.planning/REQUIREMENTS.md` `KFRM-01..KFRM-07` — Phase 8 可验收需求；`VGEN-01..VGEN-07` 用于约束本阶段成片页的前置接入边界。
- `.planning/PROJECT.md` — v1.1 人工审核、可追踪、可回退和复用既有生成基础设施的产品原则。
- `.planning/phases/05-remake-project-core-workbench/05-CONTEXT.md` — 稳定 Shot、统一 Task/Asset/Version/Review/Provenance 和工作台外壳合同。
- `.planning/phases/06-scenedetect/06-CONTEXT.md` — Shot revision、原始 Start/Middle/End、审核状态和上游变更失效规则。
- `.planning/phases/07-prompt/07-CONTEXT.md` — 图片 Prompt 独立批准、采用版本、失败与失效状态，以及未批准 Prompt 不得默认生成的门禁。
- `.planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md` — Prompt 页面布局、状态表达及进入下游生成阶段的前端交接。

### 翻拍工作台
- `src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx` — 当前 overview/scenedetect/prompt 阶段导航、工作台宿主和 Task drawer 接入点。
- `src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptStage.tsx` — 当前 Shot/Prompt 审核页面及新增“进入分镜”动作的来源。
- `src/lib/remake-projects/service.ts` — Remake snapshot、Shot revision、输出和 provenance 的服务边界。
- `prisma/schema.prisma` — RemakeShot、RemakeShotRevision、RemakeOutputVersion、RemakeProvenanceRecord 和 RemakeInvalidation 的持久化基线。

### 原版分镜与成片能力
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/StoryboardStage.tsx` — 原版分镜 stage 入口。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardStageShell.tsx` — 原版分镜页面 shell 与控制器边界。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection.tsx` — 图片生成、候选和任务状态的原版卡片能力。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionCandidateMode.tsx` — 候选图片浏览和选择模式。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/CandidateSelector.tsx` — 原图/候选选择交互基线。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute.tsx` — 原版成片 stage 入口。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoStageShell.tsx` — 原版成片页面 shell。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx` — 视频参考帧、Prompt、模型能力参数与生成控件。

### 模型、任务与配置
- `src/lib/config-service.ts` — 项目/用户模型配置、capability defaults/overrides 和图片生成配置解析。
- `src/lib/model-config-contract.ts` — 模型能力参数合同。
- `src/lib/workers/handlers/panel-image-task-handler.ts` — 原版分镜图片候选数量、生成与持久化逻辑。
- `src/lib/task/types.ts` 与 `src/lib/task/queues.ts` — 统一 Task/Queue 状态和任务类型边界。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StoryboardStage` / `StoryboardStageShell`: 可作为分镜真实页面宿主，在 adapter 边界注入 Remake Shot 双层 view model。
- `ImageSection` / `ImageSectionCandidateMode` / `CandidateSelector`: 已覆盖单图生成、多候选、任务状态和候选确认，需扩展为不可变批次历史与显式采用指针。
- `VideoStageRoute` / `VideoStageShell` / `VideoPanelCardBody`: 已覆盖成片页面、参考帧、Prompt、模型参数、音频和生成控件；Phase 8 先接真实数据并禁用提交。
- 原版资产库与项目配置入口: 必须在两个页面完整保留并继续使用共享项目配置。
- `panel-image-task-handler`: 已支持 `candidateCount` 1..4、多候选输出和统一 Worker 执行，可作为 Remake image task 的复用基线。

### Established Patterns
- 页面/API 只创建和读取 Task，耗时生成由既有 Worker 和模型网关执行；刷新后从数据库恢复状态。
- capability defaults 与项目 overrides 解析实际模型参数，任务 payload/provenance 冻结提交时配置。
- Remake output、revision、provenance 和 invalidation 已具备追加版本与上游变化失效的基础合同。
- Phase 7 Prompt 结果使用“latest / adopted / needs review”语义；关键帧生成必须延续显式采用而非自动替换。

### Integration Points
- `RemakeWorkbench.STAGES` 增加 storyboard/video stage，并在 `PromptStage` 增加进入分镜的显式交接动作。
- Remake snapshot/API 增加每个 Shot 的生成选择、动作表派生资产、生成批次、候选版本和 adopted 指针投影。
- 原版分镜/成片页面通过 adapter 读取 Remake Shot，不创建伪造的 NovelPromotionEpisode/Storyboard/Panel 持久化副本。
- 图片 Worker 通过现有模型配置、对象存储、Task 和计费路径执行；输出关联 Prompt version、Shot revision、参数快照和任务。
- Shot revision 或原始关键帧变化触发动作表和相关生成结果失效传播，同时保留历史资产。

</code_context>

<specifics>
## Specific Ideas

- 用户提供的原版页面参考中，分镜页保持横向图片卡、Prompt/镜头信息与生成操作；成片页保持视频卡、首尾帧/动作参考、Prompt、模型参数和任务操作。
- 双层 Shot 区块必须清楚区分“原始动作参考”和“新画面参考”：上层三张原始帧永不被覆盖，下层才承载生成候选与采用版本。
- 原始三帧动作表是 Phase 9 的辅助动作/画面变化参考；采用的新图片是主要画面参考。
- 首版优先原样接入并投入使用；针对翻拍场景的页面改造应由真实使用问题驱动，而不是在接入前重设计。

</specifics>

<deferred>
## Deferred Ideas

- Phase 9：启用真实视频生成、视频候选版本比较与采用，并按模型能力展示实际使用的主参考图和动作表输入。
- Phase 10：跨 Shot 批量生成、受控并发、取消、失败项重试和恢复。
- 根据真实翻拍使用反馈改造分镜与成片页面，而不是在首次接入阶段预先重构。

</deferred>

---

*Phase: 08-keyframe-generation*
*Context gathered: 2026-08-09*
