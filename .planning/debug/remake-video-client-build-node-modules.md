---
status: resolved
trigger: "Build Error: Code generation for chunk item errored — catalog.ts (node:fs) / contracts.ts (node:crypto) pulled into client bundle via video-config.ts / reference-plan.ts"
created: 2026-08-13
updated: 2026-08-13
---

# Debug Session: 客户端构建失败（node:fs / node:crypto 泄漏进浏览器 bundle）

## Symptoms

- 开发服务器（Turbopack）构建报错：
  `the chunking context (unknown) does not support external modules (request: node:fs)`，
  Import trace：`catalog.ts [Client] ← video-config.ts ← RemakeVideoStage.tsx`。
- 标准 `next build`（webpack）另报 `node:crypto`：
  `contracts.ts ← reference-plan.ts ← video-inputs.ts ← RemakeVideoStage.tsx`。

## Root Cause

- 上一个 r2v 修复把服务端专用模块 `@/lib/model-capabilities/catalog`（用 `node:fs` 读磁盘目录）
  静态 import 进 `video-config.ts`，而 `video-config.ts` 被客户端组件引用 → 浏览器 bundle 出现 `node:fs`。
- 共享模块 `reference-plan.ts` 以值导入 `VIDEO_REFERENCE_ROLE_ORDER` 来自 `contracts.ts`，
  而 `contracts.ts` 顶层 `import { createHash } from 'node:crypto'` → 客户端 bundle 出现 `node:crypto`。

## Fix

- `video-config.ts`：移除 catalog import；r2v 门控改为客户端安全的
  `ARK_R2V_VIDEO_MODEL_IDS`（Seedance 2.0 / 2.0 Fast）集合，客户端与服务器共用同一判定。
- 新增客户端安全模块 `src/lib/remake-projects/video/reference-roles.ts`（仅 zod，无 `node:*`）：
  roles / media types / `VIDEO_REFERENCE_ROLE_ORDER` / `orderedVideoReferenceSchema` / `OrderedVideoReference`。
- `contracts.ts` 改为从 `reference-roles` 重新导出（本地也 import 使用）；`reference-plan.ts` 与
  `video-inputs.ts` 改从 `reference-roles` 导入 → 客户端路径不再触碰 `contracts.ts`（node:crypto）。
- 回滚上版引入但已不再使用的 catalog `supportsMultimodalReferences` 能力标记
  （`model-config-contract.ts` / `image-video.catalog.json` / `check-capability-catalog.mjs`）。

## Verification

- `npx next build`（webpack 全量）通过；客户端 bundle 不再包含 catalog.ts / contracts.ts。
- `npx tsc --noEmit` 通过；`check-capability-catalog` OK。
- 相关单测 72 个 + 集成 16 个全绿。

## files_changed

- `src/lib/shot-group/video-config.ts`
- `src/lib/remake-projects/video/reference-roles.ts`（新）
- `src/lib/remake-projects/video/contracts.ts`
- `src/lib/remake-projects/video/reference-plan.ts`
- `src/lib/remake-projects/keyframes/video-inputs.ts`
- `src/lib/model-config-contract.ts`（回滚能力标记）
- `standards/capabilities/image-video.catalog.json`（回滚能力标记）
- `scripts/check-capability-catalog.mjs`（回滚能力标记）
