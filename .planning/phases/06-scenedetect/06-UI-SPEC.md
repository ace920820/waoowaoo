---
phase: 6
slug: scenedetect
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-07
---

# Phase 6 - SceneDetect 镜头与关键帧审核 UI 设计合同

本合同只定义 Waoo 宿主与完整 SceneDetect App 在 Phase 6 的集成、状态和验收边界。SceneDetect 内部布局、组件树、快捷键和编辑状态机以 canonical vendored App 为唯一设计来源，不在 Waoo 重新设计。

## 设计原则

1. 完整 SceneDetectEmbeddedApp 占据项目栏和阶段导航以下的全部可用空间。Waoo 不增加第二套播放器、Timeline、Shot 列表、Inspector、关键帧选择器或审核工具栏。
2. 上传、分析弹窗、undo/redo、边界调整、拆分/合并/删除、Start/Middle/End 选择及 keep/pending/discard 继续使用原 App 交互。
3. Waoo Task 只显示真实可观测的 queue、worker、executor、import 阶段。同步 executor 没有 telemetry 时使用不定进度和阶段文字，不伪造算法百分比或 ETA。
4. StageHost 只负责挂载、高度、滚动、modal portal、样式隔离、Task drawer 和焦点恢复，不管理 Shot 编辑状态。

## Design System

| Property | Waoo 外壳 | SceneDetect stage |
|---|---|---|
| Tool | 现有 glass tokens/primitives | canonical vendored styles |
| Preset | none | 上游 SceneDetect 当前样式 |
| Component library | Waoo workspace components | SceneDetect 现有组件，禁止抽取重组 |
| Icon library | Waoo 现有 icon system | 保留 vendor 图标语义 |
| Font | Waoo workspace sans | 继承 vendor 当前排版 |
| Radius | 交互表面最大 8px | 不改写 vendor radius |

### 样式所有权

- glass tokens 只能用于项目栏、阶段导航、宿主状态和 Task drawer。
- scenedetect-stage-root 是隔离边界；深色 stage 不被 glass 卡片或常驻侧栏包裹。
- 必要 embedded patch 只允许处理 root height/overflow、portal/container、runtime branch、项目入口、导出禁用，以及 AnalysisModal 的真实 Task 阶段映射；后者不得改变视觉编排或伪造百分比/ETA。
- 不修改 SceneDetect 的颜色、排版、间距、组件顺序或交互命令。

## 页面与信息架构

### 工作台外壳

1. 项目栏持续显示项目名、当前阶段、待审核/失败摘要和 Task drawer 触发器。
2. “视频分析”与“镜头审核”定位到同一个 canonical App 实例和同一份持久化状态，不卸载重建编辑器。
3. Task drawer 是 overlay。桌面从右侧覆盖，手机从底部覆盖；不得压缩编辑器。

### SceneDetect 主 stage

- 无 source：挂载完整 App 并显示原上传入口；不加载 sample、recent project、IndexedDB draft 或第二套上传卡片。
- source 已上传：使用 App 原有播放器和开始分析交互，加载 server-probed metadata 和同源播放 URL。
- 分析中：保留原 AnalysisModal 的焦点与阶段编排；不可观测阶段不显示伪百分比或 ETA。
- 分析完成：原 VideoPlayer、Timeline、ShotInspector 和 ShotList 显示 current canonical project。
- 编辑中：保留原 undo/redo、边界调整、split/merge/delete 和批量 status 交互。
- 关键帧选择：原 KeyframeSelector 显示候选帧与三槽位；采用后进入 Waoo extraction Task，完成后 reload media refs。
- 人工确认：使用 ShotList 现有 keep/pending/discard 单项和批量控件。gate 不通过时保留当前选择，由不占布局的 host 状态提示显示简短原因，Task drawer 提供详情；不修改 ShotList 布局或新增审核工具栏。

## 状态与交互合同

### 上传与 source replacement

| 状态 | 界面行为 | 禁止 |
|---|---|---|
| idle | 原 App 上传入口可用，显示格式和文件限制 | sample、recent project 自动加载 |
| uploading/probing | 入口锁定，显示真实上传/探测阶段 | 客户端预创建 Shot |
| uploaded | 加载同源播放 URL 和服务端 metadata | 持久化 blob/data URL |
| replace requested | 解释历史保留和下游复核，确认后新建 source revision | 静默覆盖 source |
| failed | 保留可重试状态，显示问题和下一步 | 空白 stage 或无限 spinner |

### 分析与 Task

| Waoo Task | AnalysisModal 呈现 | 可用命令 |
|---|---|---|
| queued | 已排队，等待分析；indeterminate | 查看 Task |
| source-read | 正在准备原视频 | 查看 Task |
| executor-call | SceneDetect 正在检测镜头边界；indeterminate | 查看 Task，不显示伪 ETA |
| importing | 正在导入镜头与关键帧 | 查看 Task |
| waiting_retry | 显示尝试次数、原因和下次重试 | 查看 Task |
| completed | 短暂显示完成并 reload canonical project | 进入审核 |
| failed/canceled | 显示可理解原因，保留 source 和最后有效结果 | 通过原 App 重新提交、关闭或查看 Task |

### 编辑、保存与冲突

- App 内编辑继续即时反馈，runtime 以顺序化或 debounce save 写回 current revision。
- 保存中不禁用播放、滚动或选择；产生新 save 的操作按顺序提交。
- 409/ETag 冲突不静默 last-write-wins。显示“项目已在其他位置更新”，提供“重新加载最新版本”和“查看任务”。
- server 为 split 分配稳定 UUID 后，runtime 将 canonical remap 回 App，不改变选中镜头和播放位置。

### 关键帧与审核语义

| SceneDetect 状态 | Waoo 事实 | 用户可见结果 |
|---|---|---|
| keep 且 gate 通过 | approved, promptEligible=true | 保留 keep 标识，外壳计数更新 |
| keep 但 gate 不通过 | pending/needs_review | 显示简短 reason，不伪造已批准 |
| pending | pending | 保留待审核语义 |
| discard | rejected | 保留历史，不物理删除 revision |
| 已批准后编辑 | needs_review, promptEligible=false | 明确标记需重新审核 |

## 宿主组件合同

| 组件 | 责任 | 禁止 |
|---|---|---|
| SceneDetectStageHost | 始终从 canonical index 挂载同一 App；提供 projectId、native state、runtime 和 container | deep-import 子组件或按 Waoo DTO 重建界面 |
| SceneDetectEmbeddedApp | 原布局、编辑状态、modal、上传、分析、关键帧和 status 交互 | 用 glass 重设计内部 |
| SceneDetectIntegrationRuntime | upload、load/save、media、Task、task updates、project/export capability | 以 normalized Shot UI props 或 Blob URL 为持久输入 |
| Task drawer | 项目 Task、失败详情、状态查看和焦点恢复 | 在 Phase 6 新增通用取消/批量重试控制、常驻占位或显示其他项目 Task |

## Spacing Scale

Waoo 外壳沿用 Phase 5 的 4px 基础栅格；SceneDetect 内部间距不重新定义。

| Token | Value | Usage |
|---|---:|---|
| xs | 4px | 外壳图标和文字间隔 |
| sm | 8px | 项目栏和 Task row |
| md | 16px | drawer 内容 |
| lg | 24px | drawer section |

Exceptions: 44px 阶段导航、56px 手机项目栏、SceneDetect 原固定尺寸和 StageHost 计算高度。

## Typography

| Role | Size | Weight | Line Height |
|---|---:|---:|---:|
| Waoo body | 14px | 400 | 1.5 |
| Waoo label | 12px | 500 | 1.4 |
| Waoo compact heading | 16px | 600 | 1.35 |
| SceneDetect content | canonical | canonical | canonical |

项目栏和 drawer 不使用 hero 字号。长文件名、Task ID 和错误文本必须换行或省略，不压缩图标按钮。

## Color

| Role | Value | Usage |
|---|---|---|
| Waoo dominant | #F3F4F6 / glass canvas | 项目栏、导航和 drawer 外围 |
| Waoo secondary | rgba(255,255,255,0.88-0.96) | 外壳表面和 drawer |
| Waoo accent | #1D63E8 / info token | 当前阶段、Task 触发器和焦点 |
| Waoo destructive | #CB3A3A / danger token | source replacement、失败和取消 |
| SceneDetect stage | canonical dark palette | 编辑器内部 |

状态使用文字、图标和颜色共同表达。SceneDetect 深色不泄漏到外壳，glass 不覆盖 stage。

## 响应式与层级

| Viewport | SceneDetect stage | Task drawer | 验证 |
|---|---|---|---|
| >=1280px | 占满剩余宽高，内部滚动 | 右侧 overlay | 1440x900 无页面横向滚动 |
| 768-1279px | 原 App 布局，host 处理裁切 | 400px 右侧 overlay | 1024x768 modal 在 host 内 |
| <768px | 不重排 App，host 提供内部滚动 | 底部 overlay | 390x844 命令可达且无遮挡 |

isolation: isolate 本身不等于 modal containment。所有 fixed modal/preview 必须通过 portal container 或可证明的 containing block 限制在 stage 层级，并由 DOM 和截图验证。

## 键盘、焦点与可访问性

- 阶段导航之后焦点进入同一 App root；Waoo 不截获 SceneDetect 快捷键。
- Task drawer 打开时 focus trap，关闭后恢复到触发按钮；modal 与 drawer 不争抢焦点。
- status/review 使用文字、图标和颜色；焦点环不少于 2px。
- 审核失败 reason 和 Task 错误可被辅助技术读取，不只存在于 tooltip。

## Copywriting Contract

| Element | Copy |
|---|---|
| 上传 CTA | 选择原视频 |
| 分析 CTA | 开始分析 |
| queued | 已排队，等待分析 |
| executor | SceneDetect 正在检测镜头边界 |
| importing | 正在导入镜头与关键帧 |
| keyframe | 正在提取关键帧 |
| 分析失败 | 分析未完成。原视频已保留，可以重试或查看任务详情。 |
| 审核 gate | 尚不能确认：{reason} |
| needs review | 已修改，需要重新审核 |
| save conflict | 项目已在其他位置更新。重新加载最新版本后继续。 |
| source replacement title | 替换原视频？ |
| source replacement body | 当前分析和审核结果会保留为历史，受影响的下游结果将标记为需要复核。 |
| source replacement confirm | 替换视频 |
| Task detail | 查看任务 |
| conflict recovery | 重新加载最新版本 |

## UI Considerations

Applicable state considerations resolved: 12 covered, 4 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | App/source | covered | 无 source 仍挂载 canonical App，不加载 sample/IndexedDB/second uploader |
| loading | upload/analyze/keyframe/save | covered | 显示真实 Task 阶段，不可观测阶段使用 indeterminate |
| error | upload/analyze/extract/save | covered | 保留最后有效状态，提供重试和 Task 详情 |
| partial | analyzed project | covered | 问题 Shot 保持 pending，其他 Shot 可继续审核 |
| populated | editor | covered | 只使用 canonical player/timeline/inspector/list |
| zero-one-many | Shot/Task collections | covered | 0 项有空状态，1 项命令完整，多项可滚动并返回逐项结果 |
| stale | task/revision callbacks | covered | 过期 source/shot/tuple 不覆盖 current UI |
| conflict | native save | covered | 409 显示冲突并要求 reload |
| review-invalidated | approved Shot | covered | 编辑后立即 needs_review 且 promptEligible=false |
| focus | modal/drawer/stage | covered | drawer 恢复焦点，host 不抢 vendor 快捷键 |
| accessibility | status/reason | covered | 图标、颜色和文字共同表达 |
| destructive | source replacement | covered | 替换前解释历史和复核影响并确认 |
| overflow | stage/modal/drawer | backstop | Playwright 三档视口验证 overflow 与 containment |
| long-text | file/project/task/error | backstop | 长文本测试验证换行或省略且不遮挡命令 |
| media | video/canvas/keyframes | backstop | 浏览器验证同源播放和 canvas 非空且无 taint |
| visual-isolation | shell/stage | backstop | 截图验证 light shell 与 dark stage 不互相污染 |

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none | not required |
| third-party registry | none | not allowed |
| canonical SceneDetect vendor | complete App only | VENDOR upstream/vendored hash、registered patch replay/check、no-deep-import/no-duplicate guards |

## 验收证据

- Host unit：无 source 和有 source 都挂载 canonical App，只从 vendor index 导入。
- Runtime contract：upload、canonical save/eTag/remap、frame tuple、Task 回调和终态 reload 与 native 类型兼容。
- Playwright：真实 workspace route 覆盖上传、分析、编辑、三帧选择、单项/批量确认、冲突/失败恢复和三档视口。
- Visual：深色 App 是主体，Waoo 外壳和 Task drawer 不重排、不遮挡、不泄漏样式。

## Checker Sign-Off

当前保持 `draft/pending`：规划期 UI safety/plan gates 已通过，但未伪造正式 UI checker 批准。该状态不通过 `$gsd-validate-phase` 提前转正。

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

Approval: pending
