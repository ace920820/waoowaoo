---
status: resolved
trigger: "Phase 8 UAT found 3 issues: (1) storyboard keyframe generation does not use the project-configured model; (2) 成片 page auxiliary action-sheet reference image does not render; (3) scene/character/prop asset selection does not persist after confirm"
created: 2026-08-12
updated: 2026-08-12
---

# Debug Session: Remake keyframe generation & asset-save fixes

## Symptoms
1. 分镜页无法通过项目配置中的指定模型生成图片（keyframe generation model resolution fails / not applied）。
2. 成片页辅助动作参考图没有显示（应为三个关键帧组合拼接图，纵向排列）。
3. 分镜页场景/人物/物品资产下拉选择正常，但选择并确认后没有保存，仍显示未选择。

## Root Cause & Fix

### 1. 项目模型配置未生效
- Root cause: `buildKeyframeGenerationSubmission` 只用 **用户级** `getUserModelConfig(userId).storyboardModel`，忽略了项目配置里的 `novelPromotionProject.storyboardModel`（Phase 8 08-08 要求用项目配置）。
- Fix: `src/lib/remake-projects/keyframes/service.ts` — 模型解析改为 `显式 model > 项目 storyboardModel > 用户 storyboardModel`（`getProjectModelConfig(projectId, userId)`）。

### 2. 辅助动作参考图未显示
- Root cause: action-sheet worker 只调用 `persistActionSheet`，创建 `remakeOutputVersion` 时 **从不渲染/上传拼接图**，`mediaId` 始终为空 → UI 显示缺失。且 `renderActionSheet` 原本是 **横向** 拼接，不符合“纵向排列”。
- Fix:
  - `renderActionSheet` 改为 **纵向** 拼接（top 递增，宽 640、高 (360+34)*3）。
  - worker `remake-keyframe-action-sheet.ts` 现解析三帧原始 buffer → 渲染 → 上传 COS → 注册 MediaObject → 以 `media.id` 写入 outputVersion.mediaId。
  - `persistActionSheet` 支持 `mediaId` 参数（创建时写入，缺 mediaId 的老版本回填）。
  - 媒体路由 `scenedetect/media/[mediaId]` 增加对 output 版本 mediaId 的解析（覆盖 action-sheet 与 keyframe candidate）。
  - 成片页 `MediaCard` 增加 `vertical` 模式，纵向拼接图不被 `aspect-video` 裁切。

### 3. 资产选择确认后未保存
- Root cause: `ShotSemanticsPanel` 里资产选择只更新本地 state，`hasChanges` **未包含** sceneAssetId / characterAssetIds / propAssetIds（尤其物品纯资产变更时“保存”按钮保持禁用）；且资产 picker “确认”后并不持久化。
- Fix: `src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx`
  - 资产选择/清除/新增/移除时立即 `persistAssetPatch` 持久化（场景含 sceneTag，角色含 characterTags，物品含 propAssetIds）。
  - `hasChanges` 纳入三个资产字段，手动“保存”也能正确启用。

## Verification
- `tsc --noEmit` 通过。
- ESLint：改动文件 0 error（仅原有 warning）。
- Vitest：`tests/unit/remake-projects` + `tests/unit/worker` 共 80 文件 / 331 用例全部通过。
- 新增测试：
  - `remake-keyframe-model-resolution.test.ts`（项目模型 > 用户模型、显式 model 优先）。
  - `remake-action-sheet.test.ts`（纵向拼接尺寸、mediaId 写入与回填）。


---

## Follow-up: 资产保存改为“确认即保存”后直接报错（Failed to update shot semantics）

### Symptom
- 上轮把资产选择改为“确认即保存”后，点击确认触发 PATCH `/shots/[id]/semantics`，但直接报错 `Failed to update shot semantics`。

### Root Cause
- `src/lib/remake-projects/semantics/service.ts` 中的归属校验：
  ```ts
  if (shot.remakeProjectId !== input.projectId) return null
  ```
  `shot.remakeProjectId` 是 **remake_projects 行 id**（如 `05616017-…`），而 `input.projectId` 是 **projects.id**（如 `e44be650-…`），两者是不同 UUID，**永远不相等** → `updateRemakeShotSemantics` 恒返回 `null` → 路由抛 `NOT_FOUND` → 前端显示“Failed to update shot semantics”。
- 之前“未保存”与此同根因：旧代码保存按钮未启用、PATCH 未发出；本次 auto-save 发出 PATCH 后才暴露出该恒真失败的校验。
- 附带：前端 mutation 读取 `payload.detail`（单数），而 API 错误体返回 `details`（复数），导致真实错误信息被“Failed to update shot semantics”掩盖。

### Fix
- `service.ts`：改为与项目归属 id 比较：
  ```ts
  const project = shot.remakeProject?.project
  if (!project || project.userId !== input.userId || project.type !== 'remake') return null
  if (project.id !== input.projectId) return null   // 之前误用 shot.remakeProjectId
  ```
- `remake-keyframe-mutations.ts`：错误信息改读 `details` / `error.details` / `message`，避免掩盖真实原因。

### Verification
- 用 dev 库实拍：修复前字符保存返回 null（恒失败）；修复后成功写库并回读 `characterAssetIds`/`characterTags`。
- 新增回归测试 `tests/unit/remake-projects/remake-shot-semantics-save.test.ts`（项目 id 匹配时持久化、不匹配返回 null）。
- `tsc --noEmit`、ESLint 通过；`tests/unit/remake-projects` + `tests/unit/worker` 共 81 文件 / 333 用例全部通过。
