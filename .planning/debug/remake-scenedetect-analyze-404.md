---
status: open
trigger: "启动镜头分析报错 SceneDetectHttpError: SceneDetect request failed (404) — runtime-client.ts:8 → App.tsx:236 handleStartAnalysis"
created: 2026-08-08
updated: 2026-08-08
---

# Debug: SceneDetect Analyze 404 (projectId mismatch)

## Symptom
用户在翻拍项目工作台（e44be650，火影忍者）上传视频成功后，点击"启动镜头分析"报错：
```
SceneDetectHttpError: SceneDetect request failed (404)
    at json (runtime-client.ts:8:136)
    at async handleStartAnalysis (App.tsx:236:27)
```

## Evidence
1. dev server 日志（proc_171050aebe84）：
   - `POST /api/remake-projects/e44be650-.../source 201` — 上传成功（宿主 projectId 正确）
   - `POST /api/remake-projects/ec37eb9a-.../scenedetect/analyze 404 in 1142ms` — 分析请求打到**不存在的项目 ID**
2. MySQL：`ec37eb9a` 项目在 projects 表**不存在**；e44be650 存在（type=remake，有 remake_projects + 1 个 uploaded_pending source）
3. analyze 路由 404 分支：`if (!project || project.type !== 'remake' || !project.remakeProject) throw new ApiError('NOT_FOUND')`
4. 代码链：
   - `RemakeWorkbench.tsx:69`：`<SceneDetectStageHost projectId={projectId} initialProject={null} ... />`（06-08 生产挂载未真正注入项目数据）
   - `SceneDetectStageHost.tsx` useEffect：异步 `runtime.loadProject(projectId)` → setProject(loaded) —— **但 App 的 useState 只在首次渲染读 initialProject，prop 后续变化不生效**
   - `App.tsx:78`：`projectRecord = initialProject || (embedded ? null : ...)` → 初始 null
   - `App.tsx:107` useMemo：`createProject(projectName, metadata, shots, status, currentFrame, activeShotId, projectRecord || undefined)` → metadata 更新（上传后）触发重建，`projectRecord` 仍为 null → `existing=undefined`
   - `projectStore.ts:146`：`id: existing?.project.id || crypto.randomUUID()` → **随机 UUID = ec37eb9a**
   - `App.tsx:236`：`runtime.submitAnalyze({ projectId: projectRecord.project.id, ... })` → 随机 UUID → waoowaoo 404

## Root Cause
vendored SceneDetect 应用的项目 ID 与宿主 waoowaoo projectId **脱钩**，且根因有两层：

**第一层（已修，StageHost）**：`RemakeWorkbench.tsx:69` 传 `initialProject={null}`；StageHost 异步 loadProject 的结果未在 App 首次渲染前注入（useState 初始化不响应 prop 变化）→ App 挂载时 projectRecord=null。

**第二层（本次修正，runtime 绑定）**：App.tsx:216-217 `handleUpload` 在上传后用 `createProject(..., null)` **无条件重建 projectRecord → 每次上传生成新的随机 UUID**（ec37eb9a → 80a40de6 → e21f2d62，每次点击都不同）。随后 App 所有用 `projectRecord.project.id` 的操作（submitAnalyze/reloadProject/saveProject）都打到这个随机 UUID → waoowaoo DB 无此项目 → `ApiError('NOT_FOUND')` → 404。

**修复语义**：embedded 场景下 runtime 由宿主创建时绑定 projectId（`createSceneDetectRuntime(projectId)`），runtime 层**忽略 App 传入的任意 id**，统一用绑定 projectId（analyze/save/reload/poll/upload）。vendored App 内部 projectRecord 的随机 UUID 不再影响请求目标。src/lib 层修复，不改 vendored（保持 VENDOR provenance 校验）。

## Fix Plan（write set=2 文件）
1. ~~`SceneDetectStageHost.tsx`：等待 loadProject 完成再挂载 canonical App（已提交 cae1dc5）~~
2. `src/lib/remake-projects/scenedetect/runtime-client.ts`：submitAnalyze / saveProject / reloadProject 忽略调用方 id，改用绑定 projectId（已完成）

## Verification
1. typecheck ✅ lint ✅（全量）
2. 路由层 401 探测 ✅
3. browser 实测（用户）：上传视频 → 点分析 → 日志应出现 `POST /api/remake-projects/e44be650-.../scenedetect/analyze`（宿主 id）且非 404

## Status Log
- 2026-08-08 19:4x：diagnosed，root cause 确认，修复待实施
- 2026-08-08 19:47：fix #1 implemented（StageHost），typecheck ✅ lint ✅；用户实测仍 404 → 日志显示每次点击新随机 UUID（80a40de6/e21f2d62）
- 2026-08-08 19:5x：root cause 修正（两层），fix #2 implemented（runtime-client 绑定宿主 id），typecheck ✅ lint ✅；待用户实测
