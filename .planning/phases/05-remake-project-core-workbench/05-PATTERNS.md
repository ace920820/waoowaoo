# Phase 5: 翻拍项目与核心工作台 - Pattern Map

**Mapped:** 2026-08-07  
**Files analyzed:** 14 个候选改动面（由 `05-CONTEXT.md` 与 `05-UI-SPEC.md` 推导；上游未提供 `RESEARCH.md`）  
**Analogs found:** 14 / 14

## 候选收敛

### Likely（应优先复制）

- `src/app/[locale]/workspace/page.tsx`：项目入口、创建弹窗、客户端字段校验、`apiFetch` 与错误呈现。
- `src/app/api/projects/route.ts`：项目列表/创建路由、`apiHandler`、用户认证、服务端校验、创建后初始化关联记录。
- `src/app/[locale]/workspace/[projectId]/page.tsx`：项目详情页的 URL 单一事实来源、React Query 刷新、全局 `Navbar` 和错误壳。
- `prisma/schema.prisma` + `prisma/migrations/20260415113000_add_shot_group_phase1/migration.sql`：UUID、关系、索引、显式外键行为与迁移命名。
- `src/lib/task/{types,service,submitter}.ts` + `src/app/api/tasks/route.ts`：现有统一 Task 生命周期、目标关联、Task/Run 适配与脱敏错误投影。

### Maybe（仅按需要复用）

- `src/lib/query/hooks/{useProjectData,useTaskStatus}.ts` 和 `src/lib/query/keys.ts`：工作台快照与 Task 查询 hook 的 React Query 形态。
- `src/components/ui/SegmentedControl.tsx`、`src/components/task/TaskStatusInline.tsx`：创建类型选择与小型任务运行状态；新工作台仍需补足设计合同中的可访问性和静态终态展示。
- `messages/{zh,en}/workspace.json`：现有 `workspace` namespace 的双语成对维护方式；新增工作台文字更适合作为独立 namespace，避免把翻拍文案塞入通用旧页面。

### Avoid（不要作为本阶段模板）

- 旧 `workspace/page.tsx` 的渐变新建卡与项目卡 hover 特效，违反 UI 合同的无渐变、操作型工作台要求。
- 现有小说推广阶段集合（`config/script/assets/...`）及 `NovelPromotionWorkspace` 的业务含义；翻拍阶段导航必须独立，不得改变剧本/小说推广的路由行为。
- SceneDetect 上传/时间轴、Prompt/版本生成、批量取消重试和素材导出；均属于 Phase 6-11，不应在本阶段预建假数据或控制入口。

## File Classification

| 新建/修改文件（规划候选） | 角色 | 数据流 | 最接近 analog | 匹配 |
|---|---|---|---|---|
| `prisma/schema.prisma` | model | CRUD / transform | `Project`、`Task`、`GraphRun` | 精确（基础实体） |
| `prisma/migrations/<timestamp>_add_remake_project_core/migration.sql` | migration | transform | `20260415113000_add_shot_group_phase1/migration.sql` | role-match |
| `src/lib/remake-projects/*` | service / utility | CRUD / transform | `src/lib/task/service.ts`、`src/lib/projects/validation.ts` | role-match |
| `src/app/api/projects/route.ts` | route | request-response / CRUD | 同文件 `POST` | 精确（扩展项目类型分支） |
| `src/app/api/remake-projects/[projectId]/route.ts` | route | request-response / CRUD | `src/app/api/projects/[projectId]/data/route.ts` + `src/app/api/tasks/route.ts` | role-match |
| `src/app/api/remake-projects/[projectId]/shots/route.ts` | route | request-response / CRUD | `src/app/api/novel-promotion/[projectId]/episodes/*` | role-match |
| `src/app/api/remake-projects/[projectId]/shots/[shotId]/route.ts` | route | request-response / CRUD | 现有项目内 PATCH 路由 | role-match |
| `src/lib/task/types.ts` / task 注册表 | config / contract | event-driven | `TASK_TYPE`、`CreateTaskInput` | 精确（扩展，不另建生命周期） |
| `src/lib/task/submitter.ts` 或翻拍适配层 | service | event-driven | `submitTask` | 精确 |
| `src/app/[locale]/workspace/page.tsx` | component | request-response | `handleCreateProject` | 精确（入口扩展） |
| `src/app/[locale]/workspace/[projectId]/page.tsx` | controller component | request-response | URL `stage`/`episode` 处理 | role-match（需模式分派） |
| `src/app/[locale]/workspace/[projectId]/modes/remake/*` | component / hook | CRUD / request-response | `NovelPromotionWorkspace` 的 shell 边界 + `useProjectData` | role-match |
| `src/lib/query/{keys,hooks/useRemakeProject}.ts` | hook / config | request-response | `useProjectData`、`useTaskStatus` | 精确 |
| `messages/{zh,en}/remake-workbench.json` 与 focused tests | config / test | transform / request-response | `workspace.json`、项目创建与 Task route tests | role-match |

## Pattern Assignments

### `prisma/schema.prisma` 与新迁移（model / migration，CRUD）

**Analogs:** `prisma/schema.prisma:427-441`、`661-745`；`prisma/migrations/20260415113000_add_shot_group_phase1/migration.sql:1-39`。

**基础身份、所有权和索引模式：**

```prisma
model Project {
  id        String   @id @default(uuid())
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("projects")
}
```

**Task 是既有唯一执行记录：**

```prisma
model Task {
  id         String @id @default(uuid())
  userId     String
  projectId  String
  type       String
  targetType String
  targetId   String
  status     String @default("queued")
  payload    Json?
  result     Json?
  errorCode  String?
  errorMessage String? @db.Text

  @@index([targetType, targetId])
  @@index([projectId])
}
```

**迁移模式：**每个新表有 UUID 主键、明确 FK、`ON DELETE` 行为及查询索引；如需稳定排序/编号，应使用数据库字段与唯一复合索引，不使用前端数组位置：

```sql
CREATE TABLE novel_promotion_shot_group_items (...);
CREATE UNIQUE INDEX novel_promotion_shot_group_items_shotGroupId_itemIndex_key
  ON novel_promotion_shot_group_items (shotGroupId, itemIndex);
```

**Phase 5 适用结论：**新增 `RemakeProject`/`RemakeShot`/provenance（具体拆分由 planner 决定）应以 `Project.id` 与不可变 `Shot.id` 关联。对 Shot 的下游失效应存为可审计记录/状态，而非删除 `Task.result` 或覆盖旧版本。`Task` 可通过 `targetType='remake_shot'`、`targetId=shot.id` 关联；不要增加第二张平行的任务状态表。若需要 Run 级元数据，采用 `GraphRun.taskId` 与现有 `workflowVersion`，而不是自造队列事实来源。

---

### 项目创建：`src/app/api/projects/route.ts`（route，request-response / CRUD）

**Analog:** `src/app/api/projects/route.ts:185-249`。

**认证、校验、统一 API 错误与持久化顺序：**

```typescript
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const draft = readProjectDraftBody(body)
  const validationIssue = validateProjectDraft(draft)
  if (validationIssue) {
    throw new ApiError('INVALID_PARAMS', { ... })
  }

  const project = await prisma.project.create({
    data: { name: name.trim(), description: description?.trim() || null, userId: session.user.id }
  })
  await relatedModel.create({ data: { projectId: project.id, ... } })
  return NextResponse.json({ project }, { status: 201 })
})
```

**Phase 5 适用结论：**保留默认旧项目创建语义；按显式项目类型将翻拍初始化隔离在新分支/领域服务中。翻拍分支必须在真实 DB 中创建 `Project`、翻拍域记录、第一条 Shot 草稿和初始化 Task，并返回可跳转的稳定 `project.id`/`shot.id`。该组写入需要 Prisma transaction，避免半初始化项目；此事务要求是现有连续写入的安全强化，不是前端补偿。服务端必须复用/扩展 `validateProjectDraft`，并对类型字段做白名单校验。

---

### 项目/Shot 读取与写入 API（route，request-response / CRUD）

**Analogs:** `src/app/api/tasks/route.ts:1-42`、`src/lib/api-auth.ts:306-343`。

**用户拥有的 Task 列表投影：**

```typescript
export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const tasks = await queryTasks({ projectId, targetType, targetId, status, type, limit })
  const filtered = tasks
    .filter((task) => task.userId === session.user.id)
    .map(withTaskError)
  return NextResponse.json({ tasks: filtered })
})
```

**项目级授权：**

```typescript
const authResult = await requireProjectAuthLight(projectId)
if (isErrorResponse(authResult)) return authResult
const { session, project } = authResult
```

`requireProjectAuthLight` 已进行 session、项目存在和 `project.userId === session.user.id` 检查（`src/lib/api-auth.ts:319-343`）。翻拍路由必须用 light variant，不能用要求 `novelPromotionData` 的 `requireProjectAuth`。

**Phase 5 适用结论：**为工作台新增一个面向视图的项目快照 GET（项目、摘要、Shot、关联 Task、provenance 摘要），以及 Shot POST/PATCH；每个路径在读写前做项目所有权校验。PATCH 返回持久化后的 revision 和影响范围；将下游记录标记 `needs_review` 并保留旧记录。API 仅返回可理解、经 `normalizeTaskError` 处理的 Task 错误；不可返回 executor 命令、session、环境变量或原始日志。

---

### Task / Run 合同与初始化任务（service，event-driven）

**Analogs:** `src/lib/task/types.ts:1-109`、`src/lib/task/service.ts:164-239`、`src/lib/task/submitter.ts:119-245`。

**Task 常量和创建输入：**

```typescript
export const TASK_STATUS = {
  QUEUED: 'queued', PROCESSING: 'processing', COMPLETED: 'completed',
  FAILED: 'failed', CANCELED: 'canceled', DISMISSED: 'dismissed',
} as const

export type CreateTaskInput = {
  userId: string; projectId: string; type: TaskType
  targetType: string; targetId: string
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
}
```

**持久化入口应保持在任务层：**

```typescript
const { task, deduped } = await createTask({
  userId, projectId, type, targetType, targetId,
  payload: normalizedPayload,
  dedupeKey,
})
```

`createTask` 已负责 dedupeKey、孤儿任务恢复、初始 `queued` 状态与必要时间戳；`submitTask` 还会标准化 payload、补足 locale，并为 AI 类型建立/复用 `GraphRun`。

**Phase 5 适用结论：**扩展 `TASK_TYPE`、intent/worker 注册表和展示映射来登记“项目初始化”等翻拍能力；业务 API 只调用 Task service/submitter，不直接启动 CLI 或进程。Task 状态与人工审核状态必须是独立字段：`completed` 绝不自动变为已批准，`failed` 不能伪装成审核拒绝。取消/重试 UI 不在 Phase 5 新增，但数据展示需容忍已有 `canceled` 和失败记录。

---

### 工作台路由与模式壳（controller component，request-response）

**Analog:** `src/app/[locale]/workspace/[projectId]/page.tsx:47-129, 341-405`。

**URL 是选择与阶段的单一事实来源：**

```typescript
const searchParams = useSearchParams()
const urlStage = searchParams.get('stage') as Stage | null
const urlEpisodeId = searchParams.get('episode') ?? null

const updateUrlParams = useCallback((updates) => {
  const params = new URLSearchParams(searchParams.toString())
  // set/delete 已知参数
  router.replace({ pathname: `/workspace/${projectId}`, query: Object.fromEntries(params.entries()) }, { scroll: false })
}, [router, projectId, searchParams])
```

**查询 + 页面壳：**

```typescript
const { data: project, isLoading: loading, error: projectError } = useProjectData(projectId)
// 失败时保留 Navbar，并提供返回工作区命令
```

**Phase 5 适用结论：**在此入口做项目类型判别，再将翻拍项目交给 `modes/remake` shell；不要把新的翻拍阶段混进 `VALID_STAGES` 或 `NovelPromotionWorkspace`。翻拍 shell 读取 `stage=overview`、`shot`、可选 `task`，默认选择服务端首个 Shot；用户操作以 `router.replace(..., { scroll: false })` 更新 URL。其余六阶段使用不可导航的 `aria-disabled` 控件，而非空白路由。加载时按 UI 合同渲染各面板骨架，不复制该旧页面全屏 loading。

---

### React Query 查询与写后失效（hook，request-response）

**Analogs:** `src/lib/query/hooks/useProjectData.ts:19-47`、`src/lib/query/hooks/useTaskStatus.ts:1-136`、`src/lib/query/keys.ts:95-112`。

**固定 query key、启用条件和错误提升：**

```typescript
return useQuery({
  queryKey: queryKeys.projectData(projectId || ''),
  queryFn: async () => {
    if (!projectId) throw new Error('Project ID is required')
    const res = await apiFetch(`/api/projects/${projectId}/data`)
    if (!res.ok) throw new Error(resolveTaskErrorMessage(await res.json(), 'Failed to load project'))
    return (await res.json()).project
  },
  enabled: !!projectId,
  staleTime: 5000,
})
```

**Phase 5 适用结论：**在 `queryKeys` 添加 `remakeProject.detail(projectId)`、必要的 Shot/Task 细粒度 key；创建/更新 Shot 成功后失效工作台快照及对应 target Task key，不靠组件内数组替换伪造结果。保留前次成功数据时可用 `isFetching` 提示“正在更新”；首次无数据才用骨架。Task 面板可复用 `useTaskList` 的参数化查询，但工作台摘要应由翻拍项目快照返回，避免多个组件各自重算统计而产生多事实来源。

---

### 创建入口、i18n 与现有 UI 原语（component / config，request-response）

**Analogs:** `src/app/[locale]/workspace/page.tsx:170-211, 587-668`；`src/components/ui/SegmentedControl.tsx:7-84`；`messages/zh/workspace.json:1-42` 与 `messages/en/workspace.json:1-42`。

**客户端提交约定：**

```typescript
const validationMessage = toProjectValidationMessage(validateProjectDraft(formData), t)
if (validationMessage) { setCreateError(validationMessage); return }
const response = await apiFetch('/api/projects', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData),
})
if (!response.ok) setCreateError(await readApiErrorMessage(response, t('createFailed')))
```

**Phase 5 适用结论：**保留客户端预校验但以服务端结果为准。创建翻拍项目时提交显式 type，成功后直接路由到返回的翻拍工作台，而不是先刷新项目网格。可复用 `SegmentedControl` 的 controlled `options/value/onChange` API；若其现有圆角/动画与 UI 合同冲突，应只在翻拍局部包装/调整，不修改其对既有页面的行为。所有可见文字在新 namespace 同步维护 `zh`/`en`；技术值从 API 原样显示并搭配本地化标签。

---

### Focused tests（test，request-response / event-driven）

**Analogs:** `tests/integration/api/specific/project-create-default-audio-model.test.ts:1-109`、`tests/integration/api/contract/task-infra-routes.test.ts:1-280`。

**路由测试形态：**

```typescript
const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))
vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const res = await mod.POST(buildMockRequest({ path: '/api/projects', method: 'POST', body }), routeContext)
expect(res.status).toBe(201)
expect(prismaMock.project.create).toHaveBeenCalledWith(...)
```

**Phase 5 最小覆盖：**

- schema/migration contract：稳定 Shot ID、Project 所属关系、Task target 索引和 provenance/失效字段；
- 项目创建 route：旧类型回归、翻拍分支的 Project + 首 Shot + 初始化 Task 原子写入、无效名称/type 的 400；
- Shot CRUD route：所有权 401/403/404、创建稳定 ID、PATCH 提升 revision 且产生 `needs_review`，旧下游记录仍存在；
- Task contract：翻拍 Task 可按 `projectId`/`targetType`/`targetId` 查询，错误只返回规范化/脱敏字段；
- workspace/component：URL `stage/shot/task` 恢复选择、未开放阶段不可导航、成功创建后的真实数据读回路径。视觉回归覆盖 1280、768、<768 宽度的三/二/一栏与超长内容。

## Shared Patterns

### 认证与所有权

**来源：**`src/lib/api-auth.ts:306-343`。  
**应用到：**全部翻拍 API。

列表/创建使用 `requireUserAuth`；已有 projectId 的读写使用 `requireProjectAuthLight`。在 `apiHandler` 内第一时间检查 `isErrorResponse`，不要手写 session 读取、不要调用要求小说推广数据的 `requireProjectAuth`。

### API 错误、验证和日志

**来源：**`src/app/api/projects/route.ts:185-249`、`src/app/api/tasks/route.ts:8-14`。  
**应用到：**创建、Shot 写入和工作台快照 API。

使用 `apiHandler`、`ApiError('INVALID_PARAMS', ...)` 和现有项目校验器；从 Task 返回前用 `normalizeTaskError` 形成用户可见错误。服务端使用结构化 logger，不返回原始执行日志或敏感运行配置。

### 任务与 Run 不变式

**来源：**`src/lib/task/service.ts:164-239`、`src/lib/task/submitter.ts:119-245`、`prisma/schema.prisma:661-745`。  
**应用到：**初始化 Task 和后续 Phase 的翻拍能力。

所有能力通过 `Task.type + targetType + targetId` 进入既有生命周期；需要 Run 的 AI 任务交给 submitter 处理。不得为翻拍项目新增独立队列、CLI 启动接口或前端临时 Task 状态。

### 查询和 URL 状态

**来源：**`src/app/[locale]/workspace/[projectId]/page.tsx:82-129`、`src/lib/query/hooks/useProjectData.ts:19-47`。  
**应用到：**工作台 shell、Shot 选择、Task 详情抽屉。

URL 保存阶段和选中稳定 ID；React Query 只缓存服务端快照，写后显式 invalidate。项目/Shot/Task 的数据库状态是唯一事实来源。

### i18n 与 UI 令牌

**来源：**`messages/{zh,en}/workspace.json`、`SegmentedControl.tsx`、`TaskStatusInline.tsx`。  
**应用到：**翻拍创建、摘要、状态、错误、空状态。

所有用户可见文案做中英成对 message；沿用 `AppIcon`、glass tokens 和现有可控组件 API。新增工作台需遵守 `05-UI-SPEC.md` 的浅色静态操作界面、固定面板尺寸、无渐变/装饰卡片和可访问状态语义，不能照搬旧页面的视觉实现。

## No Analog Found

| 文件/能力 | 角色 | 数据流 | 缺口与规划指引 |
|---|---|---|---|
| 翻拍 Shot 的 provenance 领域投影 | model / service | CRUD / transform | 当前库没有同等通用 provenance 实体；以 `Task.payload/result`、`GraphRun.input/output` 的 JSON 兼容方式设计显式、可扩展字段，且记录 schema/执行版本。 |
| 下游 `needs_review` 传播服务 | service | event-driven / transform | 当前库没有翻拍版失效图；实现为翻拍领域服务，在事务中保留旧记录、记录原因/影响范围并更新审核状态。 |
| 三栏翻拍工作台 | component | request-response | 没有同布局的完整 analog；复用项目详情的路由/URL/query 壳与 glass primitives，按 UI-SPEC 独立实现响应式网格与抽屉。 |

## Metadata

**Analog search scope:** `src/app/[locale]/workspace`、`src/app/api/{projects,tasks}`、`src/lib/{api-auth,task,query}`、`src/components`、`prisma`、`messages`、`tests/integration/api`。  
**源文件实际读取:** 17（另读取 Phase context、UI contract、`AGENTS.md` 与 mapper 指令）。  
**Pattern extraction date:** 2026-08-07
