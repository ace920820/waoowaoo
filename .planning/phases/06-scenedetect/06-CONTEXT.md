# Phase 6: SceneDetect 镜头与关键帧审核 - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning revision
**Source:** 用户对 Phase 5/6 复用边界的明确决策 + Phase 5 handoff + Phase 6 Roadmap/Requirements

<domain>
## Phase Boundary

本阶段让 waoowaoo 在“视频翻拍项目”工作台内完成原视频上传、SceneDetect 分析、镜头边界与 Shot 编辑、Start/Middle/End 关键帧选择与重新提取、逐项/批量人工确认及修改后失效传播。实现必须整体复用 vendored SceneDetect App，只替换与 Waoo 集成必要的数据、媒体、Task 和项目边界。

本阶段不实现图片 Prompt、Video Prompt、重新生成关键帧、重新生成视频镜头、最终导出或人工剪辑。

</domain>

<decisions>
## Implementation Decisions

### 整体应用复用边界
- **D-01:** Phase 6 的前端复用单元是 canonical `SceneDetectEmbeddedApp` 整个应用，包括 `App.tsx` 布局、播放器、Timeline、ShotInspector、ShotList、undo/redo、拆分/合并/删除、关键帧选择和分析弹窗状态机。禁止抽取子组件在 Waoo 重新编排。
- **D-02:** “视频分析”与“镜头审核”都使用同一 canonical App stage 和同一份持久化项目状态；导航可定位到分析/审核上下文，但不得实例化两套编辑器或维护两份 Shot state。
- **D-03:** 无 source 时仍挂载完整 App 并保留其原上传入口；上传动作通过 injected runtime 写入 Waoo API/对象存储，不在 Waoo 外壳再做第二套上传器。

### Waoo 事实来源与 runtime 替换
- **D-04:** Waoo 数据库、对象存储及既有 Task/Worker/Run 体系是唯一事实来源。IndexedDB/projectStore、Blob/runtime URL、进程内状态、SceneDetect 独立 JSON API 和本地项目文件不得成为 embedded 模式的最终事实。
- **D-05:** runtime 合同从真实 `SceneDetectProject` / `Shot` / `VideoMetadata` 和 App 现有 handler 推导，覆盖 load/save、source upload、media resolution、analyze Task、keyframe extraction Task、Task callback、project/export capability。Waoo normalized DTO 不得替代 App 原生类型。
- **D-06:** 分析与关键帧重提取必须进入 Waoo 既有 Task 生命周期；SceneDetect 现有分析弹窗和进度回调继续负责用户可见编排，runtime 只适配 queued/running/retry/completed/failed/canceled 和可理解错误，不重写弹窗状态机。

### Shot、关键帧与人工审核
- **D-07:** SceneDetect `shotNumber`、数组下标和前端临时 ID 通过 adapter 映射为 Waoo 稳定 Shot UUID。调整边界、拆分、合并、删除、undo/redo 都以事务 revision 写回，保留历史且不物理删除被替代版本。
- **D-08:** 继续使用 SceneDetect 现有 Start/Middle/End 选择器和候选帧预览。canvas/data URL 只是瞬态预览；用户采用的帧必须经 Waoo Task 从原视频提取、写入对象存储并关联当前 Shot revision。
- **D-09:** 复用 SceneDetect 现有 `keep/pending/discard` 单项与批量交互，由 adapter 映射为 Waoo `approved/pending/rejected` 审核事实，不新增第二套审核工具栏。Task 完成不等于人工批准。
- **D-10:** 只有当前边界、三帧媒体、相关 Task 和审核状态全部有效时，Shot 才可 `promptEligible`。已确认 Shot 的边界、关键帧或存在性变更后必须立即回到 `needs_review`，保留旧版本并失效下游结果。

### 视觉、宿主与允许 patch
- **D-11:** SceneDetect stage 保留自身深色主题、尺寸、布局和交互层级；Waoo 浅色 glass 只用于项目栏、阶段导航和 overlay Task drawer，不以常驻侧栏压缩或重排编辑器。
- **D-12:** 只允许 embedded root 高度/overflow、modal portal containment、runtime props/分支、Waoo 项目入口替换、Phase 11 前导出隐藏/禁用，以及 AnalysisModal 真实 Task 阶段映射等必要 patch。AnalysisModal patch 只能把进度来源替换为 queued/source-read/executor-call/import/completed 等真实阶段，在无 executor telemetry 时使用 indeterminate；不得改变视觉编排或伪造百分比/ETA。所有 vendor patch 必须登记在 `VENDOR.json` 并通过 hash/import/duplicate-source guard。
- **D-13:** StageHost 负责高度、滚动、样式与 modal 边界及 Task drawer 焦点恢复；不接管 SceneDetect 内部快捷键、组件布局或编辑状态。

### the agent's Discretion
- runtime 中各 port 的精确命名、Task 事件使用既有 polling/SSE 的选择、API route 的精确拆分，但必须复用 Waoo 已有基础设施。
- Waoo snapshot 与 native `SceneDetectProject` 之间 adapter/envelope 的内部类型拆分，但 schema 必须版本化、严格校验且保留 provenance。
- 在不改变原 App 交互语义的前提下，分析与审核导航如何定位同一 App 的当前状态。

</decisions>

<specifics>
## Specific Ideas

- 用户明确要求“尽量原样接入”：整个 SceneDetect App 作为 stage 嵌入，不重写 839 行级别 `App.tsx` 编排逻辑，避免学习成本、行为偏差和重复劳动。
- canonical vendoring 优于 iframe 或立即抽 npm 包，因为需要深度接入 Waoo 持久化、Task 和审核状态，同时保持原 App 布局。

</specifics>

<canonical_refs>
## Canonical References

### 产品边界
- `.planning/ROADMAP.md` Phase 6 — 目标、成功标准和 Phase 7 边界。
- `.planning/REQUIREMENTS.md` `SHOT-01..SHOT-08` — Phase 6 可验收需求。
- `.planning/phases/05-remake-project-core-workbench/05-CONTEXT.md` D-03..D-09, D-13, D-15..D-20 — 稳定身份、Task、整 App vendoring 和必要 patch 边界。
- `.planning/phases/05-remake-project-core-workbench/05-UI-SPEC.md` — Waoo 宿主、深色 stage、overlay Task drawer 和响应式边界。

### SceneDetect 真实合同
- `src/vendor/scenedetect/App.tsx` — 必须保留的整体布局、编辑状态机与 handler。
- `src/vendor/scenedetect/types.ts` — `Shot` / `VideoMetadata` / status 原生类型。
- `src/vendor/scenedetect/utils/projectStore.ts` — `SceneDetectProject` 与必须替换的 IndexedDB persistence seam。
- `src/vendor/scenedetect/utils/sceneDetector.ts` — 现有 analyze/keyframe API、canvas 预览和进度回调语义。

### Waoo 集成合同
- `src/vendor/scenedetect/index.ts` 与 `src/vendor/scenedetect/VENDOR.json` — canonical 入口、来源和 patch manifest。
- `src/lib/remake-projects/scenedetect/integration-runtime.ts` — Phase 5 最小 native runtime 合同，Phase 6 必须基于真实 App seam 扩展。
- `src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx` — compile-only host，Phase 6 负责变成 production mount。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SceneDetectEmbeddedApp`: 完整上传、分析、时间轴、Shot 编辑、三帧选择、单项/批量 status 和弹窗编排。
- `SceneDetectIntegrationRuntime`: 已有 load/save/media/analyze/keyframe/task/project/export 最小类型边界，但尚缺 source upload port 且 App 未注入该 runtime。
- `SceneDetectStageHost`: 已从 canonical index 导入整 App 并具备 scoped CSS，但当前只在 `initialProject + runtime + enabled` 均存在时挂载。

### Established Patterns
- Waoo 项目数据通过 Prisma/service/API/query hook 持久化，长耗时工作通过既有 Task/Worker/Run 基础执行。
- Phase 5 已建立 canonical vendor root、hash/manifest、native type import 和 duplicate-source guards；Phase 6 应扩展而不绕过它们。

### Integration Points
- App 的 `handleFileUpload` / `handleStartAnalysis` / save effect / `handleUpdateShot` / split/merge/delete/batch status handler 是最小 runtime 注入点。
- `projectStore.ts` 的 load/save/recent-project 路径在 embedded 模式替换为 Waoo runtime，standalone 模式保持现状。
- `sceneDetector.ts` 的直接 API 调用在 embedded 模式替换为 Task port；原进度 callback 语义保留。

</code_context>

<deferred>
## Deferred Ideas

- Phase 7：图片 Prompt 与 Video Prompt 分析、编辑、版本对比和批准。
- Phase 8-10：重新生成关键帧、生成视频镜头及批量编排。
- Phase 11：最终素材导出；最终剪辑、配乐和发布仍由人工完成。
- 将 SceneDetect 抽成 npm 包或改为 iframe 集成；当前里程碑固定使用源码 vendoring。

</deferred>

---

*Phase: 06-scenedetect*
*Context gathered: 2026-08-07*
