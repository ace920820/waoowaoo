# Phase 6: SceneDetect 镜头与关键帧审核 - 研究

**研究日期：** 2026-08-07  
**领域：** 将 vendored SceneDetect 完整编辑器接入 Waoowaoo 的持久化、对象存储与 Task/Worker 体系  
**总体置信度：** HIGH（以本会话读取的实际代码和锁定阶段上下文为主）

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 6 的前端复用单元是 canonical `SceneDetectEmbeddedApp` 整个应用，包括 `App.tsx` 布局、播放器、Timeline、ShotInspector、ShotList、undo/redo、拆分/合并/删除、关键帧选择和分析弹窗状态机。禁止抽取子组件在 Waoo 重新编排。
- **D-02:** “视频分析”与“镜头审核”都使用同一 canonical App stage 和同一份持久化项目状态；导航可定位到分析/审核上下文，但不得实例化两套编辑器或维护两份 Shot state。
- **D-03:** 无 source 时仍挂载完整 App 并保留其原上传入口；上传动作通过 injected runtime 写入 Waoo API/对象存储，不在 Waoo 外壳再做第二套上传器。
- **D-04:** Waoo 数据库、对象存储及既有 Task/Worker/Run 体系是唯一事实来源。IndexedDB/projectStore、Blob/runtime URL、进程内状态、SceneDetect 独立 JSON API 和本地项目文件不得成为 embedded 模式的最终事实。
- **D-05:** runtime 合同从真实 `SceneDetectProject` / `Shot` / `VideoMetadata` 和 App 现有 handler 推导，覆盖 load/save、source upload、media resolution、analyze Task、keyframe extraction Task、Task callback、project/export capability。Waoo normalized DTO 不得替代 App 原生类型。
- **D-06:** 分析与关键帧重提取必须进入 Waoo 既有 Task 生命周期；SceneDetect 现有分析弹窗和进度回调继续负责用户可见编排，runtime 只适配 queued/running/retry/completed/failed/canceled 和可理解错误，不重写弹窗状态机。
- **D-07:** SceneDetect `shotNumber`、数组下标和前端临时 ID 通过 adapter 映射为 Waoo 稳定 Shot UUID。调整边界、拆分、合并、删除、undo/redo 都以事务 revision 写回，保留历史且不物理删除被替代版本。
- **D-08:** 继续使用 SceneDetect 现有 Start/Middle/End 选择器和候选帧预览。canvas/data URL 只是瞬态预览；用户采用的帧必须经 Waoo Task 从原视频提取、写入对象存储并关联当前 Shot revision。
- **D-09:** 复用 SceneDetect 现有 `keep/pending/discard` 单项与批量交互，由 adapter 映射为 Waoo `approved/pending/rejected` 审核事实，不新增第二套审核工具栏。Task 完成不等于人工批准。
- **D-10:** 只有当前边界、三帧媒体、相关 Task 和审核状态全部有效时，Shot 才可 `promptEligible`。已确认 Shot 的边界、关键帧或存在性变更后必须立即回到 `needs_review`，保留旧版本并失效下游结果。
- **D-11:** SceneDetect stage 保留自身深色主题、尺寸、布局和交互层级；Waoo 浅色 glass 只用于项目栏、阶段导航和 overlay Task drawer，不以常驻侧栏压缩或重排编辑器。
- **D-12:** 只允许 embedded root 高度/overflow、modal portal containment、runtime props/分支、Waoo 项目入口替换、Phase 11 前导出隐藏/禁用，以及 AnalysisModal 真实 Task 阶段映射等必要 patch。AnalysisModal patch 只能把进度来源替换为 queued/source-read/executor-call/import/completed 等真实阶段，在无 executor telemetry 时使用 indeterminate；不得改变视觉编排或伪造百分比/ETA。所有 vendor patch 必须登记在 `VENDOR.json` 并通过 hash/import/duplicate-source guard。
- **D-13:** StageHost 负责高度、滚动、样式与 modal 边界及 Task drawer 焦点恢复；不接管 SceneDetect 内部快捷键、组件布局或编辑状态。

### the agent's Discretion

- runtime 中各 port 的精确命名、Task 事件使用既有 polling/SSE 的选择、API route 的精确拆分，但必须复用 Waoo 已有基础设施。
- Waoo snapshot 与 native `SceneDetectProject` 之间 adapter/envelope 的内部类型拆分，但 schema 必须版本化、严格校验且保留 provenance。
- 在不改变原 App 交互语义的前提下，分析与审核导航如何定位同一 App 的当前状态。

### Deferred Ideas (OUT OF SCOPE)

- Phase 7：图片 Prompt 与 Video Prompt 分析、编辑、版本对比和批准。
- Phase 8-10：重新生成关键帧、生成视频镜头及批量编排。
- Phase 11：最终素材导出；最终剪辑、配乐和发布仍由人工完成。
- 将 SceneDetect 抽成 npm 包或改为 iframe 集成；当前里程碑固定使用源码 vendoring。

## Phase Requirements

| ID | 描述 | 研究支持 |
|---|---|---|
| SHOT-01 | 上传受支持原视频并显示状态 | source revision、Waoo storage、真实 metadata 和 Task 状态分层 |
| SHOT-02 | 通过 adapter 发起切分，不重写算法 | text queue worker 调用固定的 FastAPI/pySceneDetect executor |
| SHOT-03 | 持久化边界、片段、关键帧并映射稳定 ID | 版本 envelope、事务 importer、native snapshot 投影 |
| SHOT-04 | 复用播放器、时间轴和 Shot 列表 | 只 mount `SceneDetectEmbeddedApp`，不 deep-import 子组件 |
| SHOT-05 | 复用编辑和写回 revision/invalidation | native project optimistic save、If-Match、server diff |
| SHOT-06 | 复用 Start/Middle/End 选择和重提取 | 保留 selector，持久化 frame tuple，worker 提取三帧 |
| SHOT-07 | 单项/批量确认并拦截未确认 Shot | `keep/pending/discard` 到审核事实的 server gate |
| SHOT-08 | 修改后保留旧版本并失效下游 | immutable revision、retired 状态和 invalidation records |

## Summary

Phase 6 应把完整的 `SceneDetectEmbeddedApp` 当作唯一编辑器，Waoo 只在它的副作用边界替换上传、读取、保存、媒体解析和异步任务。该边界是可验证的：原 App 已包含上传入口、分析 modal、播放器、Timeline、ShotInspector、ShotList、undo/redo、split/merge/delete 和关键帧选择；其原生状态值为 `ShotStatus = 'keep' | 'pending' | 'discard'` 与 `AnalysisStatus = 'idle' | 'uploaded_pending' | 'analyzing' | 'analyzed_review' | 'adjusted' | 'exported'`。[VERIFIED: src/vendor/scenedetect/types.ts:1-9] 这两个字面值集合必须原样保留在 adapter/native project 层，不能由 Waoo DTO 反向定义。

现有 Phase 5 已提供类型外形和 compile-only host，但尚未形成真实嵌入：`SceneDetectStageHost` 虽在条件满足时 render canonical App，却没有把 `projectId`、`initialProject` 或 runtime 传给 App。[VERIFIED: src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/SceneDetectStageHost.tsx:10-45] 当前 runtime 又缺少 source-upload port，且 `saveProject` 不返回 revision/eTag/canonical remap；因此 Phase 6 必须先补齐 runtime 合同和 vendor patch 的可复核机制，再开始接通 UI。

**主要建议：** 先修正 06-05 的 vendor-patch/hash 模型和 runtime 端口，再依次建立 source revision → executor worker/importer → native load/task projection → App embedded branch → server-side mutation/keyframe/review gate → production host/E2E 的闭环。不得把现有 FastAPI 的同步执行伪装为可观测的算法百分比进度。

## Architectural Responsibility Map

| 能力 | 主责任层 | 次责任层 | 原因 |
|---|---|---|---|
| 原视频接收、格式限制与 source revision | API / Backend | Database / Storage | 浏览器 `File` 只可用于本次上传；持久事实是项目授权后的存储对象和 source revision。 |
| 镜头切分、关键帧重提取 | API / Backend | Worker / executor service | Waoo worker 读取已授权 source bytes 并调用固定 SceneDetect 服务；浏览器不直接调用 executor。 |
| Shot/revision/审核/失效 | Database / Storage | API / Backend | 稳定 UUID、历史和 prompt eligibility 必须在服务端事务中判定。 |
| 播放器、Timeline、Shot 列表和编辑交互 | Browser / Client | Frontend Server | canonical App 保持其组件树与状态机；runtime 仅处理其 I/O。 |
| signed media 解析 | API / Backend | Browser / Client | 客户端仅拿项目授权后的可播放 URL，不能拿 storage key 或任意签名能力。 |
| Stage 高度、dark scope、modal 与 Task drawer | Browser / Client | Frontend Server | host 管外壳、焦点和隔离；不得重排 vendor editor。 |

## Project Constraints (from AGENTS.md)

- 新增实现使用 TypeScript、`@/` import、严格类型、集中 query/mutation 和结构化日志；应用代码不用裸 `console.log`。[VERIFIED: AGENTS.md:81-116]
- 禁止多事实来源、直接 route LLM、provider 猜测与静默 fallback；Task 的 loading/compensation 以及 route/test coverage 必须保持一致。[VERIFIED: AGENTS.md:96-116]
- 这是棕地工作，必须兼容既有项目、资产、任务与持久化体系；不可推倒重来。[VERIFIED: AGENTS.md:12-18]
- 本阶段文档与实现应采用 progressive disclosure；先以候选文件和调用链证明扩展范围。[VERIFIED: AGENTS.md:195-206]
- pre-commit/pre-push 会运行 lint、typecheck、测试（及 push 的 build），计划中的 focused test 之外仍需通过对应守卫。[VERIFIED: AGENTS.md:117-120]

## Standard Stack

### Core

| 组件 | 已验证版本/事实 | 用途 | 规定用法 |
|---|---|---|---|
| Next.js / React / TypeScript | Next `^15.5.7`、React `^19.1.2`、TypeScript `^5`。[VERIFIED: package.json:149-181] | workspace、route handler、embedded stage | 仅在 Waoo shell 与 runtime client 使用；editor 仍由 canonical App 负责。 |
| Prisma / MySQL | `@prisma/client` 与 `prisma` 均为 `^6.19.2`。[VERIFIED: package.json:126-161] | Project/Shot/revision/provenance/invalidation 事实 | 所有 current-revision 校验、修改与审核门禁在事务中完成。 |
| BullMQ text queue | SceneDetect task type 默认落到 text queue；未知 image/video/voice 类型亦默认 text。[VERIFIED: src/lib/task/queues.ts:68-101] | 分析、重提取、重试与恢复 | 只新增两个既有 task type 的 handler，不新建 queue 或第二任务表。 |
| Zod | `zod` 为 `^3.25.76`。[VERIFIED: package.json:159-161] | executor result envelope、native project 输入 | 使用现有 parser 的 frame bounds 规则，补充 source revision、版本与来源验证。 |
| Waoo storage abstraction | `uploadObject` 写入 provider，`getObjectBuffer` 读取 bytes，`getSignedUrl` 生成播放 URL。[VERIFIED: src/lib/storage/index.ts:35-84] | source/关键帧落库前后的对象读写 | 一律通过 abstraction；DB 只保存受控 media ref/key，不保存 Blob/runtime URL。 |

### External Executor

| 组件 | 已验证事实 | 用途 | 必须条件 |
|---|---|---|---|
| SceneDetect FastAPI 服务 | `/api/analyze` 仅允许 detector `content`，同步保存上传文件后调用 `analyze_video`。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/main.py:49-79] | pySceneDetect ContentDetector 与首/中/尾关键帧 | 以 `SCENEDETECT_EXECUTOR_BASE_URL` 配置为 server-only 固定 base URL；health、超时和响应上限是上线前置。 |
| pySceneDetect/OpenCV | requirements 声明 `opencv-python==4.11.0.86`、`scenedetect[opencv]==0.6.7.1`。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/requirements.txt:1-5] | 执行检测与帧 extraction | 不安装到 Waoo Node runtime；作为独立 executor 部署。 |

**安装：** 本阶段不需要新增 npm 包；使用项目已有依赖和已有 SceneDetect Python executor。[VERIFIED: package.json:112-182]

## Established Reuse Boundaries

### 必须整体复用

- `src/vendor/scenedetect/App.tsx` 是唯一编辑状态机。它在同一树中挂载 `VideoPlayer`、`Timeline`、`ShotInspector`、`ShotList`、`AnalysisModal`、`ExportModal` 与 `ProjectManager`。[VERIFIED: src/vendor/scenedetect/App.tsx:1-59]
- 所有本地编辑仍走原 handler：`handleUpdateShot` 会连带相邻镜头边界，split、merge、delete、batch status 都在 App 内维护 undo/redo 栈。[VERIFIED: src/vendor/scenedetect/App.tsx:253-310][VERIFIED: src/vendor/scenedetect/App.tsx:323-510]
- `KeyframeSelectorPopover` 现有的三槽位为 `['first', 'middle', 'last']`，选择结果通过原 `onUpdateShot` 回传 `keyframeFrames`，并把 `keyframeSource` 与 `modifiedSource` 置为 `'USER'`。[VERIFIED: src/vendor/scenedetect/components/KeyframeSelectorPopover.tsx:7-25][VERIFIED: src/vendor/scenedetect/components/KeyframeSelectorPopover.tsx:75-92]
- `ShotList` 已有单项/批量 `keep`、`pending`、`discard` 交互。adapter 必须在保存后映射到 Waoo 审核状态；不得加第二个批量审核栏。[VERIFIED: src/vendor/scenedetect/components/ShotList.tsx:18-35][VERIFIED: src/vendor/scenedetect/components/ShotList.tsx:145-201]

### 必须替换的副作用

| 原副作用 | 当前真实代码 | embedded 替代 |
|---|---|---|
| 本地持久化/最近项目 | dirty effect 调用 `saveDraft`、`saveRecentProject`、`listRecentProjects`。[VERIFIED: src/vendor/scenedetect/App.tsx:105-113] | runtime `loadProject` / ordered `saveProject`，且 embedded 时不运行 recent/draft restore。 |
| 上传与 Blob URL | upload handler 使用 `URL.createObjectURL(file)` 并把 `pendingVideoFile` 留在本地 state。[VERIFIED: src/vendor/scenedetect/App.tsx:162-208] | runtime `uploadSource(File, operationKey, provisionalProbe)` → Waoo source revision → reload native project。 |
| 直接分析 API | `analyzeVideoShots` 直接 POST `'/api/analyze'`。[VERIFIED: src/vendor/scenedetect/utils/sceneDetector.ts:118-155] | runtime submit Waoo Task，worker 调 executor；完成后 reload project。 |
| canvas/data URL 三帧 | `captureVideoFrame` 输出 `canvas.toDataURL('image/jpeg', 0.88)`。[VERIFIED: src/vendor/scenedetect/utils/sceneDetector.ts:8-29] | 可保留为浏览器候选预览，但只持久化 frame tuple；worker 写三张 Waoo storage media ref。 |
| standalone JSON / export | 手工保存失败会 fallback 到 `exportSceneDetectProject`。[VERIFIED: src/vendor/scenedetect/App.tsx:527-548] | embedded 隐藏项目管理/样例/导出入口，不调用 `/api/projects` 或浏览器下载。 |

## Architecture Patterns

### System Architecture Diagram

```text
浏览器：canonical SceneDetectEmbeddedApp
  | 上传/编辑/选择三帧/keep-pending-discard
  v
runtime client（同一 App 的 I/O port）
  | project-authenticated Waoo API
  +--> source route --> object storage + RemakeSource current revision
  +--> native project GET/PUT --> Prisma revisions/provenance/invalidation
  +--> analyze/extract command --> Task record --> BullMQ text queue
                                               |
                                               v
                                  SceneDetect worker handler
                                  | read current Waoo source bytes
                                  v
                       fixed FastAPI executor (/api/analyze|/api/keyframes)
                                  |
                                  v
                 validated result envelope --> media normalization --> Prisma + storage
                                  |
                                  v
                  task projection / polling or SSE --> runtime callback --> original modal
```

### Runtime Contract Pattern

扩展 `SceneDetectIntegrationRuntime`，但所有输入/输出使用 native `SceneDetectProject`、`Shot`、`VideoMetadata`。现有合同仅声明 `loadProject`、`saveProject`、`resolveMediaRef`、`submitAnalyze`、`submitExtractKeyframes`、`onTaskUpdate`、`canEnterProject` 和 `canExport`。[VERIFIED: src/lib/remake-projects/scenedetect/integration-runtime.ts:1-19]

**实施规则：**

1. `uploadSource` 必须成为一等 port；这是当前合同缺失但 D-05 明确要求的能力。
2. `saveProject` 必须返回 canonical native project、opaque concurrency token 与 ID remap，而非现有 `Promise<void>`；否则 06-06 所要求的 409 recovery 无法把服务端 split UUID 回写到 App state。
3. frame tuple 改变时，先成功提交 native mutation；随后以该 shot revision 派生 extraction task。不要让 selector 的 data URL 成为 worker 输入。
4. task subscription 只暴露项目所有者可见的投影；终态触发一次 canonical reload，取消订阅且不继续 polling。
5. 没有 source 时仍 render App，但传入 embedded runtime 和显式 empty native state；绝不回落到 sample 或 IndexedDB。

### Native Project / Revision Pattern

`SceneDetectProject` 的原生必填骨架是 `schemaVersion: 2`、`type: 'scenedetect-project'`、source metadata、analysis、view 与 `shots`。[VERIFIED: src/vendor/scenedetect/utils/projectStore.ts:3-34] 现有 parser 已限制 `schemaVersion` 为 `2`、type 为 `'scenedetect-project'`，并拒绝无序/越界 frame 与越界 keyframe。[VERIFIED: src/lib/remake-projects/scenedetect/contracts.ts:68-100]

服务端应将 `Shot.id` 固定映射 Waoo UUID；`shotNumber` 只是 sequence，`externalIdentity` 只是 provenance。当前 Phase 5 schema 已有 `RemakeShot.id`、`stableKey`、`externalIdentity`、`sequence`、`reviewStatus`、`needsReview` 和 revision relation。[VERIFIED: prisma/schema.prisma:472-506] Phase 6 migration 需要在此基础上明确 source revision、active/retired revision、media refs、operation/replay 唯一性和并发 token，不能以 JSON payload 搜索作为唯一并发/幂等机制。

### Media Pattern

worker 从 `getObjectBuffer` 获得 current source bytes，再通过 storage `uploadObject` 写 source/keyframes。[VERIFIED: src/lib/storage/index.ts:35-68] executor 的 runtime `/media/...` URL 只能用于 worker 的瞬态读取，result importer 完成前必须复制到 Waoo storage。现有 analyzer 返回的 `firstFrameUrl`、`middleFrameUrl`、`lastFrameUrl` 都是 executor runtime 路径。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/analyzer.py:39-62][VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/analyzer.py:219-228]

## Plan Audit: Required Corrections Before Execution

| 优先级 | 计划 | 发现 | 必须修正 |
|---|---|---|---|
| BLOCKER | 06-05 / 06-08 | `vendor-scenedetect.mjs --check` 要求 vendor hash 与 upstream 完全相同，且 `buildManifest()` 固定 `allowedPatches: []`；任何 App/Header patch 都会被检查拒绝。[VERIFIED: scripts/vendor-scenedetect.mjs:47-65][VERIFIED: scripts/vendor-scenedetect.mjs:82-93] | 将“可登记 patch 的同步/验证机制”作为 06-05 的第一个任务：分别记录 upstream hash、vendored hash、patch ID/说明；check 验证未 patch 文件等于 upstream、已登记 patch 等于受控 digest。`--sync` 还必须能确定性重放 patch，不能简单删除 vendor root 后复制。 |
| BLOCKER | 06-05 / 06-08 | 当前 vendor 本身不符合 Waoo ESLint：`lucide-react` 被 restricted、`ShotInspector` 有条件 Hook、另有 JSX 转义 error。`npm run verify:commit` 因此在 typecheck 前失败；这已由本次研究文档提交尝试复现。受影响文件至少包括 `AnalysisModal.tsx`、`Header.tsx`、`KeyframeSelectorPopover.tsx`、`ShotInspector.tsx`、`ShotList.tsx`、`Timeline.tsx`、`VideoPlayer.tsx`。[VERIFIED: src/vendor/scenedetect/components/AnalysisModal.tsx:1-3][VERIFIED: src/vendor/scenedetect/components/ShotInspector.tsx:1-67][VERIFIED: package.json:93-96] | 规划必须增加一个受控 vendor-lint policy：由配置/目录级规则排除 immutable canonical vendor，或由已登记 patch 在不重写交互的前提下修复所有 error。不能在实施末尾才发现 pre-commit 永远失败，也不能未登记地大面积“本地化” vendor 图标。 |
| BLOCKER | 06-05 / 06-08 | 当前 App 默认加载 sample，启动时又恢复 IndexedDB recent/draft；host 无 source 时 `enabled=false`，完全不会显示原上传入口。[VERIFIED: src/vendor/scenedetect/App.tsx:63-78][VERIFIED: src/vendor/scenedetect/App.tsx:615-654][VERIFIED: src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx:66-69] | embedded props 必须让空 source 挂载完整 App、跳过 sample/recent/draft restore，并只经 runtime 上传。将此作为 D-03 测试的首要断言。 |
| BLOCKER | 06-05 / 06-06 | 现有 runtime 没有 `uploadSource`，`saveProject` 返回 `Promise<void>`，keyframe submit input 也没有 frame tuple。[VERIFIED: src/lib/remake-projects/scenedetect/integration-runtime.ts:4-13] | 在编写 App branch 前锁定新的 typed port：upload、canonical save result/eTag/remap、selected frame tuple 或保存后可寻址 shot revision、task result/reload。 |
| HIGH | 06-03 / 06-05 / 06-08 | executor `/api/analyze` 与 `/api/keyframes` 是同步 HTTP；没有 streaming/SSE 进度。`AnalysisModal` 却显示具体百分比和“预计剩余时间”。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/main.py:49-113][VERIFIED: src/vendor/scenedetect/components/AnalysisModal.tsx:48-70] | task callback 只能报告真实的 queue/worker 阶段，例如 queued、source-read、executor-call、import、completed；没有 executor telemetry 时不虚构算法百分比/ETA。若必须保留原 modal，改成 indeterminate/阶段文本是必要 embedded patch。 |
| HIGH | 06-02 / 06-03 | 计划写“worker bytes 或受限 executor URL”，但 current media allowlist 只允许 `image/jpeg`、`image/png`、`video/mp4`、`video/webm`，单对象上限 20 MiB。[VERIFIED: src/lib/remake-projects/scenedetect/media.ts:1-40] | source upload 与 executor response 必须分开限制；不能把原视频复用到 20 MiB media helper。对 MOV/M4V 制定受控 MIME/字节上限和服务器 probe，不接受浏览器 metadata 为最终值。 |
| HIGH | 06-02 / 06-04 | 通用 `/api/storage/sign` 只接收 `key` 后直接 redirect，不做用户或项目授权。[VERIFIED: src/app/api/storage/sign/route.ts:7-20] | `resolveMediaRef` 不得把 raw key 交给这个通用 endpoint。新增或复用 project-scoped、鉴权、短时且不暴露 key 的 media route；同时满足视频播放与 canvas 抽帧的 same-origin/CORS 要求。 |
| HIGH | 06-06 / 06-07 | schema 当前没有 source revision、active/retired flag、keyframe media tuple、ETag 或 task-to-revision relation；单靠 `RemakeShotRevision.payload` 无法可靠筛选 current/retired state。[VERIFIED: prisma/schema.prisma:459-552] | 06-01 migration 需要覆盖 source history；06-06 migration/fields 必须先于 mutation gate 明确 current pointer 或 append-only revision query。每个 extraction result 绑定 sourceRevision + shotRevision + tuple hash。 |
| MEDIUM | 06-03 | 新 task type 会自动入 text queue，但当前 `processTextTask` switch 没有两个 SceneDetect case，未知 type 会抛 `Unsupported text task type`。[VERIFIED: src/lib/task/queues.ts:68-101][VERIFIED: src/lib/workers/text.worker.ts:680-712] | 06-03 必须同时添加 handler import、两个 switch case、task type catalog/coverage 更新；这是正确的复用边界，不需新 queue。 |
| MEDIUM | 06-07 | 原 selector 会在预览期间调用 canvas `toDataURL`，而 signed object URL 会 redirect 到对象存储；跨域视频若未设 CORS 将使 canvas tainted。[VERIFIED: src/vendor/scenedetect/components/KeyframeSelectorPopover.tsx:57-73][VERIFIED: src/vendor/scenedetect/utils/sceneDetector.ts:8-29] | 给 editor 的 `VideoMetadata.url` 使用同源、项目授权的播放/proxy route，或验证 storage CORS 后设置 video `crossOrigin`；把此加入 browser integration test。 |
| MEDIUM | 06-08 | CSS 的 `isolation: isolate` 只创建 stacking context，不会单独把 `position: fixed` modal 限制在 host；vendor 有多个 `fixed ... z-50` modal/overlay。[VERIFIED: src/app/[locale]/workspace/[projectId]/modes/remake/scenedetect/scenedetect-stage.css:1-16][VERIFIED: src/vendor/scenedetect/components/AnalysisModal.tsx:29-33] | 在允许 patch 内采用明确 portal/container strategy，或由稳定的 containing block 和 scoped z-index 实测验证，不可只假设 `isolation` 完成 containment。 |
| MEDIUM | 06-08 | source audit 仍声称“research disabled，无 RESEARCH.md”“Phase 6 无 CONTEXT.md”，与当前 phase 实际状态不符。 | 规划复核时把 06-RESEARCH.md 与 06-CONTEXT.md 作为必读输入；不应再把两者排除。 |

## Don't Hand-Roll

| 问题 | 不要构建 | 应复用 | 原因 |
|---|---|---|---|
| 场景切分与帧边界换算 | JS/TS 版本的 SceneDetect 算法 | 现有 pySceneDetect `ContentDetector` executor | backend 已处理 half-open boundary 到 inclusive frame：`end_frame = scene_end_boundary_frame - 1`。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/analyzer.py:11-16] |
| 首/中/尾帧读取 | 浏览器导出作为持久真相 | executor + Waoo worker/storage | 后端已执行视频帧定位、JPEG 写入、bounds clamp；浏览器 canvas 仅适合瞬态候选预览。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/analyzer.py:127-168] |
| 编辑器布局/快捷键/undo 状态机 | Waoo 的第二套 Timeline/Inspector | `SceneDetectEmbeddedApp` 完整树 | D-01/D-13 要求整 App 复用；拆组件会产生两套状态和行为漂移。 |
| Task 重试、状态恢复、队列 | SceneDetect 专用轮询/队列表 | Waoo Task + BullMQ + worker lifecycle | `withTaskLifecycle` 已统一 processing、失败与事件发布。[VERIFIED: src/lib/workers/shared.ts:319-410] |
| native payload 验证 | 手工 `as` 类型断言 | Zod envelope + `parseSceneDetectInput` | 已有 parser 会拒绝非法 frame/keyframe range。[VERIFIED: src/lib/remake-projects/scenedetect/contracts.ts:39-100] |

## Common Pitfalls

### 1. 把原 App 的本地示例/IndexedDB 带进 embedded mode

**原因：** App 当前默认 sample，并在 mount 时调用 `listRecentProjects()`/`loadDraft()`。[VERIFIED: src/vendor/scenedetect/App.tsx:63-78][VERIFIED: src/vendor/scenedetect/App.tsx:615-654]  
**规避：** runtime prop 必须同时控制 initial state、save effect、recent restore、ProjectManager 和 export fallback；仅替换一个 save 函数不够。  
**预警：** 刷新后显示 sample、恢复其它浏览器项目、或网络断开时下载 `.scenedetect.json`。

### 2. 将 `shotNumber` 或数组索引当作稳定身份

**原因：** split 会创建 `shot-${Date.now()}-split`，后续又重新编号 `shotNumber`。[VERIFIED: src/vendor/scenedetect/App.tsx:323-388]  
**规避：** UI 内 `Shot.id` 必须始终是 Waoo UUID；server 生成 split UUID，response remap 回 App；sequence 只用于显示。  
**预警：** split/merge 后既有 prompt/output 关联到错误 Shot，或 save payload 因 array reorder 产生误删。

### 3. 同步 executor 造成伪进度和请求超时

**原因：** FastAPI 将上传、检测和 keyframe extraction 置于同一次响应。[VERIFIED: /Volumes/KINGSTON/projects/SceneDetect/backend/main.py:49-113]  
**规避：** Waoo task 显示可靠状态机，而非伪百分比；server client 设置连接/总时限、payload 和 response bytes 限制。长视频上线前须由 executor 提供真实 progress 协议，属于独立的 executor capability 变更。  
**预警：** modal 百分比长时间不变、worker heartbeat 超时、用户看到虚构 ETA。

### 4. 关键帧预览 URL 被持久化或跨域污染 canvas

**原因：** selector 将候选 URL 与 frame tuple 一起送回 App，但候选图来自 `captureVideoFrame`。[VERIFIED: src/vendor/scenedetect/components/KeyframeSelectorPopover.tsx:57-92]  
**规避：** mutation schema 只接受 frame tuple；worker 写入三张受控 media ref，客户端 reload canonical signed/same-origin URL。  
**预警：** DB 出现 `blob:`、`data:`、executor `/media/` URL，或选帧显示 `SecurityError`。

### 5. 忽略 vendor guard 与 upstream 更新机制

**原因：** 当前 sync 会递归删除 vendor root 并从 source 复制，check 又要求 upstream hash 完全一致。[VERIFIED: scripts/vendor-scenedetect.mjs:68-93]  
**规避：** patch 必须是确定性的受控 overlay，并可在 sync/check 中复放/核验。  
**预警：** 06-05 修改 App 后 `node scripts/vendor-scenedetect.mjs --check` 立即失败，或上游同步覆盖 embedded patch。

## State of the Art

| 当前原实现 | Phase 6 目标实现 | 影响 |
|---|---|---|
| IndexedDB `projects`/`drafts` 和 recent list | Waoo Prisma/object storage/source revision | 刷新、浏览器关闭、Web/worker 重启后可恢复同一项目，而非本地浏览器副本。 |
| `File`、`URL.createObjectURL`、`pendingVideoFile` | server-owned source object + revision | Blob 只在上传瞬态存在，任务可由 worker 重放。 |
| 浏览器直接 `fetch('/api/analyze')` | authenticated Waoo API → Task → worker → fixed executor | 不暴露 executor 为用户可控代理，统一 retry/provenance。 |
| 本地 `saveProjectToServer`/JSON fallback | versioned native project save + immutable revisions | 任何边界/帧变更都可审计、并发冲突可见、下游可失效。 |

## Environment Availability

| 依赖 | 所需能力 | 可用 | 已验证版本/状态 | 回退 |
|---|---|---:|---|---|
| Node.js | Next/worker/runtime | 是 | `v22.22.3` | 无需回退 |
| npm | 项目测试与 build | 是 | `10.9.8` | 无需回退 |
| ffprobe | 可选服务器 probe/诊断 | 是 | `8.1.1` | 可不作为 executor truth；仍由 OpenCV/SceneDetect probe 覆盖 |
| Docker | executor/infra 本地运行 | 是 | `29.3.0` | 可使用受管 executor |
| Python SceneDetect/OpenCV | 本地 executor | 否 | `ModuleNotFoundError: No module named 'scenedetect'` | 部署独立 executor image/venv |
| SceneDetect executor health | SHOT-02/03/06 的真实执行 | 否 | `127.0.0.1:8000/api/health` 连接失败 | 必须设置可访问的 `SCENEDETECT_EXECUTOR_BASE_URL`；无可执行回退 |

**无回退阻塞项：** Python executor 当前不可用。06-03 的 executor client/worker 代码可测试 mock 路径，但真实 E2E 与 SHOT-02、SHOT-06 交付前必须有可健康检查的 executor。

## Validation Architecture

### Test Framework

| 属性 | 值 |
|---|---|
| 框架 | Vitest `^2.1.8`，Playwright `^1.62.1`。[VERIFIED: package.json:163-181] |
| 快速命令 | `BILLING_TEST_BOOTSTRAP=0 npx vitest run <focused-files>` |
| vendor gate | `node scripts/vendor-scenedetect.mjs --check` |
| task catalog gate | `npm run check:test-tasktype-coverage` |
| typecheck | `npm run typecheck` |

### Requirement → Test Map

| 需求 | 自动化证据 | 必测行为 |
|---|---|---|
| SHOT-01 | source route integration | 授权、格式/大小、operation replay、source replacement、storage/DB 失败补偿 |
| SHOT-02 | executor client + worker unit/integration | fixed base URL、health/error/timeout、current source bytes、task type switch、result import |
| SHOT-03 | envelope/adapter/native contract | version/source/frame/media 校验，stable UUID，legacy 显式 import，replay/409 |
| SHOT-04 | host unit + Playwright | 无 source 仍 render canonical App，未 deep-import 子组件，深色 scope/播放器/Timeline/ShotList 可用 |
| SHOT-05 | mutation integration | If-Match 409、split/remap、merge/delete/undo/redo、immutable revision/invalidation |
| SHOT-06 | keyframe integration | tuple change 触发 task，三帧落 storage，stale callback 不覆盖 current revision |
| SHOT-07 | review-gate unit + E2E | keep 不等于任务完成；缺帧/stale/needsReview 均不可 promptEligible；batch 返回逐项原因 |
| SHOT-08 | mutation/invalidation integration | 已确认 Shot 修改后保留旧 revision，受影响 output 明确 `needs_review` |

### Wave 0 Gaps

- [ ] 先修复 vendor sync/check 使 registered patch 可验证；这是所有 App 修改测试的前置。
- [ ] executor contract fixture：模拟真实 `/api/analyze` 与 `/api/keyframes` 的同步 response，不伪造流式进度。
- [ ] project-scoped media playback test：验证 Video/canvas 可读、跨项目不可读、DB 无 `blob:`/`data:`/executor runtime URL。
- [ ] actual executor health integration（可在有服务环境才运行）：验证 `SCENEDETECT_EXECUTOR_BASE_URL` 与最小视频。

## Security Domain

### Applicable ASVS Categories

| ASVS 类别 | 适用 | 标准控制 |
|---|---|---|
| V2 Authentication | 是 | 每个 project route 使用会话认证。 |
| V3 Session Management | 是 | callback/task/media route 均以当前会话和 project ownership 过滤。 |
| V4 Access Control | 是 | `requireProjectAuthLight` 验证 project owner，但 route 还必须额外确认 `project.type === 'remake'`。[VERIFIED: src/lib/api-auth.ts:319-343] |
| V5 Input Validation | 是 | multipart 限制、Zod envelope、frame/source/current revision/server-generated IDs。 |
| V6 Cryptography | 否（本阶段不实现加密） | 使用既有短时签名 URL；不手写签名算法。 |

### Known Threat Patterns

| 模式 | STRIDE | 必要缓解 |
|---|---|---|
| 用户指定 executor URL | SSRF | base URL 仅来自 server env，固定 `/api/health`、`/api/analyze`、`/api/keyframes` 路径。 |
| 跨项目 Shot/media/task ID | Elevation of Privilege / Information Disclosure | 每次 load/save/subscribe/media resolve 将 ID 绑定 authenticated `projectId`，不信任 native payload 身份。 |
| 过期 worker 回调覆盖新 source/revision | Tampering | 在提交媒体/结果前重查 current sourceRevision、shotRevision 和 tuple hash；过期结果只记录 provenance。 |
| 任意 storage signing | Information Disclosure | 不向浏览器交付 raw storage key，使用 project-scoped opaque media resolver；通用 sign route 不可作为本阶段授权边界。 |
| 大视频或大量 keyframe task | Denial of Service | multipart/source/response 上限、tuple dedupe、operation key、queue concurrency、worker timeout 和取消清理。 |

## Assumptions Log

| # | 假设 | 区域 | 错误风险 |
|---|---|---|---|
| A1 | 生产环境会以独立网络服务部署现有 FastAPI executor，并提供仅 Waoo worker 可访问的 URL。 | External Executor | 高：若无可用服务，SHOT-02/06 不能真实交付。 |
| A2 | Waoo 可提供一个同源、项目授权的视频播放端点，满足浏览器 canvas 抽帧所需 CORS 约束。 | Media Pattern | 高：否则 KeyframeSelector 候选预览会失败。 |
| A3 | 06-01/06-06 可以调整 Prisma migration 以引入 source/revision current-pointer 与 task/media 关联字段。 | Native Project / Revision | 高：没有显式持久化关系就无法可靠实现 stale callback、retire 与 review gate。 |

## Open Questions (RESOLVED)

1. **executor 部署与认证：已解决。** Phase 6 使用仅服务端可见的 SCENEDETECT_EXECUTOR_BASE_URL 和 SCENEDETECT_EXECUTOR_TOKEN；worker 只调用固定 health/analyze/keyframes 路径，并使用可配置连接/总超时、source/response 字节上限与 readiness health gate。浏览器永远不能访问或指定 executor URL。专用内网、service token 或更强的 mTLS 由部署环境选择，但都必须满足该 server-only 合同。

2. **source/object 生命周期：已解决。** Phase 6 对 superseded source、retired Shot revision、旧 keyframe media 和 provenance 只做状态标记并保留审计，不在 upload/mutation/import 路径物理删除。Phase 6 的 revision 只增，不做压缩、折叠、合并或 GC；retention/compaction 在 Phase 7 规划时评估，但不自动纳入 Phase 7 实现范围。

3. **真实进度协议：已解决。** Phase 6 使用 queued/source-read/executor-call/import/completed 等真实 stage-only 状态；同步 executor-call 显示 indeterminate，不显示算法百分比或 ETA。executor job/SSE 协议演进不属于本阶段，也不阻塞主闭环。

## Sources

### Primary (HIGH confidence)

- `.planning/phases/06-scenedetect/06-CONTEXT.md`：锁定复用、事实来源、审核和 host 边界。
- `.planning/ROADMAP.md`、`.planning/REQUIREMENTS.md`：Phase 6 目标与 `SHOT-01..SHOT-08`。
- `src/vendor/scenedetect/App.tsx`、`types.ts`、`utils/projectStore.ts`、`utils/sceneDetector.ts`、关键组件：真实 native UI/state/I/O seam。
- `/Volumes/KINGSTON/projects/SceneDetect/backend/main.py`、`analyzer.py`：真实 executor 协议、帧边界与 keyframe 输出。
- `scripts/vendor-scenedetect.mjs`、`VENDOR.json`：canonical 同步/hash 的当前限制。
- `prisma/schema.prisma`、`src/lib/task/*`、`src/lib/storage/*`、`SceneDetectStageHost.tsx`：Waoo 现有持久化、任务、媒体与 host 能力。

## Metadata

**置信度分解：**

- Standard stack：HIGH；版本和能力均由本地 manifest/package/source 读取验证。
- Architecture：HIGH；native App、executor、StageHost、storage/worker 和 schema 调用边界已直接读取。
- Pitfalls：HIGH；均来自当前代码中可复现的 guard、local persistence、synchronous API 或 media route 行为。

**有效期：** 本地代码变更前有效；特别是 vendor sync、executor API 或 Prisma schema 修改后必须重审。
