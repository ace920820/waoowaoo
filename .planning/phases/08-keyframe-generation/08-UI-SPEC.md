---
phase: 08
slug: keyframe-generation
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-10
---

# Phase 8 — 新关键帧生成与版本选择：UI 设计契约

> 视频翻拍工作台的分镜/成片接入与关键帧生成、比较、显式采用契约。首版复用原版页面能力，只做 Remake Shot 数据适配和本阶段所需的边界表达；不得重新设计原版工作流。

---

## 设计系统

| 属性 | 契约 |
|---|---|
| Tool | none；项目已有手写的 Glass UI 原语，不初始化 shadcn |
| Styling | Tailwind CSS 4 + `ui-tokens-glass.css` / `ui-semantic-glass.css`；优先复用 `GlassSurface`、`GlassButton`、`GlassChip`、`TaskStatus*` |
| Component library | 项目本地 primitives；不新增组件库 |
| Icon library | `lucide-react`，经现有 `AppIcon` 使用；所有仅图标按钮必须有 `title`、`aria-label` 和可见 focus ring |
| Font | `Geist Sans` 为界面字体；中文回退 `Noto Sans SC`，再回退系统 sans-serif |
| Existing page baseline | 保留原版 `StoryboardStage` / `StoryboardStageShell`、`ImageSection`、候选选择器、`VideoStageRoute` / `VideoStageShell` / `VideoPanelCardBody` 的资产库、项目配置、模型能力与任务状态能力 |

**来源：** `08-CONTEXT.md` D-05、D-09、D-13--D-15；现有 `globals.css`、Glass tokens、分镜/成片组件和两张原版页面参考图。项目为 Next.js/React，但没有 `components.json`；现有设计系统已足以维持一致性，故本 Phase 不引入 shadcn。

---

## 阶段边界与信息架构

### 全局阶段导航

1. `RemakeWorkbench` 的导航顺序固定为 `概览 → 镜头分析 → Prompt 分析 → 分镜 → 成片`。`Prompt 分析`、`分镜`、`成片`始终可点击进入；禁止因未完成前置阶段隐藏、锁死或自动跳转页面。
2. Prompt 页保留顶部阶段导航，并在其现有任务/统计区提供主动作 `进入分镜`，次文案显示 `可生成 {eligible} / {total} 个 Shot`。点击只导航，绝不提交图片任务或自动选择 Prompt。
3. 前置条件只禁用具体动作，并在动作旁展示真实缺失原因。例：`缺少已批准的 Start / Middle / End 图片 Prompt`、`当前 Shot 需要复核`、`尚未选择用于生成的 Prompt`。禁用原因可读、可聚焦，不仅依赖颜色或 tooltip。
4. Phase 8 的“成片”页必须真实挂载原版成片页面并读取当前 Remake Shot、已采用新画面、原始动作表、Video Prompt、项目资产和模型配置；视频提交按钮禁用，按钮下固定说明 `视频生成将在 Phase 9 启用。你仍可检查输入与调整项目配置。`。不得用占位页替代，也不得伪造视频任务、进度或候选。

### 分镜页的 Remake Shot 结构

每个 Remake Shot 是一个连续的双层工作区，不得把 Start / Middle / End 变成三个独立 Shot 卡片，也不得产生 Novel Promotion 的 Episode/Storyboard/Panel 持久化副本。

**分镜主屏视觉焦点：** 当前 Shot 下层 `新画面参考` 的当前主预览及其 `采用此版本` CTA 是首要视觉和操作焦点；上层 `原始动作参考` 保持完整、可核对但为辅助上下文。实现必须先保证主预览、采用状态和 CTA 在当前 Shot 首屏清晰可见，再呈现批次缩略图、参数与历史信息。

| 层级 | 固定内容与交互 |
|---|---|
| Shot 标头 | 显示 `Shot #{sequence}`、稳定标识、时间范围、当前 revision、审核状态与失效状态。过长 stable key 省略号截断，悬停/聚焦显示完整值；时间与状态不换行。 |
| 上层：原始动作参考 | 固定标题 `原始动作参考` 和说明 `当前 revision 的 Start / Middle / End 原始帧，用于保留动作与画面变化证据。`。横向三卡按 Start → Middle → End 固定排序；每卡显示原始帧、时间戳、图片 Prompt 状态和选择控件。原始帧永不被生成图片覆盖、删除或“采用”替换。 |
| 原始帧选择 | 首次进入没有任何默认选择。每张已批准且未失效的图片 Prompt 以 checkbox/toggle `用于生成` 显式选择；选择至少一项才允许建立下层生成槽位。选择写回服务器并在刷新/再次进入时恢复。未批准和已失效项禁用，旁边保留原因；不可用项不能通过键盘、快捷操作或批量路径绕过。 |
| 动作表 | 当前 Shot 已审核确认时显示可点击预览的横向三格 `分镜动作表`，格内有 Start/Middle/End、时间戳和来源 revision。它是辅助动作参考，不是可采用的新画面。旧 revision 的表显示 `已失效（保留历史）`，新 revision 尚未生成时显示 `等待当前 revision 的原始帧确认`。 |
| 下层：新画面参考 | 标题固定为 `新画面参考`，说明 `采用的图片将作为下一阶段的视频主画面参考。`。只为上层已选 Prompt 建立槽位，并按 Start → Middle → End 排列。每个槽位复用原版图片生成卡的模型、能力参数、参考资产、候选数量、任务状态、重新生成、预览与采用能力。 |

### 候选、比较与采用

1. 槽位正常态固定为：`当前采用主预览` 在左/上，`生成批次`时间线在右/下。每个批次显示提交时间、模型、候选数量、Task 状态和不可变候选缩略图；重新生成只在末尾新增批次，绝不覆盖历史。
2. 选择候选缩略图只切换主预览与比较对象，必须清楚标记 `正在查看`，不能改变 `当前采用`。已采用缩略图只显示 `当前采用` 标签，不因预览切换而移动。
3. 主要 CTA 为 `采用此版本`。当槽位已有采用版本时，点击 CTA 先打开确认对话框：标题 `替换当前采用版本？`，正文 `Start（或 Middle/End）将改为使用此版本。原采用版本和所有历史记录都会保留。`，按钮 `保留当前版本` / `确认采用`。确认成功后以服务端返回的 adopted pointer 刷新 UI。
4. 使用页面内展开的比较工作区而非嵌套模态：由 `比较` 按钮打开，保持当前 Shot 上下文。两个同尺寸预览位有独立选择器，可比较 `原始 {位置} 帧` 与任意候选，或任意两个候选；标签必须显示位置、批次和候选号。关闭只收起比较区，不修改选择或采用。
5. Start、Middle、End 每个已选槽位最多一个当前采用版本；下游输入摘要最多显示三张主画面参考。若 Phase 9 的模型不支持其中某一帧，成片页以能力说明列出“实际将使用”的合法子集，绝不能静默隐藏、补造或把原始动作表混作主画面。

### 成片页的 Phase 8 适配

1. 保留原版横向视频卡、提示词、模型能力、首尾帧/动作参考、音频和任务信息布局。仅将数据源适配为 Remake Shot；保留右上/页面既有 `资产库` 与 `项目配置`入口及完整操作能力，两个页面共享同一项目事实来源。
2. 每张成片卡在参考输入区分为两个带标题的组：`主画面参考（采用的新画面）` 与 `辅助动作参考（原始三帧动作表）`。主画面没有采用版本时显示真实缺失；动作表失效或缺失时显示 revision 原因。二者不能使用相同标签、状态芯片或采用语义。
3. 视频模型、时长、分辨率、音频和能力字段照原版可查看、可配置；模型能力下拉仍显示项目 defaults/overrides 的有效值。所有视频生成、重新生成和批量生成提交动作禁用，不显示“已生成”假状态。
4. 在页面头部提供紧凑的输入就绪摘要：`已采用画面 {n}/3`、`Video Prompt：已批准/缺失/需复核`、`动作表：当前/缺失/已失效`。这是只读进度，不是 Phase 9 生成入口。

---

## 响应式与可访问性

| 视口 | 契约 |
|---|---|
| >= 1280px | 保持原版密集的横向工作面。一个 Shot 的原始三帧和已选槽位均为三列；候选缩略图在批次内横向换行；资产库/项目配置保留顶部右侧入口。 |
| 768--1279px | Shot 主区单列；三帧与槽位用 `repeat(auto-fit, minmax(220px, 1fr))`，不压缩图片比例或操作栏。比较区两列，空间不足时折为上下两张。 |
| < 768px | 阶段导航可横向滚动且每项保留 44px 最小点击高度；Shot 标头、动作表、原始帧和生成槽位改一列。候选批次使用可横滚缩略图轨道并保留可见焦点；“采用此版本”和禁用原因换行，不出现横向页面溢出。 |

- 图像使用稳定 `aspect-ratio`（继承项目视频比例）；加载、错误、候选数和标签不得改变卡片尺寸。
- 所有交互目标最小 44 x 44px；现有紧凑按钮可保留视觉尺寸，但以透明 hit area/内边距达到该目标。键盘焦点采用现有 `--glass-focus-ring-strong`。
- `用于生成`、`当前采用`、`正在查看`、`待审核`、`需复核`、失败与 Phase 9 禁用状态均有文字/图标与颜色双重表达。候选缩略图以 radio-group 语义，生成选择以 checkbox 语义；状态更新通过 `aria-live="polite"` 宣告。
- 比较区、图片预览和替换确认遵循焦点管理：打开时焦点进入标题/首个操作，关闭时返回触发控件；Escape 只关闭比较或确认，不撤销已完成采用。
- 图片 alt 固定格式：`Shot {sequence} 的 {Start|Middle|End} 原始关键帧`、`Shot {sequence} 的 {位置}，批次 {n} 候选 {m}`、`Shot {sequence} 的分镜动作表`。装饰性图标 `aria-hidden`。

---

## Spacing Scale

声明值均为 4 的倍数，优先复用既有 `--glass-space-*`：

| Token | Value | Usage |
|---|---:|---|
| xs | 4px | 芯片内图标、时间戳与标签的最小间距 |
| sm | 8px | 控件组、缩略图、卡内紧凑字段 |
| md | 16px | 卡片默认内边距、表单字段间距 |
| lg | 24px | 双层 Shot 的层间距、工作区默认 gap |
| xl | 32px | Shot 与 Shot 的区隔、页面主体块间距 |
| 2xl | 48px | 阶段正文的主要段落间距 |
| 3xl | 64px | 页面级留白；不在紧凑操作面板内使用 |

例外：图片、视频、缩略图和底部/顶部固定操作栏按既有页面的稳定尺寸与比例布局；触控交互最小 44px，不以缩小字体或压缩布局换取密度。

---

## Typography

只使用下列四个字号与两个权重；不使用视口比例字体或负字距。

| Role | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| 辅助标签 | 12px | 400 | 1.5 | 时间戳、来源、状态说明、批次元数据 |
| 正文/控件 | 14px | 400 | 1.5 | 生成参数、Prompt 摘要、错误说明、按钮文字 |
| 面板标题 | 16px | 600 | 1.2 | `原始动作参考`、`新画面参考`、成片输入组标题 |
| 页面/Shot 标题 | 20px | 600 | 1.2 | 分镜页标题、Shot 标题与确认对话框标题 |

长 Prompt、错误详情、stable key、模型名称和资产名称：正文自然换行；单行元数据截断为 ellipsis 并用 tooltip/可聚焦完整文本补充。禁止小型内部滚动文本框承载长内容；详情区可自然展开。

---

## Color

| Role | Value | Usage |
|---|---|---|
| Dominant (60%) | `#f3f4f6` / `--glass-bg-canvas` | 页面画布和大面积背景 |
| Secondary (30%) | `rgba(255,255,255,.88)` / `--glass-bg-surface` | 分镜/成片工作面、Shot 容器、卡片与导航表面 |
| Accent (10%) | `#2f7bff` 至 `#5ca8ff` / `--glass-accent-*` | `进入分镜`、`生成关键帧`、`采用此版本`、当前阶段/当前预览边框、focus ring |
| Success semantic | `#0f9f62` / `--glass-tone-success-fg` | 当前采用、已批准、任务完成；不得充当通用 CTA |
| Warning semantic | `#b86400` / `--glass-tone-warning-fg` | 待审核、需复核、缺失或受限输入；不得代表采用成功 |
| Destructive | `#cb3a3a` / `--glass-tone-danger-fg` | 删除、不可恢复的移除与失败状态；本阶段替换采用不属于 destructive |

Accent 仅保留给：明确提交生成、确认采用、进入下一工作区、当前选择/焦点。候选预览、历史批次、原始动作帧、项目配置和资产库入口使用 secondary/neutral，不与主 CTA 竞争。颜色来自现有 tokens；不新增紫色渐变、装饰性光球或新主题。

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Prompt 页主交接 CTA | `进入分镜` |
| 单槽位生成 CTA | `生成关键帧`；已有历史时 `重新生成` |
| 明确采用 CTA | `采用此版本`；替换确认 `确认采用` |
| 原始选择 | `用于生成`；禁用说明 `该 Prompt 尚未批准，暂不能用于生成。` / `该 Prompt 已因上游变化失效，请先重新确认。` |
| 下层空状态 | 标题：`尚未选择生成输入`；正文：`在上方原始动作参考中选择至少一个已批准的图片 Prompt 后，再生成新的画面参考。` |
| 没有关键帧 | 标题：`还没有可生成的关键帧`；正文：`请先返回“镜头分析”完成 Shot 审核与 Start、Middle、End 原始帧确认。` |
| 生成失败 | `本次关键帧生成未完成。请检查任务详情后重试；已有候选和当前采用版本不会受到影响。` |
| 候选未完成 | `此批次仍在生成中；已完成候选可查看，但请等待任务结束后再决定是否采用。` |
| 失效状态 | `上游 Shot revision 或原始关键帧已变化。历史版本已保留，但不能作为当前默认输入。` |
| 成片 Phase 8 禁用 | `视频生成将在 Phase 9 启用。当前可检查输入、管理资产并调整项目配置。` |
| 缺少视频输入 | `尚缺少可用于视频生成的输入：{缺失项}。请在分镜或 Prompt 分析中完成后再继续。` |
| 替换采用确认 | 标题：`替换当前采用版本？`；正文：`{位置} 将改为使用此版本。原采用版本和所有生成记录都会保留。`；操作：`保留当前版本` / `确认采用` |
| 本阶段 destructive action | 不新增 destructive action。沿用原版页面已有删除操作及其现有确认行为；“采用此版本”必须使用上述非破坏性替换确认。 |

---

## UI Considerations

Applicable state considerations resolved: 21 covered, 4 backstop, 0 unresolved。

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | 分镜 Shot 列表、原始动作帧、下层生成槽位、成片输入 | ✅ covered | 无源视频/Shot、关键帧不完整、未选择 Prompt、无采用版本均显示对应中文空状态及可返回的上游入口，不展示虚构卡片。 |
| loading | snapshot、原始帧、动作表、候选图片、项目配置 | ✅ covered | 使用既有稳定比例 skeleton 或 `TaskStatusOverlay`；任务运行时保留旧主预览和其他 Shot 可操作，绝不伪造百分比或预计完成时间。 |
| error | 图片生成、snapshot、动作表、成片输入加载 | ✅ covered | 卡内展示中文错误摘要与 `重试`/Task drawer 入口；单槽位失败不阻塞其他槽位，已有采用版本和历史批次继续可见。 |
| populated | 原始三帧、生成槽位、批次候选、成片参考输入 | ✅ covered | 正常态按固定 Start → Middle → End 排列，主预览、批次元数据、缩略图与 adopted pointer 同时可辨。 |
| partial | 已选 1--2 个 Prompt、部分候选完成、模型只支持部分帧 | ✅ covered | 只渲染已选槽位；未选位置明确是未选择，未完成候选保留占位，成片页列出模型实际会使用的合法子集。 |
| overflow | 阶段导航、批次缩略图、桌面横向卡列 | ✅ covered | 小屏阶段导航和候选轨道横向滚动；正文卡片改自适应列，不裁切操作栏或产生页面横向溢出。 |
| zero-one-many | Shot 列表、已选槽位、候选批次 | ✅ covered | 0 项给空状态；1 项保持同一栅格和单数文案；多个批次按时间追加并可扫描，不改变 adopted pointer。 |
| long-text | Prompt、错误、模型/资产名、Shot stable key、禁用原因 | 🧪 backstop | 文本在详情区换行；单行元数据 ellipsis + 完整 tooltip/可聚焦文本。需视觉回归覆盖中文长 Prompt、长模型名与窄屏禁用原因。 |
| loading | `采用此版本`、选择保存、替换确认 | 🧪 backstop | 提交后仅禁用该动作并显示 inline loading；采用状态只能以服务端重新查询结果更新。需 mutation 成功/失败回归测试。 |
| error | 确认采用 mutation | 🧪 backstop | 失败保留对话框与原采用指针，显示错误且可重试；不得乐观移动 `当前采用` 标签。需 API/UI 回归测试。 |
| overflow | 双图比较与 44px 操作目标 | 🧪 backstop | 视觉回归需覆盖 320px 与 1440px：比较区不重叠、两图可见、按钮文案可换行且所有操作可点击。 |

---

## 数据、状态与任务呈现

1. 所有状态来自服务端 snapshot/Task：Shot stable ID、sequence、时间、revision、源帧、Prompt latest/adopted/review、选择持久化、批次、候选、adopted pointer、动作表、失效记录和 provenance。前端不得以本地数组位置或乐观布尔值推断“已采用”。
2. 每个生成提交在 UI 摘要中可查：模型、有效能力参数、参考资产、Prompt version、Shot revision、候选数量、Task 状态和提交时间。更新项目配置只影响后续提交；历史批次显示自己的冻结摘要。
3. 候选数量沿用原版 1--4，默认来自项目配置；本次覆盖仅显示在当前提交摘要，不能回写项目默认值。Phase 8 不提供跨 Shot 批量生成、自动采用、自动质量循环或视频生成。
4. `queued`、`processing/running`、`succeeded`、`failed`、`cancelled` 使用现有 Task presentation 语言和颜色。刷新后从数据库恢复；运行任务不能显示为未开始。
5. Shot revision 或原始关键帧变动后，历史生成图片、动作表、Prompt/候选 provenance 均保留；但受影响内容使用 `需复核`/`已失效` 状态，不能自动成为当前输入。用户必须显式重新选择、生成或采用。

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none | not applicable；未初始化 shadcn |
| third-party | none | not applicable；2026-08-10 确认本 Phase 不引入第三方 registry/block |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS（1 项非阻塞措辞建议）
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved
