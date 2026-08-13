---
status: resolved
trigger: "火影忍者 镜头四：点击「视频生成」显示「生成中…」一段时间后按钮复原，生成版本区不出现视频，接口未收到请求（用户观察）"
created: 2026-08-13
updated: 2026-08-13
---

# Debug Session: Remake video generate no response

## Symptoms

- 项目 `火影忍者`（e44be650-a801-4a76-b7e3-255d018d49b1），镜头四（shot `438838f9-…`，sequence 4，currentRevision 8）。
- 点击「视频生成」→ 按钮短暂显示「生成中…」→ 恢复「视频生成」；下方「生成版本」不出现任何视频；无报错。
- 用户反馈监控接口未收到视频生成请求。

## Current Focus

- hypothesis: 该镜头已具备生成条件（Middle 已采用关键帧、Video Prompt 已批准、动作表存在），请求应能到达服务端并创建任务；「无请求」是监控口径/旧打包产物导致，真正失败发生在服务端校验（uuid 或能力字段缺失），返回 400 且错误展示不可见或被误判为无反应。

## Evidence

- 服务端日志 `logs/app.log`（+08:00）：
  - `09:36:26 / 09:36:44` POST `/api/remake-projects/…/video` → `REMAKE_VIDEO_PROMPT_NOT_APPROVED`（当时 prompt 未通过 currentness，现已通过：`403412de` v6 approved、invalidatedAt null、snapshot shotRevision=8 与活动 revision 8 一致、keyframeMediaRefs 一致）。
  - `12:13:55` → ZodError `orderedReferences[0].mediaId: Invalid uuid`（真实 `remake_output_versions.mediaId` 存的是 `images/remake/…jpg` 存储 key，非 MediaObject uuid）。
  - `13:45:10`（curl 复现）→ `CAPABILITY_REQUIRED: capabilities.ark::doubao-seedance-2-0-260128.generationMode`（options 缺 generationMode 时提交被拒）。
- 数据库 `remake_output_versions`：`keyframe_candidate`/`generated` 的 `mediaId` 4/4 为 `images/…` 存储 key；`action_sheet` 为 uuid。`remake_video_batches/versions/tracks` 此前为 0。
- 采用的关键帧 `6ba9d87c` → outputVersion `a2334369`，mediaId = `images/remake/…/keyframes-….jpg`（storage key）。
- 内网 token 复现：`options: {}` → 400 CAPABILITY_REQUIRED(generationMode)；补齐 generationMode 后 → 202（uuid 修复生效）；补齐全部能力字段后 → 202（任务创建成功）。

## Eliminated

- 前端 fetch 未发出：`handleGenerate` 代码路径（`RemakeVideoStage.tsx:349`）在 canSubmit=true 时必然调用 `fetch(POST /api/remake-projects/{projectId}/video)`；日志证明用户点击确实到达服务端（09:36/12:13 的 POST 记录）。「无请求」为用户监控层口径（可能监控 worker/队列或旧 bundle）。
- 数据未就绪：镜头四 Middle 关键帧已采用、Video Prompt 已批准、动作表存在 → 生成条件满足。
- 数据库 schema：`remake_invalidations.videoTrackId` 已存在（07:29 的列缺失错误为迁移未应用时期的瞬时错误）。

## Resolution

- root_cause（多层）：
  1. `buildVideoGenerationSubmission` 把真实 keyframe `outputVersion.mediaId`（对象存储 key）直接冻结进 `orderedReferences[].mediaId`，而 `videoInputSnapshotSchema.mediaId` 要求 uuid → 提交 400（12:13 命中；此前 phase-09 从未在真实采用关键帧上跑通）。
  2. 提交时 `resolveProjectModelCapabilityGenerationOptions` 对 catalog 声明的必填能力字段（generationMode/generateAudio/resolution）做严格校验，服务端未兜底默认，依赖 UI 发送；options 缺失任一项即 400 CAPABILITY_REQUIRED（13:45 复现）。
  3. `REMAKE_VIDEO_PROMPT_NOT_APPROVED`（09:36）为 prompt currentness 瞬时不通过，现已通过。
- fix：
  - `src/lib/remake-projects/video/service.ts`：新增 `resolveStableMediaRef(raw)`，用 `resolveMediaRef(raw, raw)` 把存储 key 归一化为 MediaObject uuid（`mediaId`），保留原始引用为 `mediaUrl`；关键帧/动作表候选冻结归一化后的引用；`assertVideoSubmissionCurrent` 用 `(ref.mediaUrl ?? ref.mediaId)` 做原始值新鲜度比较。
  - `src/lib/remake-projects/video/service.ts`：对 catalog 声明的全部能力字段做服务端兜底默认（取首个兼容值；duration 仍按镜头推导），不再依赖客户端发送 generationMode 等。
  - `src/lib/workers/handlers/remake-video.ts`：Ark content[] 组装（图片 base64 `reference_image` + 音频签名 `reference_audio`），非 Ark 降级单主图；`generationMode` 尊重冻结快照。
- verification：
  - 内网 token 对真实镜头四：`options: {}` → `202 {taskId}`（uuid + 能力默认修复生效）。
  - `resolveMediaRef('images/remake/…jpg')` 真实库验证 → `{ id: uuid, storageKey }`。
  - `BILLING_TEST_BOOTSTRAP=1 npx vitest run tests/integration/api/remake-projects-video.test.ts`（14 passed，含 storage-key 归一化回归 + 能力默认回归）。
  - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/remake-video.test.ts tests/unit/remake-projects/remake-video-task-contract.test.ts tests/unit/remake-projects/remake-video-reference-plan.test.ts`（24 passed）。
  - `npx tsc --noEmit`（passed）。
- files_changed:
  - `src/lib/remake-projects/video/service.ts`
  - `src/lib/workers/handlers/remake-video.ts`
  - `src/lib/remake-projects/video/contracts.ts`
  - `src/lib/remake-projects/video/reference-plan.ts`（新）
  - `src/lib/remake-projects/keyframes/video-inputs.ts`
  - `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx`
  - `src/app/api/remake-projects/[projectId]/video/route.ts`
  - `tests/integration/api/remake-projects-video.test.ts`
  - `tests/unit/worker/remake-video.test.ts`
  - `tests/unit/remake-projects/remake-video-reference-plan.test.ts`（新）
  - `tests/unit/remake-projects/remake-video-input-contract.test.ts`
  - `tests/unit/remake-projects/remake-video-stage.test.tsx`
