---
status: resolved
trigger: "视频生成失败（INVALID_PARAMS）：ARK 视频任务创建失败: task_type r2v does not support model doubao-seedance-1-5-pro"
created: 2026-08-13
updated: 2026-08-13
---

# Debug Session: Ark task_type=r2v 不支持的模型（Seedance 1.5 Pro）

## Symptoms

- 用户用 `doubao-seedance-1-5-pro` 生成视频，worker 调用 Ark 返回 400：
  `The parameter task_type specified in the request is not valid: the specified task_type r2v does not support model doubao-seedance-1-5-pro`。
- 任务标记为 failed / INVALID_PARAMS；版本区无视频。

## Root Cause

- Ark `/contents/generations/tasks` 端点会根据 content 里的角色**推断 task_type**：
  `reference_image` / `reference_video` → `r2v`；`first_frame`/`last_frame` → i2v。
- 翻拍（以及多镜头）在 content[] 里传 `reference_image` 即触发 `r2v`，但 `r2v`
  只有 Seedance 2.0 系列支持；Seedance 1.5 Pro / 1.0 系列不支持，直接 400。
- 代码门控 `supportsShotGroupMultiReferenceModes` 只看 `provider === 'ark'`，
  把所有 Ark 模型都当成支持多参考 → 1.5 Pro 也被送 `reference_image`。

## Evidence

- `src/lib/shot-group/video-config.ts`：`supportsShotGroupMultiReferenceModes` 原实现
  仅判断 `provider === 'ark'`。
- `src/lib/generators/ark.ts`：content[] 带 `reference_image` 时直接组装请求，
  无 r2v 能力校验。
- `standards/capabilities/image-video.catalog.json`：此前无任何 r2v/多参考能力标记。

## Fix

- `VideoCapabilities` 新增 `supportsMultimodalReferences?: boolean`（Ark r2v 能力标记），
  加入校验与 allowed fields；`scripts/check-capability-catalog.mjs` 同步。
- 目录 `image-video.catalog.json`：Seedance 2.0 / 2.0 Fast 标记
  `supportsMultimodalReferences: true`；1.5 Pro / 1.0 系列保持缺省（不支持）。
- `supportsShotGroupMultiReferenceModes(modelKey)` 改为查目录该标记：
  - Seedance 2.0 → true（content[] 多参考 / ark_content_multireference）；
  - Seedance 1.5 Pro / 1.0 → false（降级 composite_image_mvp，仅首张关键帧 i2v）；
  - 非 Ark → false。
  该函数同时门控翻拍 referenceMode、翻拍 worker contentItems、多镜头 contentPlan。
- `src/lib/generators/ark.ts`：`ARK_SEEDANCE_MODEL_SPECS` 增加
  `supportsMultimodalReferences`（2.0 系列 true），doGenerate 对已知不支持 r2v 的模型
  传 content[] 时抛 `ARK_VIDEO_OPTION_UNSUPPORTED` 兜底，避免再次打到 Ark。

## Verification

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/shot-group-video-config.test.ts`（5 passed）
  - Seedance 2.0 → true；1.5 Pro / 1.0 → false；resolveShotGroupReferenceMode 相应降级。
- `BILLING_TEST_BOOTSTRAP=1 npx vitest run tests/integration/api/remake-projects-video.test.ts`（16 passed）
  - 新增：1.5 Pro 提交 → `composite_image_mvp`、无「参考素材使用说明」后缀；
    Seedance 2.0 → `ark_content_multireference`、含后缀。
- 相关单测 72 passed；`tsc --noEmit`、`check-capability-catalog`、`check-model-config-contract` 通过。

## files_changed

- `src/lib/model-config-contract.ts`
- `src/lib/shot-group/video-config.ts`
- `src/lib/generators/ark.ts`
- `standards/capabilities/image-video.catalog.json`
- `scripts/check-capability-catalog.mjs`
- `tests/unit/worker/shot-group-video-config.test.ts`
- `tests/integration/api/remake-projects-video.test.ts`
