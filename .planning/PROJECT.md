# waoowaoo AI 影视 Studio

## What This Is

waoowaoo 是一个面向 AI 影视生产的 Web 工作台，现有系统已经覆盖项目、剧本、角色/场景/物品资产、分镜、图片生成、视频生成、任务队列、模型网关和对象存储。

从 v1.1 开始，产品将新增“AI 视频翻拍工作台”能力：用户导入一段原始影视或动画视频，在同一个项目中完成镜头切分与关键帧确认、图片 Prompt 和 Video Prompt 分析、关键帧与视频镜头生成、版本比较和人工审核，最终交付可供人工剪辑的 Shot 视频素材。

这不是一键式全自动 Agent，也不是把 SceneDetect、Codex 和生成模型继续作为彼此分离的工具。waoowaoo 负责持久化 Project / Shot / Task / Asset / Version / Review 状态，并通过后台执行器调用外部分析能力和现有生成基础设施。

## Core Value

用户只做镜头判断、Prompt 修订和版本选择等高价值决策，系统自动完成从原始视频到可编辑 Shot 视频素材之间的重复生产工作，并保证所有中间状态可追踪、可回退、可重试。

## Current Milestone: v1.1 AI 视频翻拍工作台整合

**Goal:** 在 waoowaoo 内打通一个可实际使用的人机协作闭环：原视频导入 → 复用 SceneDetect 完成镜头与关键帧确认 → 图片 Prompt → 新关键帧 → Video Prompt → 新视频镜头 → 素材完整性检查与导出。

**Target features:**

- 新建“视频翻拍”项目模式，并以 Shot 作为跨阶段共享的核心业务对象
- 接入 SceneDetect 的视频导入、镜头边界与关键帧数据，保留人工调整和确认
- 复用 SceneDetect 已有的前端交互、后端分析和关键帧提取能力；仅在数据口径、鉴权、持久化和任务执行边界不一致处增加适配器
- 接入 Codex/GPT-5.6 的结构化图片 Prompt 与 Video Prompt 分析能力
- 复用 waoowaoo 现有图片/视频模型网关、任务队列、Worker、存储和生成页面能力
- 为 Prompt、关键帧和视频结果提供版本、选中版本、人工审核、单镜头/批量重试
- 提供统一进度与最终素材检查，输出给外部人工剪辑流程

## Requirements

### Validated

- ✓ 项目、用户、数据库、对象存储和项目级资产组织已经存在 — v1.0 之前
- ✓ 图片生成与视频生成已经通过统一模型配置和后台 Worker 运行 — existing
- ✓ 任务状态、队列、失败处理和前端任务反馈已有可复用基础 — existing
- ✓ 多镜头提示词、资产引用、生成参数和可编辑下游交接已经落地 — v1.0
- ✓ 导演分镜包 schema、preview/commit 导入和可编辑预填已经落地 — v1.0
- ✓ SceneDetect 已能完成原视频导入、镜头边界识别和关键帧提取 — external existing capability
- ✓ `image-to-structured-prompt` 已能将关键帧反推为结构化图片生成 Prompt — Codex skill
- ✓ Codex/GPT-5.6 能结合原视频片段、时间表与首尾关键帧生成镜头级 Video Prompt — model capability

### Active

- [ ] 用户可以在 waoowaoo 中创建视频翻拍项目并导入原始视频
- [ ] 用户可以审核和修改自动切分的 Shot 边界及关键帧
- [ ] 用户可以为 Shot 生成、编辑、批准和版本化结构化图片 Prompt
- [ ] 用户可以复用现有生成基础设施为关键帧生成多个版本并选择采用版本
- [ ] 用户可以为 Shot 生成、编辑、批准和版本化 Video Prompt
- [ ] 用户可以用采用关键帧和 Video Prompt 生成多个视频版本并选择采用版本
- [ ] 用户可以单独、批量或仅针对失败 Shot 运行、取消、重试和恢复任务
- [ ] 用户可以查看整个翻拍项目的阶段进度、缺失项、失败项和审核状态
- [ ] 用户可以导出已采用的 Shot 视频素材及时间表/Prompt/版本元数据，交给人工剪辑

### Out of Scope

- 最终镜头拼接、节奏调整、配乐、音效和发布 — 明确保留在外部人工剪辑流程
- 全自动角色一致性、风格一致性、动作质量评分与自动循环修复 — 基础闭环稳定后再研究
- 自动接受 AI 结果或无人工检查的一键成片 — 与 human-in-the-loop 产品原则冲突
- 重写 waoowaoo 已有图片/视频生成模型接入 — 本轮只扩展输入、状态和编排
- 重建 SceneDetect 算法或将其全部源码并入 waoowaoo — 首版通过稳定集成合同复用
- 通用多 Agent Framework、无限 Codex Session 或让 Session Memory 成为项目数据库 — 不属于闭环 MVP

## Context

- v1.0 已归档 8 个交付阶段、31 个实现计划；原 Phase 4 Hardening And Rollout 已正式取消。
- 当前痛点不是缺少单点能力，而是用户需要在 SceneDetect、Codex Skills、图片生成和视频生成工具之间手工传递文件、Prompt、版本和状态。
- 新里程碑必须在 waoowaoo 内形成统一 Project / Shot 视图；SceneDetect 和 Codex 作为后台能力提供者，不能成为产品状态中心。
- 一个 Shot 至少关联原始时间范围、原始片段、首/中/尾关键帧、图片 Prompt 版本、生成关键帧版本、Video Prompt 版本、生成视频版本和人工审核状态。
- 工作流是 project-based + state-based，不是只能从头跑到尾的一次性 pipeline；用户必须能回到任一 Shot、修改、重跑、暂停并继续。

## Constraints

- **Brownfield:** 必须沿用现有 Next.js、Prisma、Redis/BullMQ、存储、模型网关、任务运行时和多语言结构
- **Integration First:** 优先建立明确的数据合同和边界适配层，避免复制 SceneDetect 或生成模块业务逻辑
- **SceneDetect Reuse:** 不在 waoowaoo 重写镜头检测、时间轴编辑、Shot 拆分/合并、关键帧选择或关键帧提取；这些能力通过外部能力适配器和可复用 UI 组件接入
- **Human Review:** Shot 边界、关键帧、Prompt 和生成结果都必须有可见审核状态与人工覆盖能力
- **Version Safety:** AI 输出和人工修订必须追加版本；不能用新结果静默覆盖已采用版本
- **Recoverability:** 长任务必须可观察、可取消、可重试，刷新或重启后可恢复真实状态
- **Batch Control:** 批量任务使用受控并发和现有队列，不为每个 Shot 启动独立常驻 Codex 进程
- **Manual Finish:** 系统交付可剪辑素材，但不把最终剪辑纳入本里程碑

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| waoowaoo 作为最终产品和工作台基础 | 已具备项目、生成、队列、存储和 UI，整合成本显著低于从 SceneDetect 侧重建 | — Pending |
| SceneDetect 通过清晰合同提供镜头和关键帧分析 | 保留成熟边界识别能力，同时避免两个项目的数据模型互相渗透 | v1.1 planning decision |
| SceneDetect 前端作为可复用能力接入 | 保留已有时间轴、Shot Inspector、关键帧选择和审核交互；在 Next/waoowaoo 外壳中替换本地状态与存储适配 | v1.1 planning decision |
| Waoo 只保存规范化后的项目状态 | SceneDetect 的本地 IndexedDB、JSON 项目文件和 runtime 路径不是产品事实来源；导入结果映射到 Waoo Project/Shot/Asset/Review/Task | v1.1 planning decision |
| Shot 是翻拍流程的核心业务对象 | 所有分析、Prompt、资产、版本和审核都需要稳定的共同连接点 | — Pending |
| Task 是后台执行的统一抽象，Executor 可替换 | Codex、图片模型和视频模型属于不同执行器，不能在业务代码中写死 | — Pending |
| Codex/GPT-5.6 作为后台分析 Executor | 产品需要执行能力和结构化结果，而不是让用户操作 CLI 或维护 Session | — Pending |
| Prompt、图片和视频全部版本化 | 支持比较、回退、重新生成和明确采用，避免 AI 迭代覆盖历史 | — Pending |
| 最终剪辑保持人工 | 产品价值集中在生成可用 Shot 素材，剪辑决策仍需创作者控制 | — Pending |
| 先完成一个真实项目的端到端闭环 | 防止过早引入自动质量循环、复杂 Session Pool 和通用 Agent 框架 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-07 after SceneDetect reuse boundary review*
