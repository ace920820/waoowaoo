---
status: resolved
trigger: "分镜页镜头14 点击生成图片后没有反应、无报错（项目 e44be650 火影忍者，stage=storyboard）"
created: 2026-08-13
updated: 2026-08-13
---

# Debug: 分镜关键帧生成无反应（openai-compat gpt-image-2 + 参考图缺 quality）

## Symptom
- 翻拍分镜页（e44be650…?stage=storyboard）镜头 14，点击「生成图片」后界面无任何变化、无报错。

## Current Focus
- hypothesis: resolved。点击其实到达了服务端并创建了任务，但 worker 异步失败，前端不展示任务失败 → 表现为“无反应”。

## Evidence
- `tasks` 表 task `559c9713-e919-4c20-a9b8-a3434f597371`：targetId=`568818a3-…`（真实镜头14）、type=`remake_keyframe_image_generate`、status=`failed`、error=`VIDEO_API_FORMAT_UNSUPPORTED: OPENAI_COMPAT_TEMPLATE_VARIABLE_MISSING: quality`（2026-08-13 16:24 +08）。
- 镜头14 语义绑定角色 `1d9ec65d-…`（佐助，imageUrl=`images/project-char-copy-….jpg`，MediaObject `97c389f6-…` 已存在）→ 提交快照 `referenceMediaIds` 非空 → worker 把参考图 base64 传给生成。
- 分镜模型为 `openai-compatible:b4a7be24-…::gpt-image-2`（基础版）。`generateImageViaOpenAICompatTemplate` 在 `gpt-image-2 + 参考图` 时会切到 multipart `/images/edits` 端点，其 bodyTemplate 固定含 `{{quality}}`；基础 gpt-image-2 的 alias `quality=null` 且 options 无 quality → `OPENAI_COMPAT_TEMPLATE_VARIABLE_MISSING: quality`。
- 此前的提交快照 `referenceMediaIds` 恒为空，走基础 `/images/generations` 模板（无 quality）→ 不会触发；引入参考图后暴露该模板缺口。

## Resolution
- root_cause: 基础 `gpt-image-2` 带参考图走 edits 端点时缺少必填的 `quality` 变量。
- fix: `src/lib/model-gateway/openai-compat/template-image.ts` — 当 `alias.modelId === 'gpt-image-2' && hasReferenceImages(request)` 且无 alias quality 时，兜底 `templateOptions.quality = 'auto'`（别名变体 high/medium/low/auto 仍走原逻辑）。
- verification:
  - 新增回归测试 `tests/unit/model-gateway/openai-compat-template-image-output-urls.test.ts`：基础 gpt-image-2 + 参考图 → 不抛错、URL 为 `/images/edits`、FormData 含 `quality=auto`。
  - `vitest run tests/unit/model-gateway tests/unit/generators/openai-compatible-image.test.ts …` 38 passed；`tsc --noEmit` passed；eslint 0 error。
  - 真库确认：角色佐助 → MediaObject `97c389f6-…`，参考图会被附加（即触发 edits 端点的路径）。
- 遗留 UX 观察：POST /keyframes 返回 202 后异步任务失败，分镜页不展示任务失败态（表现为“无反应”）；如需可另做任务错误态提示。

---

## Follow-up: 修复 quality 后生成成功，但分镜页仍显示 0 批 / 0 候选

### Symptom
- 应用 quality 兜底后，用户重试镜头 14：任务实际**完成**（tasks `40d5f6c6`/`7b29591d` completed；`remake_keyframe_batches` 2 条各 1 候选；`remake_output_versions` 2 条 completed，mediaId 为 MediaObject uuid；图片文件已落盘），但分镜页仍显示「0 批 / 0 候选」。

### Root Cause
- `remakeSnapshotRefreshInterval`（`src/lib/query/hooks/useRemakeProject.ts`）只会在「原关键帧缺失 / prompt 任务活动 / video 生成任务活动」时轮询；**没有把 `remake_keyframe_image_generate` 纳入轮询条件**。
- 点击生成：POST /keyframes 返回 202 → mutation onSuccess 只 refetch 一次（任务还在 processing，无候选）→ 任务约 2 分钟后完成并落库 → 页面不再轮询 → 永远停在 0 批 / 0 候选，直到手动刷新。

### Fix
- `remakeSnapshotRefreshInterval` 增加 `hasActiveKeyframeImageTask`（type === 'remake_keyframe_image_generate' 且 queued/processing/running）→ 活动期间每 1000ms 轮询，任务完成/失败后自动停。
- 回归测试：`tests/unit/remake-projects/remake-snapshot-refresh.test.ts` 新增 keyframe image 任务 queued/processing/running → 1000，completed/failed → false。

### Verification
- `vitest run tests/unit/remake-projects/remake-snapshot-refresh.test.ts`（7 passed）；`tsc --noEmit` passed；eslint 0 error。
- 用户刷新分镜页即可看到已生成的候选（数据与文件均在库）。
