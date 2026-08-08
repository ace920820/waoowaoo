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
vendored SceneDetect 应用的项目 ID 与宿主 waoowaoo projectId **脱钩**：
- 上传路径用宿主 projectId（StageHost 的 `projectId` prop → uploadSource），✅
- 分析路径用 App 内部 `projectRecord.project.id`（首次为空时被 `createProject` 用 `crypto.randomUUID()` 生成），❌
- StageHost 虽然异步 loadProject 成功，但结果未在 App **首次渲染前**注入（useState 初始化不响应 prop 变化）

## Fix Plan（最小修复，write set=1 文件）
`SceneDetectStageHost.tsx`：等待 `runtime.loadProject(projectId)` 完成（loadState='ready'）**再挂载** canonical App，`initialProject` 传加载后的服务端项目（id=宿主 projectId），并加 `key={projectId}` 防止项目切换时状态残留。加载中显示占位。

不改 `RemakeWorkbench.tsx`（`initialProject={null}` 保留，StageHost 自管加载）。
不改 vendored `App.tsx` / `projectStore.ts`（保持 canonical 完整性，VENDOR.json 校验不变）。

## Verification
1. typecheck + lint（相关文件）
2. browser 实测：打开工作台 → 上传视频 → 点分析 → 请求应为 `POST /api/remake-projects/e44be650-.../scenedetect/analyze` → 202（而非 404）
3. 任务在 Bull 队列出现，worker 消费，前端进度更新

## Status Log
- 2026-08-08 19:4x：diagnosed，root cause 确认，修复待实施
- 2026-08-08 19:47：fix implemented（SceneDetectStageHost.tsx + css），typecheck ✅ lint ✅ 路由层 401 验证 ✅；待用户浏览器实测（analyze 应 202 而非 404）
