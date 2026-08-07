# Phase 5: 翻拍项目与核心工作台 - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning
**Source:** PRD Express Path (`/Volumes/KINGSTON/projects/SceneDetect/docs/AI 视频翻拍工作台 —— 整体架构与开发设计.md`) + v1.1 milestone decisions

<domain>
## Phase Boundary

本阶段建立视频翻拍项目的最小可运行纵向骨架：用户可以创建“视频翻拍”项目，进入统一工作台，从数据库读取和管理稳定的 Shot 与统一 Task 状态，并在修改上游 Shot 状态时明确看到下游需要复核。

本阶段负责定义后续 Phase 6-11 共同依赖的 Project / Shot / Task / provenance 合同和一个真实可操作的 UI 读写路径，但不实现 SceneDetect 分析、Prompt 分析、图片生成、视频生成、批量编排或最终导出的完整业务页面。

</domain>

<decisions>
## Implementation Decisions

### 产品入口与兼容性

- **D-01 / RMP-01:** waoowaoo 新增独立的“视频翻拍”项目类型和创建入口；既有剧本、小说推广及其他项目模式的路由、创建和运行行为必须保持不变。
- **D-02 / RMP-02:** 视频翻拍项目进入统一工作台。首个可用界面必须展示原视频占位/状态、Shot 总数、当前阶段、完成度、失败项、待审核项和关联 Task 状态，并提供进入后续阶段的稳定导航结构。

### Shot 作为核心业务对象

- **D-03 / RMP-03:** Shot 使用不可变稳定标识，作为原始时间范围、原始片段、关键帧、Prompt、生成结果、版本和审核状态的共同连接点；Shot 不是临时 CSV 行、文件名或前端数组下标。
- **D-04 / RMP-04:** Project、Shot 和 Task 的真实状态属于数据库与对象存储。页面刷新、浏览器关闭、Web/Worker 服务重启后必须从持久化状态恢复；任何 Codex Session、React 本地状态或进程内存都不得成为唯一事实来源。
- **D-05 / RMP-05:** 修改已完成 Shot 的上游输入时，不静默删除或覆盖下游结果；系统保留历史并把受影响的下游 Prompt、图片或视频状态标记为“需要复核”。Phase 5 至少建立可扩展的失效传播合同和一条可验证的状态变化路径。
- **D-06 / RMP-06:** 每次 AI 或生成执行都能追溯到输入资产/版本、参数、Executor、capability、模型或 Skill 标识、Schema/执行版本、Task 和输出版本。Phase 5 先建立通用 provenance 合同；具体 Prompt/图片/视频版本实体可由后续阶段扩展。

### Task 作为统一执行抽象

- **D-07 / TASK-01:** Shot 切分、关键帧提取、图片 Prompt、Video Prompt、图片生成和视频生成共享统一 Task 生命周期与关联合同，至少覆盖排队、运行、成功、失败、取消和重试语义；不得为每种能力建立互不兼容的页面临时状态。
- **D-08 / TASK-02:** Task 通过 `task_type + executor + capability` 描述“做什么、由谁做、使用什么能力”。业务页面只创建/查询 Task，不直接启动 Codex CLI、SceneDetect 进程或模型命令；Executor 必须可替换。
- **D-09 / TASK-03:** 用户能够从 Project、Shot 或资产版本定位关联 Task，并在工作台查看其状态和可理解的失败信息。Phase 5 复用并扩展 waoowaoo 现有 Task/Run/Worker 基础，不另起第二套任务中心。

### 纵向骨架与交付顺序

- **D-10:** Phase 5 的首个 tracer 必须贯通：创建视频翻拍项目 -> 持久化至少一个 Shot -> 创建/读取统一 Task 记录 -> 工作台展示真实数据库状态 -> 修改 Shot 后显示下游“需要复核”。这条路径必须使用真实 API 和数据库，不接受纯静态 mock 页面作为完成标准。
- **D-11:** 工作台是创作型操作界面，不是营销页、聊天窗口或 CLI 模拟器。Codex、SceneDetect 和生成模型只以后台能力/任务身份出现。
- **D-12:** Phase 5 只搭建后续阶段可扩展的阶段导航和状态摘要；实际的镜头时间轴编辑、Prompt 编辑器、版本对比、生成参数、批量任务控制和素材导出分别留给 Phase 6-11。

### Human-in-the-loop 边界

- **D-13:** 人工审核是显式状态而非备注字段。界面和数据合同必须能区分未处理、待审核、已批准/已采用、被拒绝、需要复核和执行失败；系统不得因为 Task 成功就自动视为人工批准。
- **D-14:** 最终镜头拼接、节奏、配乐、音效和发布明确不进入 waoowaoo v1.1 的自动化闭环；系统最终只交付可供外部人工剪辑的 Shot 素材。

### the agent's Discretion

- Prisma 模型拆分、枚举命名、索引、外键和迁移文件的具体形式，但必须满足稳定身份、可追溯、可恢复和现有数据兼容约束。
- 在现有 workspace 路由中使用独立 mode、子路由或 feature shell 的具体实现方式，但不能破坏既有模式。
- Phase 5 工作台中 Shot 列表、摘要区、阶段导航和 Task 状态面板的具体组件拆分。
- 复用现有 Task 与 Run Runtime 的适配层位置；允许增加领域投影，但禁止复制一套新的队列事实来源。
- 测试文件的精确拆分，只要覆盖 schema/contract、API、状态失效、兼容性和一条真实 UI 路径。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑范围与需求

- `.planning/PROJECT.md` — v1.1 产品定位、现有能力、约束和明确排除项。
- `.planning/REQUIREMENTS.md` — Phase 5 的 RMP-01 至 RMP-06、TASK-01 至 TASK-03 及全里程碑可追溯映射。
- `.planning/ROADMAP.md` — Phase 5 目标、成功标准、依赖关系和 Phase 6-11 边界。
- `.planning/STATE.md` — 当前里程碑状态、v1.0 覆盖关闭说明和继续规划位置。

### 业务需求参考

- `/Volumes/KINGSTON/projects/SceneDetect/docs/AI 视频翻拍工作台 —— 整体架构与开发设计.md` — 原始业务生命周期、Shot/Task 核心对象、人机审核、版本化和工作台形态参考；它不是最终技术方案，若与 v1.1 Roadmap 冲突，以 Roadmap 和 Requirements 为准。

### 现有系统边界

- `AGENTS.md` — waoowaoo 技术栈、架构约束、代码规范和 progressive disclosure 要求。
- `.planning/codebase/ARCHITECTURE.md` — 现有 UI、领域服务、Worker、Task Queue 与 Run Runtime 的职责边界。
- `.planning/codebase/STACK.md` — Next.js、React、Prisma、BullMQ、Redis、存储和模型网关基线。

</canonical_refs>

<specifics>
## Specific Ideas

- 典型项目从“导入原视频”开始，最终经过 Shot 审核、两类 Prompt、关键帧生成、视频生成和人工审核，交付逐 Shot 视频素材；Phase 5 只实现这个生命周期的项目壳与共同状态中心。
- 工作台应适合频繁扫描和回到问题项：项目摘要、阶段导航、Shot 列表/当前 Shot、Task 状态应处于同一操作上下文，后台任务运行时用户仍可浏览和审核其他内容。
- 使用明确的状态、计数和筛选入口表达“失败”“待审核”“需要复核”，避免只用颜色或含糊进度条。
- Shot 和 Task 的 URL/API 标识必须稳定，后续阶段应能从任何缺失项或失败项直接定位回对应 Shot。
- UI 默认显示面向用户的能力名称和结果状态，不暴露 Codex CLI 命令、Session 管理或进程细节。

</specifics>

<deferred>
## Deferred Ideas

- Phase 6：原视频上传、SceneDetect 分析、镜头时间轴、拆分/合并与关键帧审核。
- Phase 7：`image-to-structured-prompt` 与 Video Prompt 分析、结构化编辑、版本比较和批准。
- Phase 8：新关键帧生成、版本比较与采用。
- Phase 9：新视频镜头生成、版本比较与采用。
- Phase 10：批量选择、受控并发、取消、失败重试、Worker 恢复和完整 Task Center 操作。
- Phase 11：最终素材完整性检查与 manifest/Shot 素材导出。
- Future：自动质量评分、自动 Prompt 修复、自动生成循环、通用 Agent Framework、动态 Session Pool、多用户审批和剪辑辅助。
- Out of scope：最终自动剪辑、配乐、音效、发布，以及无人工审核的一键翻拍。

</deferred>

---

*Phase: 05-remake-project-core-workbench*
*Context gathered: 2026-08-07 via PRD Express Path*
