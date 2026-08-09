# 前端数据 hooks 合同（已就绪，AI 直接用）

> 所有 hooks 都在 `src/lib/query/` 下，用 React Query 实现。AI 不要自己写 fetch。

## 1. 项目快照（数据源）

**`useRemakeProject(projectId: string)`** — `src/lib/query/hooks/useRemakeProject.ts`

返回 `{ data, isLoading, isError, error, refetch }`，其中 `data` 是完整项目快照：

```ts
type RemakeProjectSnapshot = {
  project: { id: string; name: string; description?: string }
  source: { status: 'not_imported' | 'uploaded' | 'uploaded_pending' | 'analyzed' | 'retired'; sourceRevision?: number }
  shots: Array<{
    id: string
    sequence?: number
    stableKey: string
    reviewStatus: string
    needsReview: boolean
    promptTracks?: Array<{ id: string; kind: 'image' | 'video'; adoptedVersionId?: string; versions: Array<{ id: string; versionNumber: number; reviewStatus: string }> }>  // prompt 相关投影
    // 图片 Prompt 还需要关键帧 URL（Start/Middle/End 三帧）
  }>
  tasks: Array<{ id: string; type: string; status: string }>  // 最近任务列表，含 prompt 分析任务
}
```

> 提示：快照里已含 prompt 的 tracks 投影（Wave 3 后端已实现）。具体字段名以实际 TypeScript 类型为准（`src/lib/remake-projects/` 下的 contracts）。AI 实现时若字段缺失，请返回「按实际类型为准」，不要臆造。

## 2. 操作 mutations（`src/lib/query/mutations/remake-prompt-mutations.ts`）

**`useAnalyzeRemakePrompt(projectId: string)`** — 触发分析

```ts
// 图片：逐张关键帧
mutate({ kind: 'image', shotId: string, slot: 'start' | 'middle' | 'end' })
// 整段视频
mutate({ kind: 'video' })
// 返回 { taskId }
```

**`useSaveRemakePromptVersion(projectId: string, trackId: string)`** — 保存人工编辑为新版本

```ts
mutate({ sourceVersionId?: string, coreText: string, negativeConstraints?: string[] })
// 返回 { version: { id, versionNumber, reviewStatus } }
```

**`useApproveAndAdoptRemakePrompt(projectId: string, trackId: string)`** — 批准并采用

```ts
mutate({ versionId: string })
// 返回 { track: { id, adoptedVersionId } }
```

## 3. 任务状态轮询

Task 状态（排队中/运行中/失败/成功）来自项目快照的 `tasks` 投影，或项目里既有的 Task drawer 机制（现有 `RemakeWorkbench` 的 `remake-task-overlay` / `remake-task-drawer` 已经实现任务展示，可复用）。Prompt 阶段新增任务应显示在同一个任务体系里。
