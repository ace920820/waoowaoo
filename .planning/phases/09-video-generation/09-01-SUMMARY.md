# Plan 09-01 Summary: 视频生成数据模型、Task 契约、API 与 Worker

## Status: completed

## What was delivered

建立了 Remake 单 Shot 视频生成的端到端后端骨架，从鉴权提交到持久化播放全程复用现有 Task / 视频 Worker / 模型网关 / 对象存储 / 计费链路，不新增独立队列、provider 解析器或存储上传器。

### Durable schema & migration
- `RemakeVideoTrack` / `RemakeVideoBatch` / `RemakeVideoVersion` / `RemakeVideoAdoptionEvent` 四张新表，沿用 keyframe 的追加版本、显式采用、append-only adoption event 模式。
- `orderedReferences` 字段按固定顺序冻结每次生成的完整参考列表（D-06 不可变收据）。
- `remake_provenance_records` 和 `remake_invalidations` 各追加三列用于视频血缘与复核追踪。
- Migration: `prisma/migrations/20260812090000_add_remake_video_generation/migration.sql`。

### Contracts
- `src/lib/remake-projects/video/contracts.ts`：`videoInputSnapshotSchema`、按 role/ordinal 排序的 `orderedReferences`、`videoInputFingerprint`、D-03/D-04 顺序与门禁断言。
- `src/lib/remake-projects/video/task-contract.ts`：`buildRemakeVideoTaskDescriptor` / `parseRemakeVideoTaskPayload`，包含 cross-project 校验、fingerprint 校验、dedupeKey。

### Service & API
- `src/lib/remake-projects/video/service.ts`：`buildVideoGenerationSubmission`（含 D-10/D-11 时长推导、模型能力归一化、固定顺序参考构建）、`appendVideoGenerationBatch`（事务化追加 + provenance 记录）、`getVideoTrackDetail`、`setVideoReviewNote`、`adoptVideoVersion`、`reconfirmVideoVersion`。
- `src/app/api/remake-projects/[projectId]/video/route.ts`：鉴权 + Zod 边界 + submitTask，返回 202 与 `inputFingerprint`。

### Worker
- `src/lib/workers/handlers/remake-video.ts`：preflight 校验 → 解析参考 → 调用 `resolveVideoSourceFromGeneration` → `uploadVideoSourceToCos` → `ensureMediaObjectFromStorageKey` → `remake_video_persist` 取消点 → 事务化 `appendVideoGenerationBatch`。
- 已在 `video.worker.ts` 的 switch 中注册 `REMAKE_VIDEO_GENERATE`，走现有 VIDEO 队列。

### Task system wiring
- `TASK_TYPE.REMAKE_VIDEO_GENERATE` 加入视频集合与 task intent catalog。

## Tests
- `tests/unit/remake-projects/remake-video-task-contract.test.ts`：12 个（契约、指纹、顺序、门禁、时长推导、持久化合同）。
- `tests/integration/api/remake-projects-video.test.ts`：9 个（service 层提交构建、顺序、门禁、prompt 门禁、时长、配置只读、指纹确定性 + request schema）。
- `tests/unit/worker/remake-video.test.ts`：7 个（preflight、网关调用、上传、持久化、stale 拦截、幂等、队列路由）。

合计 28 个测试全过，TypeScript 类型检查通过。

## Key decisions
- 复用现有视频生成基础设施，不建新队列、新 provider 或新存储路径。
- 所有参考以有序对象数组形式冻结（role + ordinal + mediaId），既满足 D-04 固定顺序，又便于 D-06 溯源。
- 时长推导放在 server 端服务层，先按 D-10 取整/上下限，再交给 capability 系统做最终归一化；UI 只负责展示和发送用户选择。

## Known limitations / deferred
- Wave 2 才会接备注、采用、失效/复核闭环。
- Wave 3 才会接 UI 交互。
- 跨 Shot 批量生成属于 Phase 10，不在本阶段范围内。
