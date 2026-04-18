# waoowaoo AI 影视 Studio

## What This Is

waoowaoo 是一个面向短剧 / 漫画视频创作的 AI Studio，已经具备从故事、剧本、资产、分镜到视频与配音的完整生产能力。当前阶段的核心工作不是重新定义产品，而是重构“从剧本进入生产”的主流程，让用户能更快进入可直接绘制与生成的视频生产阶段。

本轮改造聚焦剧本页的流程升级：在保留传统精细分镜链路的同时，引入以集为单位配置的“多镜头片段模式”，把它设为默认快路径，并让它更贴合平台已具备的多镜头片段合成能力。

## Core Value

用户在完成剧本后，必须能用更短路径、更少无效编辑成本进入可生产的视频生成阶段。

## Requirements

### Validated

- ✓ 用户可以从故事进入剧本与分片段剧本流程 — existing
- ✓ 用户可以围绕集、片段、角色、场景和资产进行创作管理 — existing
- ✓ 用户可以生成与编辑分镜、配音、视频等生产资料 — existing
- ✓ 平台已经具备多镜头片段合成相关能力与对应 UI 基础 — existing
- ✓ 用户可以在工作区内按集推进创作流程 — existing

### Active

- [ ] 以集为单位在剧本页提供两种生产模式：传统模式 / 多镜头片段模式
- [ ] 将多镜头片段模式设为默认模式，并要求在“确认并开始绘制”前完成配置
- [ ] 在多镜头片段模式下，片段剧本生成后默认跳过冗长的传统分镜剧本生成
- [ ] 在多镜头片段模式下，直接产出适合多镜头片段生成的情节短剧本提示词与对应台词内容
- [ ] 在多镜头片段模式下，默认不预生成单镜头分镜，但允许用户手动补充单镜头分镜
- [ ] 调整剧本页相关 UI，让模式切换、字段显隐和行动路径与新流程一致且可直接使用

### Out of Scope

- 多镜头分镜表接入人物 / 物品 / 场景资产素材 — 留到下一阶段处理，本轮先完成流程级改造
- 扩展真正的全能参考模式（`@` 资产、多图 / 多视频 / 多音频 / mp3 特征注入）— 属于能力上限增强，不是当前第一阶段阻塞项
- 完全取消单镜头分镜 — 不符合产品目标，本轮只改变默认路径并保留手动补充能力

## Context

- 这是 brownfield 项目，现有代码库已经覆盖故事、剧本、分镜、视频、配音、资产系统、多语言与任务运行时等完整链路。
- 当前主痛点集中在“分镜剧本”这一环节：文本过于啰嗦、不可直接使用、编辑成本高，拖慢从剧本进入视频生产的整体路径。
- 现有平台已具备多镜头片段合成能力，但产品主流程仍然要求用户经过传统的冗长分镜剧本环节，造成能力与流程不匹配。
- 用户已明确本轮最高优先级是 P1：流程拆成传统模式 / 多镜头片段模式；P2 资产接入留到下一阶段；P3 全能参考增强作为后续 bonus。
- 模式切换粒度已明确为“以集为单位”，放置在剧本子页面，并在点击“确认并开始绘制”之前配置或修改。
- 默认模式已明确为“多镜头片段模式”。

## Constraints

- **Brownfield**: 必须兼容现有故事、剧本、分镜、视频、资产与任务系统 — 不能用推倒重来的方式实现
- **Workflow Scope**: 本阶段只完成 P1 — 避免把资产接入和全能参考扩展混入当前交付
- **UX Placement**: 模式配置必须放在剧本页、以集为单位操作 — 这是已确定的产品决策
- **Backward Compatibility**: 传统模式必须继续可用 — 仍需支持精细逐镜头设计项目
- **Flexibility**: 多镜头片段模式下仍允许手动添加单镜头分镜 — 不能把单镜头路径完全封死

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 按“集”配置流程模式 | 每集的分镜剧本本来就是在剧本生成后逐集完成，按集切换最贴合实际使用节奏 | — Pending |
| 模式入口放在剧本子页面、位于“确认并开始绘制”之前 | 让用户在进入绘制与生产前完成路径选择，避免后续返工 | — Pending |
| 默认模式为多镜头片段模式 | 当前最核心目标是缩短从剧本进入生产的路径，且平台已有多镜头能力基础 | — Pending |
| 保留传统模式 | 仍需服务依赖精细逐镜头设计的用户与项目 | — Pending |
| 多镜头片段模式默认不预生成单镜头分镜，但允许手动添加 | 既压缩默认流程，又保留机动补充能力 | — Pending |
| 本阶段只交付 P1，P2 延后 | 先解决最大流程痛点，再补强多镜头资产约束 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after initialization*
