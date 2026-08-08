# Phase 7: Prompt 分析与人工审核 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 7-Prompt 分析与人工审核
**Areas discussed:** 分析入口与任务方式、Prompt 结果内容、版本和重新分析规则、审核方式、前端交接和完成标准

---

## Video Prompt 分析范围

| Option | Description | Selected |
|--------|-------------|----------|
| 单个 Shot 分析 | 每个 Shot 分别启动一次 Codex CLI 请求 | |
| 整段视频分析 | 一次读取整段视频、全部边界和全部首中尾帧，按 Shot 保存结果 | ✓ |

**User's choice:** 整段视频分析。
**Notes:** 一次请求整体成功或失败，不保存部分结果；一次运行内部使用同一个 Session，每次重新分析开启新 Session。

---

## Video Prompt 内容深度

| Option | Description | Selected |
|--------|-------------|----------|
| 复杂生成提示词 | 第一版即输出完整电影摄影和视频生成语言 | |
| 核心事件描述 + 内部结构 | 页面以简短镜头内容为主，同时保留结构化内部结果 | ✓ |

**User's choice:** 先提取每个镜头片段的核心内容表达，框架先做出来。
**Notes:** 生成效果主要依靠后续关键帧，Video Prompt 内容以后边用边优化；双轨结果都保留。

---

## 图片 Prompt 触发和并发

| Option | Description | Selected |
|--------|-------------|----------|
| 自动批量分析 | 自动分析 Shot 或项目中的全部关键帧 | |
| 手动逐张分析 | Start、Middle、End 每张图由用户单独点击 | ✓ |

**User's choice:** 每张图单独调用 `image-to-structured-prompt`，用户逐张点击。
**Notes:** 最多 3 个图片分析同时运行，继续点击的请求进入队列，不取消前面的任务。

---

## 图片 Prompt 页面内容

| Option | Description | Selected |
|--------|-------------|----------|
| 全部内容默认展开 | 页面直接显示完整 Skill 输出 | |
| 重点优先、完整内容展开 | 优先显示整合生成提示词和负面约束，详细内容按需展开 | ✓ |

**User's choice:** 页面优先保留第 3 部分和第 4 部分。
**Notes:** 完整输出保存在后台，用户点击查看完整时展开；当前 Skill 合同中的其他内容也随完整原始结果保存。

---

## 重新分析和版本替换

| Option | Description | Selected |
|--------|-------------|----------|
| 覆盖旧结果 | 新分析完成后直接替换旧内容 | |
| 保留所有版本 | 新分析追加版本，历史可查看和切换 | ✓ |

**User's choice:** 保留旧版本，方便查看和版本替换。
**Notes:** 新待审核版本不会顶掉旧的已批准版本；新版本批准后才成为当前采用版本。

---

## 审核粒度

| Option | Description | Selected |
|--------|-------------|----------|
| Shot 整体审核 | 一个 Shot 内图片和视频结果一起批准 | |
| 每个结果独立审核 | 每张图片 Prompt、每个 Shot 的 Video Prompt 分别批准 | ✓ |

**User's choice:** 都按建议，分别审核。
**Notes:** 内容满意时无需修改即可直接批准；编辑内容会保存为新版本。所有自动分析结果默认待审核。

---

## 前端交接和完成标准

| Option | Description | Selected |
|--------|-------------|----------|
| 后端完成即结束 Phase | 前端后续另算 | |
| 前后端合并验证后结束 | 可先开发后端，但 Phase 7 最终需要完整页面流程通过 | ✓ |

**User's choice:** 都按建议。
**Notes:** Prompt 页面留在翻拍工作台；本次先写 `07-FRONTEND-REQUIREMENTS.md`，由其他开发者实现前端。Phase 7 及以后每个 Phase 最多 4 个 Wave。

## the agent's Discretion

- 版本与审核数据表的精确拆分。
- Codex CLI executor 与现有 Text Worker 的具体接入方式。
- Video Prompt 内部结构化 Schema 和第一版提示模板。
- 前端需求文档中的具体布局与响应式组织，但不得改变已确认的产品行为。

## Deferred Ideas

- 根据真实使用继续优化 Video Prompt 质量和语言。
- 自动批量分析全部关键帧。
- 图片和视频生成分别留给 Phase 8 和 Phase 9。
