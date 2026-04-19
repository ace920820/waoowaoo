# Phase 1: Episode Mode Entry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 01-Episode Mode Entry
**Areas discussed:** 入口形态, 切换后处理, 按钮与反馈, 旧数据默认策略

---

## 入口形态

| Option | Description | Selected |
|--------|-------------|----------|
| 右侧操作区顶部 | 在右侧控制区上方新增模式卡片，靠近主 CTA | |
| 每集脚本头部 | 在当前集脚本头部放模式切换入口 | |
| 双位置联动 | 右侧主入口 + 左侧摘要或快捷切换 | |
| 用户自定义方案 | 放在右侧操作区底部，剧中资产卡片下方，确认并开始绘制按钮上方 | ✓ |

**User's choice:** 放在右侧操作区底部，剧中资产卡片下方，确认并开始绘制按钮上方。  
**Notes:** 用户提供了页面截图并明确标出放置区域，希望模式确认发生在最后启动动作前。

---

## 切换后处理

| Option | Description | Selected |
|--------|-------------|----------|
| 未开始绘制前可自由切换，开始后需确认重走 | 兼顾灵活性和安全性 | ✓ |
| 只要有下游产物就禁止切换 | 实现简单但过硬 | |
| 始终允许切换并保留旧产物 | 自由度高但状态容易变脏 | |

**User's choice:** 未开始绘制前可自由切换，开始后需确认重走。  
**Notes:** 已有下游绘制 / 分镜 / 视频相关产物时，切模式需要明确确认，并接受链路可能要按新模式重走。

---

## 按钮与反馈

| Option | Description | Selected |
|--------|-------------|----------|
| 按钮文案完全跟模式变化 | 直接改成模式专属 CTA 文案 | |
| 按钮文案不变，仅加摘要 | 最小 UI 改动 | |
| 按钮文案微调 + 摘要双保险 | 保留主 CTA，同时补充模式标识 / 副文案 | ✓ |

**User's choice:** 按钮文案微调 + 摘要双保险。  
**Notes:** 主 CTA 继续保留 `确认并开始绘制`，但需要明确模式标识或副文案，让用户知道将进入多镜头路径还是传统路径。

---

## 旧数据默认策略

| Option | Description | Selected |
|--------|-------------|----------|
| 老集保守继承 | 有传统链路痕迹的老集默认传统，其余默认多镜头 | ✓ |
| 老集统一默认多镜头 | 推进更快但兼容性风险更高 | |
| 老集首次进入时强制选择 | 最明确但打扰大 | |

**User's choice:** 老集保守继承。  
**Notes:** 新配置集默认多镜头；老集若已有传统分镜剧本 / 单镜头分镜 / 传统绘制链路痕迹，则优先继承传统模式。

## the agent's Discretion

- 模式选择卡片的具体视觉样式
- 模式摘要文案在 CTA 周边的具体排布形式
- 模式切换确认弹窗的具体文案和风险提示颗粒度

## Deferred Ideas

None.
