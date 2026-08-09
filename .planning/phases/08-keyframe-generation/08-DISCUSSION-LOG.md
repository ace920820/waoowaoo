# Phase 8: 新关键帧生成与版本选择 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 8-新关键帧生成与版本选择
**Areas discussed:** 两页接入与阶段边界, Shot 到旧页面的数据映射, 关键帧版本比较与采用, 生成参数门禁与缺失状态

---

## 两页接入与阶段边界

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Phase 8 中成片页做到什么程度 | 两页接入并分阶段启用 / 合并 Phase 8+9 / Phase 8 只接分镜 | 两页接入并分阶段启用 |
| 页面进入规则 | 始终可进入、操作按条件禁用 / 严格顺序解锁 / 按 Shot 局部解锁 | 始终可进入、操作按条件禁用 |
| Prompt 到分镜的交接 | 导航加明确按钮 / 自动跳转 / 只用顶部导航 | 导航加明确按钮 |
| Phase 8 成片页表现 | 真实页面逐项禁用生成 / 整页只读 / 占位状态 | 真实页面逐项禁用生成 |

**User's choice:** 四项均选择推荐方案。
**Notes:** 分镜和成片都在 Prompt 分析之后真实接入；图片生成在 Phase 8 可用，视频生成在 Phase 9 启用。

---

## Shot 到旧页面的数据映射

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Shot 呈现结构 | 一 Shot 三卡分镜组 / 一张大卡三槽位 / 全项目平铺 / 双层 Shot 区块 | 用户提出并确认双层 Shot 区块 |
| 配置关联 | 共享项目配置并冻结任务快照 / 每 Shot 配置副本 / 始终读取最新配置 | 共享项目配置并冻结任务快照 |
| Prompt 初始选择 | 首次不预选 / 默认全选 / 默认 Start / 按视频模型自动选 | 首次不预选，明确选择至少一个 |
| 动作表生成时机 | Shot 审核后自动生成缓存 / 页面临时拼接 / 视频生成时创建 / 手动创建 | Shot 审核后自动生成缓存 |

**User's choice:** 双层 Shot 区块；上层保留三张原始帧，下层用至少一个被选 Prompt 生成新画面参考。
**Notes:** 原始三帧合成为动作表供视频生成参考；新图片作为主要画面参考。用户另外要求分镜和成片页面原样保留资产库及项目配置功能。

---

## 关键帧版本比较与采用

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| 单次候选数量 | 沿用原版可配置数量 / 固定一张 / 固定多张 | 沿用原版，可设置项目默认并单次覆盖 |
| 比较布局 | 主预览+批次缩略图+双图比较 / 全版本网格 / 轮播 | 主预览+批次缩略图+双图比较 |
| 可采用图片数 | 每 Prompt 槽位一张 / 每 Shot 一张 / 任意数量 | 每 Prompt 槽位一张 |
| 预览与采用 | 两个独立动作 / 点击缩略图立即采用 / 自动采用首张 | 两个独立动作 |

**User's choice:** 四项均选择推荐方案，并明确候选数量默认值可在项目配置中指定、单次生成时可手动修改。
**Notes:** 一个 Shot 最多采用 Start/Middle/End 各一张；旧批次和旧采用版本永不覆盖。

---

## 生成参数门禁与缺失状态

| Option | Description | Selected |
|--------|-------------|----------|
| 沿用原版页面 | 复用分镜和成片现有生成配置、门禁及缺失状态，只做翻拍数据适配 | ✓ |
| 新增翻拍专用规则 | 为 Remake Shot 重新设计参数、门禁和状态 | |

**User's choice:** 全部沿用已有分镜和成片页面配置，并结束讨论。
**Notes:** Phase 8/9 功能启用边界和 Remake 数据映射仍需显式适配。

## the agent's Discretion

- adapter/view model 与组件 props 的内部拆分。
- 双图比较容器和响应式布局细节。
- Phase 8 成片页禁用视频生成的具体提示文案。

## Deferred Ideas

- Phase 9 启用视频生成和视频版本采用闭环。
- Phase 10 增加跨 Shot 批量编排与恢复。
- 使用后再针对翻拍场景修改原版分镜和成片页面。
