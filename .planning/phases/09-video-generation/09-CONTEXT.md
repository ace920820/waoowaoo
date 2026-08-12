# Phase 9: 新视频镜头生成与版本选择 - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段在现有视频翻拍工作台的“成片”页面启用真实视频生成：用户为每个 Shot 手动选择已采用的新关键帧和可选动作表，确认完整 Video Prompt 与项目默认生成参数，经现有视频模型网关生成新视频版本，并完成播放、备注、人工采用、历史追溯和上游变化后的复核闭环。

本阶段只做单 Shot 的轻量 MVP，不实现跨 Shot 批量编排、同步双播放器、自动质量评分、自动采用或上游变化后的自动重生成；跨 Shot 批量执行、失败项重试与恢复属于 Phase 10，最终素材检查与导出属于 Phase 11。

</domain>

<decisions>
## Implementation Decisions

### 模型实际输入

- **D-01:** Phase 9 使用的视频模型均按支持多图输入处理。每次生成都由用户手动选择实际传入的参考图片，系统不得自动代选、静默增加、删除、替换或丢弃图片。
- **D-02:** 可选参考输入仅包含两类：Phase 8 当前已采用的新关键帧，以及当前 Shot revision 的原始 Start / Middle / End 三帧动作表。原始 Start / Middle / End 单图不单独进入候选池，避免与动作表重复。
- **D-03:** 每次提交至少选择一张已采用的新关键帧；动作表可选。只选择动作表时不得提交。
- **D-04:** 实际输入顺序固定为 `Start 新关键帧 -> Middle 新关键帧 -> End 新关键帧 -> 动作表`，未选择的项跳过。用户不能拖动或改变顺序。
- **D-05:** 提交前必须展示模型本次实际会收到的全部图片，并按固定顺序编号；页面显示与任务 payload 必须一致，不能只展示逻辑候选而隐藏实际输入。
- **D-06:** 每个生成视频版本永久保存并可查看当次冻结的完整参考输入，包括参考图片原件/稳定媒体引用、图片角色与顺序、完整提示词、模型、参考模式和所有生成参数。之后修改图片、Prompt 或项目配置不得改变旧版本记录。— **Reversibility:** costly — 视频版本的可追溯合同、历史查看和任务重现都会依赖这份不可变输入快照，改为可变引用需要迁移既有版本数据。

### 模型与生成参数

- **D-07:** 参数填写模式直接复用现有多镜头视频生成能力，不为翻拍场景重新设计第二套规则或控件。每个 Shot 默认带出项目当前配置，用户每次生成前均可修改；单次修改只影响本次任务，不回写项目默认值。
- **D-08:** 可配置项包括视频模型、时长、分辨率、是否生成音频，以及当前模型声明支持的其他参数。Omni / 全能参考、Smart multi-frame 等参考模式沿用现有模型能力判断：支持时才展示，不支持时不得伪造选项。
- **D-09:** 切换模型后，仅保留新模型仍支持且取值合法的参数；不兼容参数按新模型的能力默认值重置，并明确提示用户。提交前所有参数必须通过当前模型能力校验。
- **D-10:** 默认时长首先取原 Shot 时长并向上取整到整数秒；低于当前模型最短时长时使用模型最短时长；高于 15 秒时限制为 15 秒；若模型自身最大时长小于 15 秒，则使用模型最大时长作为上限。
- **D-11:** 如果模型只支持离散时长档位，在完成整数秒向上取整和上下限约束后，继续向上选择最近的合法档位。例如模型支持 `5 / 10 / 15` 秒时，原 Shot `6.1` 秒默认使用 `10` 秒。用户可修改，但只能选择当前模型支持的合法值。
- **D-12:** 每次提交冻结完整模型与参数快照，包括最终采用的默认/覆盖值；项目配置后续变化不得修改旧任务和旧视频版本的记录。

### 版本播放、备注与采用（轻量 MVP）

- **D-13:** 成片页始终可以播放原始 Shot，并默认展示当前采用的视频版本；其他生成版本按生成时间排列，用户点击即可播放和查看完整生成输入。
- **D-14:** 每个生成版本支持一段简单审核备注。首版不增加结构化评分、标签体系、自动打分或版本排名。
- **D-15:** 采用视频必须由用户显式点击。替换已有采用版本时进行二次确认，点击播放或浏览历史不得改变采用指针；旧采用记录继续保留以便追溯。
- **D-16:** 首版不做同步双播放器或逐帧联动对比。原片与候选版本分别可播放，保持实现轻量，后续根据实际使用反馈迭代比较体验。

### 上游变化与复核（轻量 MVP）

- **D-17:** 关键帧、动作表或 Video Prompt 变化后，使用旧输入的视频版本不删除，仍可播放、查看备注和完整输入快照，但统一标记为“输入已变化，需复核”。
- **D-18:** 如果失效的视频原本是当前采用版本，先保留采用关系，避免页面结果突然消失；但对应 Shot 不再计为已完成，也不得作为默认批量/导出就绪结果，直到用户重新确认该旧版本或采用新版本。
- **D-19:** 用户可以明确重新确认并继续采用旧视频，也可以重新生成后采用新版本。首版不因上游变化自动重生成，不建立新的复杂依赖图，复用现有 provenance 与 invalidation 机制传播复核状态。

### the agent's Discretion

- 视频生成批次、不可变版本、采用事件、审核备注和输入快照的精确 Prisma 模型拆分，只要满足追加历史、稳定引用、明确采用和完整 provenance。
- 原片、当前采用版本和历史版本在成片页的具体排版，以及完整输入使用 modal、drawer 或页面内展开的方式；不得引入同步双播放器等非 MVP 能力。
- 模型切换后的参数重置提示形式，以及时长算法在连续范围和离散档位能力合同中的内部实现位置。
- “输入已变化，需复核”的视觉样式和重新确认交互细节，但必须保留采用记录并阻止 Shot 被误判为已完成。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 产品边界与上游合同

- `.planning/ROADMAP.md` Phase 9 — 阶段目标、依赖、成功标准以及 Phase 10/11 边界。
- `.planning/REQUIREMENTS.md` `VGEN-01..VGEN-07` — 视频生成、实际输入、参数、不可变版本、审核采用与门禁要求。
- `.planning/PROJECT.md` — 人工审核、版本安全、可恢复性和复用现有生成基础设施的产品原则。
- `.planning/phases/07-prompt/07-CONTEXT.md` — Video Prompt 的追加版本、批准/采用、完整来源和上游失效合同。
- `.planning/phases/08-keyframe-generation/08-CONTEXT.md` — 已采用新关键帧、原始三帧动作表、Phase 9 主/辅助输入区分、成片页接入和任务快照合同。

### 现有多镜头视频生成参数模式

- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx` — 多镜头视频的模型、Omni/Smart 模式、音频、分辨率、能力参数和单镜头覆盖交互基线。
- `src/lib/shot-group/video-config.ts` — `omni-reference` / `smart-multi-frame` 模式、模型支持判断、参考模式解析和能力参数清洗。
- `src/lib/model-config-contract.ts` — 视频模型的时长、分辨率、音频等能力选项合同。
- `src/lib/model-capabilities/video-effective.ts` — 当前模型能力定义、合法选项和选择归一化逻辑。
- `src/lib/workers/video.worker.ts` — 现有视频 Worker 的参数解析、参考模式、任务执行和生成输入基线。

### 翻拍成片接入点

- `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx` — Phase 8 已接入真实 Shot 数据但保持视频提交禁用的成片页面。
- `src/lib/remake-projects/keyframes/video-inputs.ts` — 当前采用新关键帧和动作表到 Phase 9 输入视图的适配基线。
- `src/lib/remake-projects/service.ts` — Remake snapshot、Shot revision、输出、provenance 与 invalidation 服务边界。
- `prisma/schema.prisma` — Remake Prompt、关键帧批次/候选/采用事件、Output Version、Provenance 与 Invalidation 持久化基线。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `RemakeVideoStage`: 已展示真实 Shot、采用画面、Video Prompt 和动作表状态，Phase 9 应在该页面启用真实提交与版本审核，不建立新页面。
- `mapRemakeVideoInputs`: 已把采用的新关键帧映射为主参考图，并把动作表作为辅助参考输入，可扩展为用户手动勾选和冻结快照。
- `ShotGroupVideoSection`: 已具备多镜头模型选择、Omni/Smart 模式、音频、分辨率及 capability 参数控件，可作为参数填写模式的直接复用基线。
- 现有 Video Worker / model gateway / Task / storage: 已覆盖视频模型调用、异步任务、对象存储、计费和状态反馈，Phase 9 只扩展 Remake 输入和版本持久化。

### Established Patterns

- 模型能力来自配置合同，页面只展示模型真实支持的选项；提交时参数快照冻结，Worker 再做能力校验。
- Prompt 和关键帧均使用追加版本、显式采用、采用事件和上游失效语义；视频版本应延续同一模式。
- 页面/API 创建和读取 Task，耗时生成由既有 Worker 执行；刷新后从数据库恢复真实任务与输出状态。

### Integration Points

- 扩展 Remake snapshot/API，投影每个 Shot 的视频生成门禁、参数默认值、生成批次、版本、备注、当前采用指针和复核状态。
- 在 `RemakeVideoStage` 加入手动参考图选择、固定顺序提交预览、参数面板、生成动作、原片/版本播放和完整输入查看。
- 通过既有视频队列、Worker、模型网关、存储和计费路径执行，任务 payload 冻结 Shot revision、Prompt version、参考媒体及顺序、模型与参数。
- 关键帧、动作表或 Video Prompt 变化时，使用现有 provenance/invalidation 传播到视频版本和 Shot 完成状态。

</code_context>

<specifics>
## Specific Ideas

- 用户明确要求每次都手动选择模型实际收到的图片，并在提交前看见最终输入，禁止页面显示一套、模型实际收到另一套。
- 每个历史视频版本都应像一张“生成收据”：可查看当时全部参考图片、固定顺序、完整提示词、模型、模式和参数。
- 参数体验尽量复用已经熟悉的多镜头视频生成方式；Phase 9 的工作重点是接通 Remake Shot 和版本闭环，而不是重做参数系统。
- 版本审核和上游失效采用 MVP 策略，先保证不丢历史、不误用旧输入和人工采用明确，再根据真实使用逐步增强比较体验。

</specifics>

<deferred>
## Deferred Ideas

- Phase 10：跨 Shot 批量生成、受控并发、取消、失败项重试和刷新/重启恢复。
- Phase 11：最终采用视频的完整性检查、manifest 和剪辑素材导出。
- 同步双播放器、逐帧联动比较、结构化质量评分、自动排名和自动采用。
- 上游输入变化后自动重生成，以及比现有 provenance/invalidation 更复杂的依赖图。
- 根据真实生成效果和审核习惯继续优化视频版本比较与备注能力。

</deferred>

---

*Phase: 09-video-generation*
*Context gathered: 2026-08-12*
