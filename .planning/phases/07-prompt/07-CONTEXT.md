# Phase 7: Prompt 分析与人工审核 - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段在视频翻拍工作台内实现两类可追溯的 Prompt 分析与人工审核：用户可对整段原视频发起一次 Video Prompt 分析并按 Shot 保存结果，也可手动对单个 Shot 的 Start / Middle / End 关键帧逐张发起图片 Prompt 分析；两类结果都支持查看、编辑、保留历史版本、选择当前版本和明确批准。

本阶段负责 Codex CLI 后台执行框架、结果合同、版本与审核状态、错误与任务反馈以及前端集成交接，不负责生成新图片、新视频、自动质量循环或批量分析全部关键帧。

</domain>

<decisions>
## Implementation Decisions

### Video Prompt 分析方式

- **D-01:** 一次 Video Prompt 分析读取整段原始视频，同时接收当前全部已确认 Shot 的边界，以及每个 Shot 的 Start / Middle / End 关键帧；Codex CLI 只调用一次，结果按稳定 Shot 身份拆分保存。
- **D-02:** 每次首次分析或重新分析都开启新的 Codex Session；一次整段视频分析从开始到结束始终使用同一个 Session。Session 只负责执行，Waoo 数据库仍是唯一事实来源。
- **D-03:** 一次整段视频分析是整体成功或整体失败。失败时不保存本次不完整的新版本，也不存在“部分 Shot 成功”；用户可重试整段分析，已有成功版本保持不变。
- **D-04:** Video Prompt 保留双轨结果：页面主要展示每个 Shot 的简短核心事件描述；同时保存结构化的内部分析，覆盖动作、互动、方向、调度、机位、镜头运动、节奏、环境变化和时间推进，供展开查看与后续迭代。
- **D-05:** 第一版优先把任务、结果拆分、保存、编辑、版本和审核框架做稳定。面向用户的 Video Prompt 不追求复杂电影化措辞，视频生成效果主要依赖后续采用的关键帧；Prompt 内容模板以后根据实际使用继续优化。

### 图片 Prompt 分析方式

- **D-06:** Start、Middle、End 三张关键帧彼此独立。用户必须一张图一张图手动点击分析，每张图分别通过 Codex CLI 调用 `image-to-structured-prompt` Skill；本阶段不提供自动分析全部关键帧的操作。
- **D-07:** 用户可以连续点击不同关键帧，系统最多同时运行 3 个图片分析任务，超过 3 个的任务进入现有队列等待。页面必须分别显示排队、运行、成功和失败状态。
- **D-08:** 图片 Prompt 主界面优先展示 Skill 输出的“第 3 部分：整合生成提示词”和“第 4 部分：负面约束”。完整原始输出和解析后的全部内容保存在后台，用户点击“查看完整分析”后可展开查看，包括分析依据、结构化字段以及 Skill 当前合同中的待确认项。
- **D-09:** 每个图片结果都记录 Skill、模型/Executor、Schema 和执行版本。主界面使用稳定解析字段，完整原始输出同时保留，避免 Skill 内容升级后丢失信息。

### 版本、采用与人工审核

- **D-10:** 每次重新分析都追加新版本，不覆盖旧版本。用户可查看历史、比较内容并切换当前采用版本。
- **D-11:** 每张关键帧的图片 Prompt 独立审核；每个 Shot 的 Video Prompt 也独立审核。用户认为内容合适时可以不编辑直接批准；人工编辑后的内容保存为新版本，再由用户批准。
- **D-12:** 新分析版本默认是 `pending review`。如果已有批准版本，新生成的待审核版本不会自动替换它；只有新版本被明确批准后，才成为新的当前采用版本。
- **D-13:** 后续图片或视频生成只能默认使用当前采用且已批准的 Prompt。Task 执行成功不等于人工批准，未批准、失败或因上游变更而需要复核的结果不得进入默认生成流程。

### 前端交接与完成标准

- **D-14:** Prompt 功能继续放在现有视频翻拍工作台，新增 Prompt 阶段，不建立独立产品页面。具体界面和交互要求见 `07-FRONTEND-REQUIREMENTS.md`，由外部前端开发者实现后再合入。
- **D-15:** 后端、数据合同和前端需求文档可以先完成，但外部前端代码尚未合入或完整用户流程尚未验证时，Phase 7 不得标记为完成。
- **D-16:** 从 Phase 7 开始，每个 Phase 的执行计划最多安排 4 个 Wave。规划必须以可用框架为先，避免为尚未打磨成熟的 Prompt 内容做过度设计。

### the agent's Discretion

- Prompt 版本表、审核记录、当前采用指针和原始/解析结果的精确 Prisma 模型拆分，但必须满足追加版本、独立审核、旧批准版本继续生效和完整 provenance。
- Codex CLI executor 的进程封装、结构化输出校验和现有 Text Worker/Task Queue 的接入位置，但浏览器不得直接启动 CLI。
- Video Prompt 内部结构化 Schema 的具体字段组织和第一版提示模板，只要同时保留简短用户描述与可追溯结构化结果，并满足 Phase 7 Requirements。
- 前端组件拆分、断点和控件细节可按 `07-FRONTEND-REQUIREMENTS.md` 与现有设计系统实现，不得改变已经确定的触发、并发、版本和审核规则。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 阶段范围与产品决定

- `.planning/ROADMAP.md` — Phase 7 目标、14 条需求映射、成功标准及 Phase 8/9 边界。
- `.planning/REQUIREMENTS.md` — `IPRM-01..IPRM-07`、`VPRM-01..VPRM-07` 和共享 Task 约束。
- `.planning/PROJECT.md` — v1.1 人机协作原则、Codex 后台能力边界和禁止一键自动接受结果的范围。
- `.planning/phases/05-remake-project-core-workbench/05-CONTEXT.md` — 稳定 Shot、统一 Task、版本/provenance、审核状态和工作台共同合同。
- `.planning/phases/06-scenedetect/06-CONTEXT.md` — 已确认 Shot、当前 revision、Start/Middle/End 关键帧、上游变更失效传播和 SceneDetect 嵌入边界。
- `.planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md` — 外部前端开发必须遵守的页面布局、交互、状态和验收要求。

### Codex 图片分析合同

- `/Users/jamiezhao/.codex/skills/image-to-structured-prompt/SKILL.md` — 图片反推分析流程、完整输出合同、整合生成提示词和负面约束格式。
- `/Users/jamiezhao/.codex/skills/image-to-structured-prompt/references/field-schema.md` — 结构化图片字段、空间关系、镜头、光线、材质和画面质感的字段定义。

### 现有代码接入点

- `prisma/schema.prisma` — 现有 Remake Project/Shot/Revision/Output/Provenance/Invalidation 与 Task 数据模型。
- `src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx` — Prompt 阶段需要加入的现有翻拍工作台外壳和 Task drawer。
- `src/lib/remake-projects/service.ts` — 当前翻拍项目 snapshot、Shot revision、审核门和 provenance 的服务边界。
- `src/lib/task/types.ts`、`src/lib/task/queues.ts` 与 `src/lib/workers/text.worker.ts` — 新 Codex 分析任务必须复用的统一 Task/Queue/Text Worker 基础。
- `src/lib/workers/handlers/scenedetect.ts` — 已有后台 executor、进度、结果导入和失败传播模式参考。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `RemakeWorkbench`: 已有项目栏、阶段导航、工作台主体和 Task drawer，Phase 7 应增加 Prompt stage 而不是创建第二套外壳。
- `Task` / `TaskEvent` / Text Worker: 已有排队、运行、进度、结果、错误、重试及用户/项目归属，可扩展 Codex Prompt 任务类型。
- `RemakeShotRevision` / `RemakeProvenanceRecord` / `RemakeInvalidation`: 已建立 Shot 当前 revision、执行来源和上游变更失效的基本合同。
- `evaluateSceneDetectReviewGate`: 可作为“只有当前已确认 Shot 和有效关键帧才能分析”的入口门禁参考。

### Established Patterns

- API 只创建和读取 Task，耗时 executor 在 Worker 中运行；页面刷新后从数据库恢复任务与结果状态。
- 外部执行结果先经过版本化合同校验，再持久化为 Waoo 领域对象；原始结果与 provenance 需要保留。
- 人工审核是显式业务状态，不能由任务完成状态推导。

### Integration Points

- 在 remake snapshot/API 中加入 Prompt 摘要、各位置当前/待审核版本和关联任务投影。
- 在 Text Worker 注册整段 Video Prompt 与单帧 Image Prompt 两类 Codex executor handler。
- 在 `RemakeWorkbench` 阶段导航中加入 Prompt 工作区，并继续使用现有 overlay Task drawer 展示后台任务。
- 上游 Shot revision 或关键帧变更时，将对应 Prompt 标记为需要复核，同时保留历史版本与批准记录。

</code_context>

<specifics>
## Specific Ideas

- Video Prompt 的价值是准确说清“这个镜头里发生了什么”，不是第一版就写成复杂的摄影指导词。
- 图片 Prompt 的日常工作流应围绕原图、第 3 部分整合 Prompt 和第 4 部分负面约束展开；详细分析默认收起，避免页面被大段文字淹没。
- 用户可以快速连续点击三张或多个 Shot 的关键帧，系统在后台受控并发；界面不能因为任务排队而阻止用户继续审核其他结果。
- 版本替换必须是明确的人为动作：新版本出现不代表旧批准结果立即失效。

</specifics>

<deferred>
## Deferred Ideas

- 根据实际生成质量持续打磨 Video Prompt 内容、语言风格和结构化 Schema；Phase 7 首版只建立可迭代框架。
- 自动批量分析一个 Shot 或全项目的全部关键帧；当前固定为用户逐张手动触发。
- Phase 8：使用已批准图片 Prompt 生成、比较和采用新关键帧。
- Phase 9：使用采用关键帧与已批准 Video Prompt 生成、比较和采用新视频镜头。
- Phase 10：跨阶段批量选择、批量失败重试、恢复和完整 Task Center 能力。

</deferred>

---

*Phase: 07-prompt*
*Context gathered: 2026-08-08*
