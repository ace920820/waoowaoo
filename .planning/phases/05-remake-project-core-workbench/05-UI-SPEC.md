---
phase: 5
slug: remake-project-core-workbench
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-07
reviewed_at: 2026-08-07T14:31:00+08:00
---

# Phase 5 — 翻拍项目与核心工作台 UI 设计合同

> 本合同定义 Phase 5 的可视与交互边界，以及 Phase 6 整体嵌入 SceneDetect App 时必须遵守的宿主合同。Phase 5 覆盖“视频翻拍”项目创建、核心工作台壳、SceneDetect 接入状态、适配器驱动的 Project/Shot/Task 真实数据路径、canonical vendor stage host 和状态可见性；不在 Waoo 重做 SceneDetect 的页面布局、镜头时间轴、Shot 编辑、关键帧选择器或 `App.tsx` 状态编排，也不覆盖 Prompt 编辑、版本比较、生成参数、批量调度或导出。

---

## 设计系统

| 属性 | 值 |
|---|---|
| Tool | none；不初始化 shadcn（自动运行默认拒绝；项目已有稳定的自建 UI 基础） |
| Preset | 不适用 |
| Component library | 自建 glass primitives、`SegmentedControl`、`ConfirmDialog`、`TaskStatusInline` |
| 图标库 | `AppIcon`（基于 `lucide-react`）；不得手绘 SVG |
| 字体 | `var(--font-geist-sans)`；中文回退 `Arial, Helvetica, sans-serif` |
| 已复用令牌 | `--glass-bg-*`、`--glass-text-*`、`--glass-stroke-*`、`--glass-tone-*`、`--glass-space-*` |

**来源与约束：** `globals.css`、`ui-tokens-glass.css` 和现有 workspace 已定义以上令牌与组件模式。Phase 5 的 Waoo 外壳、项目概览和 Task 抽屉使用 `glass-page`、`glass-surface`、`glass-btn-*`、`glass-input-base`，但不使用 `AnimatedBackground`、装饰性浮层、渐变填充或营销式卡片墙。vendored SceneDetect stage 不继承这套视觉要求：它保留原应用深色主题，并在 scoped root 中隔离。既有剧本/小说推广 workspace 的路由、阶段和视觉行为不得改动。

---

## 页面与信息架构

### 项目创建入口

- 在现有项目入口新增文本加图标命令 `新建翻拍项目`；图标使用 `AppIcon` 的 `plus`/`video` 语义图标。
- 新建弹窗标题为 `新建视频翻拍项目`。项目类型使用现有 `SegmentedControl` 或等价单选组；`视频翻拍` 为本次新增选项，其他既有类型和其默认值保持原样。
- 表单仅含必填的 `项目名称` 与项目类型。名称为空、超长或服务端校验失败时，在字段下显示文字错误；提交按钮为 `创建项目`，提交期间显示加载图标并禁用重复提交。
- 创建成功后跳转到该项目的翻拍工作台，后端持久化项目、SceneDetect 接入状态和“项目初始化”统一 Task；没有外部分析结果时不创建伪造 Shot。使用 adapter fixture 的测试可以验证一个外部 Shot 映射，但不能把 fixture 变成生产数据。
- 原视频上传不在本阶段提供。新项目摘要中的原视频区域只显示真实的“未导入”状态，不显示假播放器、假进度或上传控件。

### 工作台壳

1. 保留应用全局导航；其下为 64px 项目栏，左侧是返回工作区图标按钮、项目名称与 `视频翻拍` 类型标签，右侧是项目级任务计数按钮。
2. 项目栏下为 44px 阶段导航：`项目概览`、`视频分析`、`镜头审核`、`Prompt 审核`、`关键帧`、`视频生成`、`最终素材`。本阶段提供 `项目概览`、SceneDetect 接入状态和 disabled/compile-only 的完整应用 StageHost 合同；Phase 6 在 `视频分析`/`镜头审核` 阶段通过同一 canonical 入口开放实际编辑器。其他项以锁图标、`aria-disabled` 和悬浮提示 `后续阶段开放` 表达不可用，不能跳到空白路由。
3. 概览顶部是无嵌套卡片的摘要带：原视频状态、Shot 总数、当前阶段、完成度、失败项、待审核项。每一项为固定高度的紧凑统计单元，数值和标签始终同时出现；缺失数据显示 `--` 与原因标签，不用零值冒充真实数据。
4. `项目概览` 的摘要带下是三栏只读工作区：Shot 列表、所选 Shot 摘要、项目 Task 面板同处一个网格上下文。列表项和 Task 行是可重复的独立项目，可有 8px 圆角；不将整个页面或每个分区包装成层层卡片。该三栏布局不得复用于 SceneDetect 阶段。
5. `视频分析`/`镜头审核` 的主体是无卡片包裹、占满项目栏和阶段栏以下可用空间的 `SceneDetectStageHost`。Host 只能加载 canonical vendored `SceneDetectEmbeddedApp`；应用内部原布局、播放器、Timeline、ShotInspector、undo/redo 和弹窗层级保持原样，Waoo 不再渲染第二套 Shot 列表或详情编排。
6. 项目、Shot 和 Task 状态必须从真实 API/数据库查询得到。刷新、重新打开浏览器、服务重启后的骨架屏结束后重新读取真实状态；URL 保存 `projectId`、当前阶段、`shot` 和可选 `task`，而非以组件内存作为选择状态来源。SceneDetect App 可保留编辑会话所需的本地 UI state，但持久化事实必须经 runtime 写回 Waoo。

**视觉焦点：** 在项目概览中，所选 Shot 的摘要区是首要视觉锚点；进入 SceneDetect 阶段后，完整 SceneDetect 编辑器是唯一主体视觉锚点。Waoo Task 状态只从项目栏打开覆盖式右/底抽屉，不通过新增常驻栏压缩、重排或遮挡原编辑器。

### 一条真实数据路径

- 创建项目后自动进入 `项目概览`；若已有 SceneDetect 导入结果，默认选中服务端持久化的第一个 Shot，否则显示 `尚未导入原视频`，不自动生成 Shot。
- Phase 5 不提供手工 `新建镜头`，避免绕过 SceneDetect 输入合同。Shot 列表和详情只读取适配器导入的真实 Shot；Phase 6 才接入 SceneDetect 既有的时间轴和 Shot 编辑动作。
- Phase 5 的概览 Shot 详情为只读，不提供编辑、保存、拆分、合并或删除命令。revision、stable ID 和下游 invalidation 的合同由 adapter fixture、service 与 API 集成测试验证；用户可见的 Shot 写回由 Phase 6 整体挂载 SceneDetect App，并通过注入的 Waoo runtime/adapter 完成。
- Phase 5 的 StageHost 只做 canonical App 的 compile-only/disabled harness 和接入状态，不使用 normalized Waoo Shot props 重建界面；Phase 6 才为其注入真实 `SceneDetectProject` 初始状态、媒体解析、保存和分析 Task ports。
- 当 adapter fixture 表示上游 revision 已变化时，工作台只读展示 `需要复核`、受影响数量和影响范围。不得以删除结果、自动批准或静默覆盖代替失效标记。
- 创建项目产生的初始化 Task、Shot 关联 Task 和项目级 Task 均可在右侧面板定位；点击行把 `task` 写入 URL 并展开只读详情。页面只展示任务与可理解错误，绝不展示 CLI 命令、Session 标识、环境变量或未脱敏日志。

---

## 布局与响应式合同

| 断点 | 布局 | 稳定尺寸与行为 |
|---|---|---|
| >= 1280px | 概览三栏 / SceneDetect 全宽 stage | 概览：Shot 列表 288px、详情区 `minmax(520px, 1fr)`、Task 面板 320px。SceneDetect：host 占满剩余宽高，Task 改为覆盖式右抽屉；不得给原应用增加常驻侧栏。页面不产生横向滚动。 |
| 768–1279px | 概览双栏 / SceneDetect 全宽 stage | 概览：Shot 列表 280px、详情区占余量且最小 488px，Task 为右侧 400px 抽屉。SceneDetect：保留原应用布局的响应式行为，host 负责边界裁切/内部滚动，Task 仍为覆盖式抽屉。 |
| < 768px | 概览单栏 / SceneDetect 独立 stage | 项目栏固定 56px，阶段栏横向滚动。概览按 Shot 列表、详情顺序显示，Task 使用底部抽屉。SceneDetect host 占满剩余视口；只允许为嵌入修复 root height/overflow 与 modal containment，不在 Waoo 重排其内部组件。 |

- 页面内边距：桌面 24px，平板 16px，手机 16px；不随视窗宽度放大字号。
- 列表行高度固定 56px，详情标题区最小 72px，状态标签最小高度 24px；加载、长名称和状态变化不得改变这些基础尺寸。
- 不提供桌面侧栏的手动拖拽缩放，避免跨断点布局漂移。所有表格型字段在小屏转为“标签在上、值在下”的定义列表。
- 弹窗宽度为 `min(480px, calc(100vw - 32px))`，底部操作栏在手机纵向排列；主操作先于取消操作。

---

## 组件合同

| 组件 | 内容与行为 | 状态与可访问性 |
|---|---|---|
| 项目摘要带 | 原视频、Shot 总数、当前阶段、完成度、失败、待审核六项 | 每项显示图标、可读标签和数值/状态；失败与待审核是可点击筛选入口，计数为 0 时仍保留。 |
| 阶段导航 | 七个固定阶段项 | 当前项使用文字、底边和 `aria-current="page"`；未开放项用锁图标和文字提示，不能只靠灰色。 |
| Shot 列表 | 外部序号/稳定 ID、人工审核状态、失效状态、关联 Task 摘要 | 单选列表；选中项有边框、背景和 `aria-selected`。状态按稳定 Waoo ID 与外部 sequence 排序；项目无 Shot 时显示空状态。 |
| Shot 详情 | 稳定 Shot ID、名称、人工审核、下游复核、原视频关联、provenance 摘要 | 详情不可用时显示 `选择一个镜头查看详情`。ID 以可复制等宽文本显示；显示值而非数组索引。 |
| 复核提示 | `需要复核`、变更原因、影响项数量与范围 | 使用警示图标、文字和可见边框；例如 `镜头资料已更新，2 项下游结果需要复核`。Task 成功不得自动移除此提示。 |
| Task 面板 | 状态、任务类型、能力名称、Shot/项目关联、创建/更新时间 | 行点击展开只读详情；失败行显示脱敏原因与 `查看任务详情`。面板可在后台任务运行时保持浏览 Shot。 |
| provenance 摘要 | 输入资产/版本、参数摘要、Executor、capability、模型或 Skill、Schema/执行版本、Task、输出版本 | 尚无执行记录时明确写 `尚无执行记录`；字段缺失用 `未提供`，不得省略后让用户误认为已记录。 |
| SceneDetect StageHost | canonical vendored `SceneDetectEmbeddedApp` 完整应用；host 只提供 SceneDetect-native 初始项目与 `SceneDetectIntegrationRuntime` | Phase 5 为 disabled/compile-only harness；Phase 6 开放真实 runtime。禁止直接导入 vendor 内 Timeline/ShotInspector 等子组件重新编排。 |
| 图标按钮 | 返回、任务抽屉、关闭、复制 ID | 使用 `AppIcon` 与 `aria-label`；非自解释图标必须有 tooltip；44px 最小点击区。 |

---

## 状态语义与交互

### 审核状态与任务状态

人工审核状态和后台 Task 状态是两个并列字段，必须在同一行中以各自标签显示，不能互相推导。

| 类别 | 状态 | 显示合同 |
|---|---|---|
| 人工审核 | 未处理 | 中性图标与文字 `未处理`。 |
| 人工审核 | 待审核 | 信息图标与文字 `待审核`，计入摘要。 |
| 人工审核 | 已批准/已采用 | 成功图标与文字；仅由明确人工动作或后续阶段采用动作设置。 |
| 人工审核 | 已拒绝 | 拒绝图标与文字；保留历史和原因。 |
| 人工审核 | 需要复核 | 警示图标、文字、变更原因和受影响下游数量；计入摘要。 |
| 人工审核 | 执行失败 | 失败图标、文字和关联 Task 快捷定位；不把它显示成审核已拒绝。 |
| Task | 排队/运行 | `排队中` 或 `运行中` 文字加图标；仅有真实进度时显示百分比，否则不渲染伪进度条。 |
| Task | 成功 | `已完成` 与完成时间；结果存在不等于人工已批准。 |
| Task | 失败 | `失败`、脱敏且可操作的原因、详情入口；不得输出敏感配置或原始运行日志。 |
| Task | 已取消/等待重试 | 分别显示 `已取消`、`等待重试`；本阶段只读展示，取消与重试批量控制留给 Phase 10。 |

### 加载、空、错误与不可用

| 场景 | 固定表现 |
|---|---|
| 首次加载 | 摘要、列表、详情、Task 区各渲染对应尺寸的骨架屏；不以单个全屏 spinner 替代已知结构。 |
| 后台刷新 | 保留上次成功数据，标题附近显示小型 `正在更新` 状态；只在没有任何成功数据时显示骨架。 |
| 项目加载失败 | 显示复制合同中的错误文字、`刷新` 主按钮和 `返回工作区` 次按钮；不展示陈旧项目数据。 |
| 空项目/无 Shot | 显示 `尚未导入原视频` 与 `进入视频分析`（锁定或 Phase 6 未开放）状态；不自动伪造列表行。 |
| 无原视频 | 摘要项显示 `未导入`，详情项显示 `原视频尚不可用`；没有播放器控件。 |
| 详情未选中 | 显示 `选择一个镜头查看详情`，保持详情面板的最小高度。 |
| 部分 provenance | 已知字段正常展示，未知字段标 `未提供`；不阻断查看其他 Shot。 |
| Future 阶段不可用 | 阶段导航保留位置但显示锁定；不打开空白页面，不以 toast 掩盖。 |
| 任务失败 | Task 面板行保留，并展示脱敏错误摘要与详情入口；其他成功任务和 Shot 仍可浏览。 |

### 长内容、筛选与键盘

- 项目名称、Shot 名称在导航和列表中单行省略，完整文本放在 `title`/tooltip；详情标题允许最多两行，之后省略。稳定 ID、模型/Skill 标识和错误原因使用可复制、可横向滚动的单行等宽块，绝不挤压操作按钮。
- 摘要中的 `失败项`、`待审核项` 和 `需要复核` 点击后只筛选 Shot 列表，并在列表标题显示文字筛选条件与图标清除按钮；不以颜色提示当前筛选。
- 概览键盘顺序为项目栏、阶段导航、摘要筛选、Shot 列表、详情操作、Task 面板。SceneDetect 阶段在阶段导航之后把焦点交给原应用 root；Waoo Task 抽屉打开时使用焦点陷阱，关闭后把焦点还给触发按钮，不劫持 SceneDetect 自有快捷键。modal portal 必须限制在 embedded host 的可见层级内。
- 焦点使用现有 `--glass-stroke-focus` 与可见 2px 环；文本与背景至少达到正文可读对比度。状态永远由图标、文字和颜色共同表达。

---

## 间距比例

声明值（均为 4px 倍数）：

| Token | 值 | 用途 |
|---|---:|---|
| xs | 4px | 图标与状态文字间距、细小内边距 |
| sm | 8px | 列表行内部间距、标签内边距 |
| md | 16px | 默认控件和面板内边距 |
| lg | 24px | 摘要带与工作区的分隔、桌面页边距 |
| xl | 32px | 宽屏网格与主要区块间距 |
| 2xl | 48px | 空状态的上下留白 |
| 3xl | 64px | 页面级垂直留白；仅在空状态或大屏首屏使用 |

例外：图标按钮、抽屉触发器和移动端关键命令的可点击区至少 44px；列表行采用固定 56px；顶部项目栏/阶段栏分别为 64px/44px（手机项目栏 56px）。这些是命中区与稳定布局约束，不是新增任意间距值。

---

## 字体排版

只使用以下四种字号与两种字重，不以视窗宽度缩放字号：

| 角色 | 字号 | 字重 | 行高 |
|---|---:|---:|---:|
| 标签与状态 | 12px | 400 | 1.33 |
| 正文、列表与表单 | 14px | 400 | 1.5 |
| 分区标题与主要命令 | 20px | 600 | 1.2 |
| 项目名称与创建弹窗标题 | 28px | 600 | 1.2 |

字距固定为 `0`。数值、稳定 ID、时间与版本标识可使用 `var(--font-geist-mono)`，但字号不超出以上四档。

---

## 颜色

| 角色 | 值 | 用途 |
|---|---|---|
| 主导色（60%） | `#F3F4F6` / `--glass-bg-canvas` | Waoo 外壳、概览画布、未选中背景和大面积留白 |
| 次要色（30%） | `rgba(255,255,255,0.88–0.96)` / `--glass-bg-surface*` | 项目栏、阶段栏、摘要带、列表与抽屉表面 |
| 强调色（10%） | `#1D63E8` / `--glass-tone-info-fg` | 当前阶段、当前 Shot 轮廓、主按钮、可见焦点环、可点击摘要筛选 |
| 危险色 | `#CB3A3A` / `--glass-tone-danger-fg` | 任务失败、校验错误和不可逆操作（本阶段无不可逆操作） |

强调色仅保留给：当前阶段、当前 Shot、`新建翻拍项目`/`创建项目` 主操作、键盘焦点和已激活的摘要筛选。成功、警告和中性状态继续使用现有 `--glass-tone-success-*`、`--glass-tone-warning-*`、`--glass-tone-neutral-*`，但不得单独依赖色彩传达含义。

Waoo 外壳不新增紫色、蓝紫渐变、装饰性光球、bokeh 或新的深色后台，采用现有浅色 glass 表面。SceneDetect stage 是明确例外：保留原应用 `bg-slate-950 text-slate-100` 等深色视觉，不将其改造成 glass，也不让其样式泄漏到项目栏、阶段导航、概览或 Task 抽屉。

---

## 文案合同

| 元素 | 固定中文文案 |
|---|---|
| 主 CTA | `新建翻拍项目` |
| 创建提交 | `创建项目` |
| Shot 写入 | Phase 5 不提供手工 Shot 写入；Phase 6 复用 SceneDetect 编辑器并通过 Waoo API 保存 |
| 空状态标题 | `尚未导入原视频` |
| 空状态正文 | `导入原视频并完成 SceneDetect 分析后，镜头和关键帧会出现在这里。` |
| 无原视频 | `尚未导入原视频`；详情值为 `原视频尚不可用` |
| 详情未选中 | `选择一个镜头查看详情` |
| 加载 | `正在加载项目状态`；后台刷新为 `正在更新` |
| 错误状态 | `项目状态暂时无法加载。请刷新页面；若问题持续，请查看任务详情后重试。` |
| 失败任务 | `任务失败：{reason}`，其中 `{reason}` 为已脱敏、可操作的错误摘要 |
| 复核状态 | `镜头资料已更新，{count} 项下游结果需要复核` |
| Future 阶段 | `后续阶段开放` |
| 不可逆删除确认 | `本阶段不提供不可逆删除。` Shot 的删除/拆分/合并归属 Phase 6；Project 删除不在本阶段新增。 |

所有可本地化可见字符串进入现有 `next-intl` message namespace；不能把中文硬编码到可复用组件。技术字段如 Executor、capability、Skill、Schema 和 stable ID 使用真实返回值与中文字段标签组合显示。

---

## UI Considerations

探针输入覆盖项目创建表单、阶段导航、摘要带、Shot 列表、Shot 详情/provenance、Task 面板、原视频媒体区和响应式抽屉/弹窗。引擎提出的 51 个适用状态考虑项已由以下 6 条显式合同和 2 条回归 backstop 合并解决，0 项未解决。

### Covered truths

- 项目创建与 SceneDetect 接入状态在空字段、部分填写、服务端校验失败和正常查询时，分别使用字段级错误、保留用户输入、明确状态与已定义的成功跳转；不会以空白弹窗或本地假对象代替真实状态。（empty、error、partial、long-text）
- 阶段导航始终显示七个固定阶段；当前项、锁定项、加载/查询失败和移动端长标签均保留文字、图标及可访问状态，不会跳转到空白路由。（error、long-text）
- 项目摘要、Shot 列表、Shot 详情、Task 面板和原视频区域在真实数据可用时分别展示六项摘要、稳定 ID 列表、provenance、关联任务及媒体状态；任何缺失值都显示原因而不是伪造零值、播放器、进度或版本。（empty、populated、partial）
- 项目查询、adapter 导入状态读取和 Task 执行失败时，界面保留仍可用的真实数据并显示已定义的恢复入口或脱敏原因；Task 成功不会推导为人工已批准，上游 revision 更新也不会清除需要复核状态。（error、partial）
- SceneDetect 导入前后的 Shot 与 Task 集合在零项、一项和多项时分别使用接入空状态、稳定默认选择和稳定 ID 排序；摘要计数始终显示数值，筛选条件始终以文字和图标呈现。（zero-one-many、populated）
- 原视频未导入、详情未选中、provenance 不完整和未来阶段未开放时，界面分别显示 `未导入`、选择提示、`未提供` 和锁定状态，且不制造假媒体、假数据或可执行入口。（empty、partial）

### Verification backstops

- statement: 加载与后台刷新状态必须保持项目栏、阶段栏、摘要、Shot 列表、Shot 详情和 Task 面板的稳定尺寸；桌面、平板、手机视觉回归均不得出现布局跳变、全屏 spinner 取代已知结构或伪进度。
  verification: backstop
- statement: 阶段导航、概览三栏、SceneDetect 全宽 stage、抽屉、项目/Shot 名称、稳定 ID、模型或 Skill 标识及错误文本在桌面、平板、手机和超长内容样本下必须按合同滚动、换行或省略；不得产生页面级横向滚动、文字遮挡或按钮压缩；SceneDetect 原布局和深色视觉不得被 glass 覆盖，页面不得出现第二套 Timeline/ShotInspector。
  verification: backstop

---

## 注册表安全

| 注册表 | 使用的块 | 安全门 |
|---|---|---|
| shadcn official | 无 | 不适用：本项目未初始化 shadcn（2026-08-07 检查 `components.json` 不存在） |
| 第三方 | 无 | 不适用；不得在本阶段引入第三方 registry block |

---

## 检查器签署

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: FLAG 已解决（已明确主屏视觉焦点）
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** APPROVED（gsd-ui-checker，2026-08-07）
