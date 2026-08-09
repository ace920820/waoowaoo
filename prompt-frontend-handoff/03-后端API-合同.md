# 后端 API 合同（已就绪，AI 只需调用）

> 所有路由都在 `src/app/api/remake-projects/[projectId]/...` 下，已实现并经过认证（登录用户才能访问）。
> 前端统一通过 React Query hooks 调用（见 `04-前端数据hooks-合同.md`），这里列出底层契约供理解。

## 1. 触发分析

**`POST /api/remake-projects/:projectId/prompts/analyze`**

请求体（二选一）：

```jsonc
// 图片分析：逐张关键帧触发
{ "kind": "image", "shotId": "uuid", "slot": "start" | "middle" | "end", "operationKey": "任意幂等键（如时间戳）" }

// 整段 Video 分析：一次触发分析全部已确认镜头
{ "kind": "video", "operationKey": "任意幂等键" }
```

响应：`202 { "taskId": "uuid" }`（异步任务，轮询/订阅任务状态）。

**重要约束（后端已强制，前端 UI 必须遵守）**：
- 图片分析：只有**已确认且关键帧齐备**的 Shot 才能分析；前端逐张触发，**没有批量接口**
- Video 分析：必须**所有**当前 Shot 都已确认且关键帧齐备，否则返回 400；只允许整段分析
- 失败语义：Video 分析整体成功或整体失败，**不保存部分结果**

## 2. Track 详情 / 编辑 / 批准采用

**`GET /api/remake-projects/:projectId/prompts/tracks/:trackId`**

查询参数（可选）：
- `?versionId=uuid`：只看某个版本
- `?compare=uuid1,uuid2`：并排比较两个版本（最多 2 个）

返回：track 详情，包含 versions 列表、adoptedVersionId、当前查看/比较的版本内容等。

**`POST /api/remake-projects/:projectId/prompts/tracks/:trackId`** — 保存人工编辑为新版本

```jsonc
{
  "sourceVersionId": "uuid（可选，基于哪个版本改的）",
  "coreText": "编辑后的 Prompt 正文（必填）",
  "negativeConstraints": ["负面约束列表（可选）"]
}
```

响应：`201 { "version": { "id", "versionNumber", "reviewStatus" } }`
错误：409（版本过期/冲突，需刷新后重试）、404（无权限/不存在）

**`PATCH /api/remake-projects/:projectId/prompts/tracks/:trackId`** — 批准并采用某版本

```jsonc
{ "versionId": "uuid" }
```

响应：`200 { "track": { "id", "adoptedVersionId" } }`
错误：409（版本非法/过期）、404

## 3. 数据模型（前端要理解的状态）

- **Track**：一个镜头（或一个视频）的 Prompt「档案夹」，含多个版本
- **Version**：一版 Prompt 内容，有 `versionNumber`、`reviewStatus`（`pending_review` / `approved` / `needs_review` 等）、`coreText`、`negativeConstraints`、完整原始输出
- **Run**：一次 AI 分析任务记录（可查状态：排队中/运行中/失败/成功）
- **adoptedVersionId**：当前采用的版本指针——只有「已批准」的版本能成为 adopted

## 4. 前端状态机（UI 必须正确反映）

```
触发分析 → 排队中 → 分析中 → 失败（可重试）
                          ↘ 成功 → 新版本（pending_review，不自动替换）
人工编辑 → 保存为新版本（仍是 pending_review）
批准并采用 → 该版本变 approved + adopted（旧 approved 仍保留在历史里）
```

- 「任务成功」≠「已批准」：Task 状态和业务审核状态是两个独立维度
- 刷新页面后一切从数据库恢复（Task 轮询 + snapshot 查询）
