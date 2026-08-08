---
status: resolved
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
- 2026-08-08 19:5x：root cause 修正（两层），fix #2 implemented（runtime-client 绑定宿主 id），typecheck ✅ lint ✅
- 2026-08-08 20:14：用户实测——请求已打宿主项目（e44be650）✅，但 route 500 INTERNAL_ERROR + worker SCENEDETECT_TASK_FIELD_NOT_ALLOWED:capability
- 2026-08-08 20:18：fix #3 implemented（route taskId 提取 + executor payload 去 capability/adapterVersion），typecheck ✅ lint ✅，worker 已热重载；待用户实测（预期 202 + 任务 completed）
- 2026-08-08 21:10：worker 的 `flowId` 拒绝已由 b85b640 修复：`normalizeTaskPayload` 注入 flow metadata，而 SceneDetect parser 现显式允许该基础设施字段。当前聚焦：路由集成测试仍 mock 旧 `{ task: { id } }` 返回值，但实际 `submitTask` 合同为 `{ taskId }`；先以该测试 RED 复现，再更新 mock 并添加 normalizer→parser 回归覆盖。
- 2026-08-08 21:10：RED：`tests/integration/api/remake-projects-scenedetect-runtime.test.ts` 返回 500（route.ts:40），因为旧 mock 没有 `taskId`；这与 submitTask 的实际成功返回值不一致。
- 2026-08-08 21:11：GREEN：更新 mock 为 `{ taskId: 'task-1' }` 并断言 202 响应体；新增 `normalizeTaskPayload(SCENEDETECT_ANALYZE) → parseSceneDetectTaskPayload` 回归测试，确认 flow metadata 被接受而未知字段仍被拒绝。focused suites 6/6 passed；typecheck ✅；针对两个变更测试 lint ✅；相邻 task-submitter helper suite 8/8 passed（本地 Redis:6380 不可用只产生 stderr，不影响退出状态）。
- 2026-08-08 21:12：resolved at source level: b85b640 allows normalized flow metadata; regression coverage protects the parser boundary and the route response contract. A local browser retry remains an operational confirmation that the watched worker is running this revision.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The stale route-test mock returns the pre-unified `{ task: { id } }` shape, so the route rejects it despite the real `submitTask` returning `{ taskId }`; separately, run-runtime injects `flowId` metadata that must remain accepted by the SceneDetect worker parser."
  confirming_evidence:
    - "The focused route test returns 500 at analyze/route.ts:40 because its mock has no `taskId`, while `submitTask` returns `taskId` on every successful branch."
    - "`normalizeTaskPayload` injects flowId, stage fields, and meta; b85b640 explicitly allows those fields in `parseSceneDetectTaskPayload`."
  falsification_test: "After changing the mock to `{ taskId: 'task-1' }`, the route test must return 202 with taskId; a normalized SceneDetect payload must parse, while an unrecognized field must still be rejected."
  fix_rationale: "Aligning the test double with the submitter's real response validates the route extraction change, and the normalizer-to-parser test protects the exact injected-field contract that caused the worker rejection."
  blind_spots: "This unit/integration coverage cannot prove the already-running local worker has reloaded b85b640; a browser retry still needs to observe a completed task."
  candidate_causes:
    - "code: old test mock shape no longer matches submitTask's public response contract."
    - "config/environment: a worker process started before b85b640 could still execute the prior strict whitelist."
  and_gate: "no; either the source-level whitelist handles normalized flow metadata, or a stale process must be restarted. The test mock mismatch only affects automated verification."

resolution:
  root_cause: "The strict SceneDetect payload parser did not originally recognize run-runtime metadata (`flowId`, stage fields, and `meta`) injected by `normalizeTaskPayload`; b85b640 adds those allowed infrastructure fields. The route regression test then remained stale by mocking the older nested task response instead of the submitter's flat `taskId` response."
  fix: "Allow normalized infrastructure fields in the SceneDetect parser (b85b640); align the route mock with `{ taskId }` and add normalizer-to-parser contract coverage."
  oracle_type: "specified"
  verification:
    target_test: "pass: tests/integration/api/remake-projects-scenedetect-runtime.test.ts + tests/unit/remake-projects/scenedetect-task-contract.test.ts (6/6)"
    adjacent_tests: "pass: tests/unit/helpers/task-submitter-helpers.test.ts + SceneDetect task contract (8/8)"
    typecheck: "pass"
    lint: "pass: touched test files"
    mutation_check: "skipped: no scoped Stryker configuration available"
    no_op_deletion: "pass: additive whitelist fix plus stronger route/payload assertions"
    runtime_worker: "pending: browser retry must confirm the local worker has reloaded b85b640"

next_action: "Retry Confirm Analysis in the local workflow and confirm the task is accepted and completes without SCENEDETECT_TASK_FIELD_NOT_ALLOWED:flowId."

## Prevention

why_not_caught: "The task normalizer and SceneDetect parser were tested independently, so infrastructure fields injected between them were absent from parser coverage."
guard: "The normalizer-to-parser regression test validates allowed flow metadata and rejects unknown payload fields; the route integration test models the public `{ taskId }` submitter response."
