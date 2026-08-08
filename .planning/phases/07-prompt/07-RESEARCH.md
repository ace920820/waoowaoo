# Phase 07: Prompt 分析与人工审核 - Research

**Researched:** 2026-08-08
**Domain:** Next.js/Prisma 翻拍工作台、BullMQ Text Worker、Codex CLI Prompt 分析
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 一次 Video Prompt 分析读取整段原始视频，同时接收当前全部已确认 Shot 的边界，以及每个 Shot 的 Start / Middle / End 关键帧；Codex CLI 只调用一次，结果按稳定 Shot 身份拆分保存。
- **D-02:** 每次首次分析或重新分析都开启新的 Codex Session；一次整段视频分析从开始到结束始终使用同一个 Session。Session 只负责执行，Waoo 数据库仍是唯一事实来源。
- **D-03:** 一次整段视频分析是整体成功或整体失败。失败时不保存本次不完整的新版本，也不存在“部分 Shot 成功”；用户可重试整段分析，已有成功版本保持不变。
- **D-04:** Video Prompt 保留双轨结果：页面主要展示每个 Shot 的简短核心事件描述；同时保存结构化的内部分析，覆盖动作、互动、方向、调度、机位、镜头运动、节奏、环境变化和时间推进，供展开查看与后续迭代。
- **D-05:** 第一版优先把任务、结果拆分、保存、编辑、版本和审核框架做稳定。面向用户的 Video Prompt 不追求复杂电影化措辞，视频生成效果主要依赖后续采用的关键帧；Prompt 内容模板以后根据实际使用继续优化。

- **D-06:** Start、Middle、End 三张关键帧彼此独立。用户必须一张图一张图手动点击分析，每张图分别通过 Codex CLI 调用 `image-to-structured-prompt` Skill；本阶段不提供自动分析全部关键帧的操作。
- **D-07:** 用户可以连续点击不同关键帧，系统最多同时运行 3 个图片分析任务，超过 3 个的任务进入现有队列等待。页面必须分别显示排队、运行、成功和失败状态。
- **D-08:** 图片 Prompt 主界面优先展示 Skill 输出的“第 3 部分：整合生成提示词”和“第 4 部分：负面约束”。完整原始输出和解析后的全部内容保存在后台，用户点击“查看完整分析”后可展开查看，包括分析依据、结构化字段以及 Skill 当前合同中的待确认项。
- **D-09:** 每个图片结果都记录 Skill、模型/Executor、Schema 和执行版本。主界面使用稳定解析字段，完整原始输出同时保留，避免 Skill 内容升级后丢失信息。

- **D-10:** 每次重新分析都追加新版本，不覆盖旧版本。用户可查看历史、比较内容并切换当前版本。
- **D-11:** 每张关键帧的图片 Prompt 独立审核；每个 Shot 的 Video Prompt 也独立审核。用户认为内容合适时可以不编辑直接批准；人工编辑后的内容保存为新版本，再由用户批准。
- **D-12:** 新分析版本默认是 `pending review`。如果已有批准版本，新生成的待审核版本不会自动替换它；只有新版本被明确批准后，才成为新的当前采用版本。
- **D-13:** 后续图片或视频生成只能默认使用当前采用且已批准的 Prompt。Task 执行成功不等于人工批准，未批准、失败或因上游变更而需要复核的结果不得进入默认生成流程。

- **D-14:** Prompt 功能继续放在现有视频翻拍工作台，新增 Prompt 阶段，不建立独立产品页面。具体界面和交互要求见 `07-FRONTEND-REQUIREMENTS.md`，由外部前端开发者实现后再合入。
- **D-15:** 后端、数据合同和前端需求文档可以先完成，但外部前端代码尚未合入或完整用户流程尚未验证时，Phase 7 不得标记为完成。
- **D-16:** 从 Phase 7 开始，每个 Phase 的执行计划最多安排 4 个 Wave。规划必须以可用框架为先，避免为尚未打磨成熟的 Prompt 内容做过度设计。

### the agent's Discretion

- Prompt 版本表、审核记录、当前采用指针和原始/解析结果的精确 Prisma 模型拆分，但必须满足追加版本、独立审核、旧批准版本继续生效和完整 provenance。
- Codex CLI executor 的进程封装、结构化输出校验和现有 Text Worker/Task Queue 的接入位置，但浏览器不得直接启动 CLI。
- Video Prompt 内部结构化 Schema 的具体字段组织和第一版提示模板，只要同时保留简短用户描述与可追溯结构化结果，并满足 Phase 7 Requirements。
- 前端组件拆分、断点和控件细节可按 `07-FRONTEND-REQUIREMENTS.md` 与现有设计系统实现，不得改变已经确定的触发、并发、版本和审核规则。

### Deferred Ideas (OUT OF SCOPE)

- 根据实际生成质量持续打磨 Video Prompt 内容、语言风格和结构化 Schema；Phase 7 首版只建立可迭代框架。
- 自动批量分析一个 Shot 或全项目的全部关键帧；当前固定为用户逐张手动触发。
- Phase 8：使用已批准图片 Prompt 生成、比较和采用新关键帧。
- Phase 9：使用采用关键帧与已批准 Video Prompt 生成、比较和采用新视频镜头。
- Phase 10：跨阶段批量选择、批量失败重试、恢复和完整 Task Center 能力。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPRM-01 | 对已确认 Shot 的 Start/Middle/End 原始关键帧逐张发起图片 Prompt 分析 | 图片任务描述器、review gate、Text Worker handler 和 3 并发队列语义 |
| IPRM-02 | 结构化表达主体、外观、动作、空间关系、构图、机位、镜头/景深、场景、光线、颜色、材质、氛围和画面质感 | `image-to-structured-prompt` 的 field schema 作为内部 JSON 合同 |
| IPRM-03 | 记录 Skill/Schema/Executor 版本 | Prompt version 的 provenance 字段和原始输出保留 |
| IPRM-04 | 并排看原图、编辑字段并保存新版本 | 快照/API 投影、追加版本 mutation、Prompt workbench 详情区 |
| IPRM-05 | 重分析、历史比较、选择当前采用版本 | track + version + adopted pointer，批准并采用 mutation |
| IPRM-06 | 明确批准，未审核结果不可作为下游默认输入 | 独立 review/adoption 状态机与后端读取门禁 |
| IPRM-07 | 仅重试失败图片任务并展示可理解错误 | 单帧 Task dedupe、取消/失败投影和错误归一化 |
| VPRM-01 | 基于原始视频、Shot 时间信息和确认关键帧分析 Video Prompt | 项目级整段输入 snapshot 与单次 Codex Session |
| VPRM-02 | 覆盖动作、互动、方向、调度、景别、机位、镜头运动、节奏、环境变化、时间推进 | Video Prompt 结构化内部 schema |
| VPRM-03 | 引用真实输入并记录模型/Schema/执行版本 | 输入 fingerprint、source/shot revision、session metadata、provenance |
| VPRM-04 | 播放原始 Shot、看关键帧、编辑并追加版本 | snapshot media refs、version API、前端双页签 |
| VPRM-05 | 重分析、比较历史、为每 Shot 选择当前采用 Video Prompt | 每 Shot 独立 track 的批准并采用操作 |
| VPRM-06 | 明确批准，未批准不可作为默认视频生成输入 | adoption gate，仅读取 approved + adopted + valid 的版本 |
| VPRM-07 | Video Prompt 失败时可保留成功结果并重试失败 Shot | 与 D-03 对齐为重试整段 Task；不创建“部分成功”的新版本 |
</phase_requirements>

## Summary

Phase 7 应作为现有翻拍工作台的增量扩展：API 只校验权限/输入并创建统一 Task，Codex 进程只能在 Text Worker 内启动，结果通过版本化 schema 校验后才进入 Prisma。现有 `RemakeShot`、`RemakeShotRevision`、`RemakeProvenanceRecord` 和 `RemakeInvalidation` 已能提供稳定 Shot、上游 revision、来源和失效的边界，但还没有 Prompt 版本/审核/采用记录。[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:84-105] [VERIFIED: prisma/schema.prisma:485-577]

推荐最小模型是“一条 PromptTrack 表示一个独立审核对象，多个不可变 PromptVersion 追加到 track，track 只保存 adoptedVersionId；项目级 VideoPromptRun 保存一次整段输入快照和 Codex session metadata”。图片 track 的 target key 为 `image:start`、`image:middle`、`image:end`，视频 track 的 target key 为 `video`。这样不需要用可空 slot 做 MySQL 唯一键，也不会因新待审核版本产生而覆盖旧批准版本。该模型是本阶段的新增设计建议，应由 planner 锁定 Prisma 关系和迁移。[ASSUMED]

**Primary recommendation:** 先实现统一 Prompt version/review service、两个 Text Worker handler 和严格的 API snapshot/mutation，再接入外部前端；Video handler 只在全部结果通过校验后以一个事务一次性写入所有 Shot 版本。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt 分析触发、权限与输入门禁 | API / Backend | Browser / Client | 现有 SceneDetect route 先做 project auth、body schema 和 source 检查，再提交 Task；浏览器不能执行 CLI。[VERIFIED: src/app/api/remake-projects/[projectId]/scenedetect/analyze/route.ts:13-41] |
| Codex CLI 进程、输出捕获、session/timeout/cancel | API / Backend | — | Worker 是耗时 executor 的既有归属，Text Worker 统一消费 `waoowaoo-text`。[VERIFIED: src/lib/workers/text.worker.ts:655-720; src/lib/task/queues.ts:5-40] |
| Prompt 版本、审核、采用和失效 | Database / Storage | API / Backend | 数据库是项目状态唯一事实来源；当前 adopted 指针必须服务端校验。[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:20-24,35-38; src/lib/remake-projects/service.ts:63-117] |
| 原图/视频播放与 Prompt 编辑 | Browser / Client | API / Backend | UI 从 snapshot 获得稳定 media refs、task 和版本状态，提交后重新查询服务端结果。[VERIFIED: .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:109-119] |
| 整段 Video Prompt 原子落库 | Database / Storage | API / Backend | Worker 可解析所有 Shot 结果，但只有事务内再次核对输入 fingerprint 后才允许批量 create。 |

## User Constraints (Implementation Consequences)

- Video 分析是一条 project-level Task，不为单 Shot 暴露 Video 分析按钮；成功提交一批新 `pending review` version，失败只更新 Task，不写 Prompt version。[VERIFIED: .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:66-79]
- 图片分析是三个 slot 独立的 shot-level Task；队列顺序可由 BullMQ 维护，运行并发必须对 Prompt 图片任务单独限为 3，而不能把全局 Text Worker 并发直接改为 3。[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:26-31; src/lib/workers/text.worker.ts:712-720]
- “任务完成”与“人工批准/当前采用”必须是两个不同状态；新 version 先 pending，旧 approved adopted 继续有效，直到明确批准并采用。[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:33-38]
- 前端由外部开发者实现后必须合入并通过真实后台 Codex 路径；只有后端没有达到 Phase 完成门槛。[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:40-44]

## Standard Stack

### Core

| Library / Runtime | Version | Purpose | Why use it |
|---|---:|---|---|
| Prisma / `@prisma/client` | current repo range `^6.19.2` | MySQL schema, migration and `$transaction` | 现有 Remake 与 Task 数据访问已经使用 Prisma；不要另建 Prompt datastore。[VERIFIED: package.json:124,153; prisma/schema.prisma:549-577] |
| BullMQ + Redis | current repo range `^5.67.3` / local Redis 8.6.2 | queue, dedupe, retry and overflow | 现有四条队列按 Task type 路由，text queue 是 Codex 接入点。[VERIFIED: package.json:137; src/lib/task/queues.ts:5-40,68-101] |
| Next.js API routes | current repo range `^15.5.7` | authenticated trigger, snapshot and mutation endpoints | SceneDetect API 已采用 `apiHandler` + project auth + `202` task response。[VERIFIED: package.json:149; src/app/api/remake-projects/[projectId]/scenedetect/analyze/route.ts:1-41] |
| Zod | current repo range `^3.25.76` | strict request/result parsing | 现有 analyze route 使用 strict body schema；Prompt executor 结果必须同样 fail closed。[VERIFIED: package.json:161; src/app/api/remake-projects/[projectId]/scenedetect/analyze/route.ts:1-11] |
| Codex CLI | installed `0.146.0` | backend analysis executor | `codex exec` supports non-interactive execution, `--json` JSONL events, `--output-schema` and `codex exec resume SESSION_ID`; no CLI timeout/cancel flag appears in installed help.[VERIFIED: local `codex --version` and `codex exec --help`, 2026-08-08] |

### Supporting

| Library / Runtime | Use |
|---|---|
| Node `child_process` | 使用 `spawn`/`execFile` 的 argv 数组启动 CLI，禁止 shell 拼接。[VERIFIED: src/lib/remake-projects/scenedetect/video-probe.ts:1-35] |
| React Query | `queryKeys.remake.snapshot(projectId)` 失效并重新读取 snapshot；不以本地状态推断审核。[VERIFIED: src/lib/query/keys.ts:102-106; src/lib/query/hooks/useRemakeProject.ts:33-59] |
| Vitest / Playwright | unit、API integration、Worker integration 和真实工作台 E2E；当前配置分别使用 node/Vitest 与 desktop/tablet/mobile 三项目。[VERIFIED: vitest.config.ts:15-29; playwright.config.ts:3-16] |

**Installation:** 无新增外部 npm package；复用现有依赖。需要迁移时只生成 Prisma migration，不运行 `npm install`。

## Package Legitimacy Audit

本阶段不安装外部 package，因此不触发新增包 legitimacy gate。Codex CLI 是本机已有可执行工具，不应在 Worker 里通过 `npx` 自动下载或升级。[VERIFIED: package.json:1-5; local `command -v codex`, 2026-08-08]

## Architecture Patterns

### System Architecture Diagram

```text
Browser Prompt stage
  ├─ POST image analysis (shotId + slot + current revision)
  └─ POST video analysis (projectId)
          ↓ authenticated API + strict Zod + review gate
       submitTask / dedupeKey
          ↓ BullMQ Redis text queue
       Text Worker / withTaskLifecycle
          ↓ controlled Codex CLI child process
       raw JSONL/output + session metadata
          ↓ Zod result contract + input fingerprint check
       Prompt service
          ├─ image: one track/version in one transaction
          └─ video: validate every Shot → one all-or-nothing transaction
          ↓
       MySQL PromptTrack/PromptVersion/VideoRun + provenance
          ↓
       remake snapshot/API → React Query → Prompt UI + Task drawer
```

### Recommended Project Structure

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_add_remake_prompt_analysis/migration.sql
src/lib/remake-projects/prompt/
├── contracts.ts          # Zod input/result schemas and stable target keys
├── executor.ts           # Codex child-process boundary
├── task-contract.ts      # two Task descriptors, dedupe and payload parsing
├── service.ts             # versions, review/adopt, invalidation, atomic writes
└── video-template.ts      # small first-version prompt template
src/lib/workers/handlers/remake-prompt.ts
src/lib/workers/text.worker.ts
src/lib/remake-projects/service.ts
src/app/api/remake-projects/[projectId]/prompts/...
src/app/[locale]/workspace/[projectId]/modes/remake/
└── prompt/PromptStage.tsx and focused components
tests/unit/remake-projects/prompt-*.test.ts
tests/integration/api/remake-projects-prompt*.test.ts
tests/integration/task/remake-prompt*.test.ts
tests/e2e/remake-prompt.spec.ts
```

### Pattern 1: Append-only track/version with adopted pointer

`PromptTrack` owns one independent review target: `shotId`, `targetKey`, `adoptedVersionId` and current invalidation state. `PromptVersion` owns immutable `versionNumber`, `source` (`analysis` or `human_edit`), `reviewStatus`, `rawOutput`, `parsedOutput`, `coreText`, `negativeConstraints`, `schemaVersion`, `skillVersion`, `executorVersion`, `model`, `inputFingerprint`, `sourceRevision` and `shotRevisionId`. Use a unique `(trackId, versionNumber)` and never update content fields of an existing version. The track pointer changes only inside an authenticated “approve and adopt” mutation. This directly preserves old approved versions while a new pending version is being reviewed. [VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:33-38; .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:81-92]

Do not store only `approved: Boolean` on a Shot. It cannot represent “viewing version 4 while version 2 remains adopted”, and it would couple three image slots and one video result. The existing Shot model has one `currentRevision` for upstream Shot data, not a Prompt adoption pointer.[VERIFIED: prisma/schema.prisma:485-525]

### Pattern 2: Immutable input snapshot and stale-result rejection

At trigger time, load the project and verify: current source exists, each selected Shot is owned by the project, Shot review gate is confirmed, current revision is active, and all three keyframe media refs exist. Serialize stable input metadata into the Task payload and compute a deterministic SHA-256 fingerprint over source revision, ordered Shot IDs, each Shot revision, frame tuple and media IDs. The Worker uses this captured input only; it must not silently re-read changed Shot data and attach output to a newer revision.

At persistence time, re-read the same project state inside the transaction. If source revision, any Shot current revision, keyframe media refs, or the task's input fingerprint no longer match, throw a stale-input error and write no version. This follows SceneDetect's existing “resolve current revision inside transaction” and return `applied: false` behavior.[VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:39-60; src/lib/remake-projects/scenedetect/mutations.ts:39-47]

### Pattern 3: API thin, Worker owns side effects

Routes should authenticate, parse a strict body, enforce `evaluateSceneDetectReviewGate`, call a Prompt executor/submitter and return `202 { taskId }`. They must not invoke `codex`, parse model output, or create Prompt versions synchronously. Register two Task types in `TASK_TYPE`, route them to the existing text queue, add two handlers to the existing `processTextTask` switch, and run them through `withTaskLifecycle`. [VERIFIED: src/app/api/remake-projects/[projectId]/scenedetect/analyze/route.ts:13-41; src/lib/workers/text.worker.ts:655-720; src/lib/workers/shared.ts:319-430]

### Pattern 4: Image concurrency is a dedicated gate

The global Text Worker currently defaults to concurrency 10. Do not change it to 3, because that changes unrelated text workflows. Add a small DB/Redis-backed Prompt image concurrency gate around the Codex call, or route Prompt image tasks through a dedicated worker with concurrency 3 while retaining the shared Task lifecycle. A task that cannot acquire a slot remains queued at the application/queue boundary; after completion/failure/cancel the slot is released in `finally`. BullMQ overflow is the queue, not browser local state. [VERIFIED: src/lib/workers/text.worker.ts:712-720; .planning/phases/07-prompt/07-CONTEXT.md:26-31]

### Pattern 5: Atomic video fan-out

Video handler sequence:

1. Parse payload and load the exact input snapshot; mark progress indeterminate for CLI work.
2. Create one new CLI process/session for the whole video. Pass the video and all confirmed Shot/frame metadata once. Do not invoke one process per Shot.
3. Capture all stdout JSONL, stderr separately, final message, exit code, duration, timeout/cancel signal and session ID. Validate one result for every expected stable Shot ID and reject duplicates, missing IDs, unknown IDs, malformed schema or mismatched input fingerprint.
4. In one Prisma `$transaction`, re-check authorization/current source/Shot revisions, create all `PromptVersion` rows and one provenance/run record, then return all created IDs. Any validation or transaction error leaves no new version rows.

The database transaction must begin after the CLI call, not wrap a long-running child process. The existing keyframe handler also performs external media work before a short `$transaction`, then checks current revisions before creating the new revision.[VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:27-60]

### Pattern 6: Review/adoption mutations are independent

Use separate authenticated operations for `save-as-new-version`, `approve-and-adopt`, and `invalidate/review`. `approve-and-adopt` must verify the version belongs to the user/project, the track target is correct, the version is not stale/invalidated, and its source revision/media fingerprint still matches. It then updates the track pointer and version review metadata in one transaction. Approving one image slot or one Shot video track must not update siblings. Historical selection is read-only; only explicit adoption moves the pointer.[VERIFIED: .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:81-119]

When SceneDetect changes a Shot revision or keyframe, create/mark Prompt invalidations for Prompt versions whose `shotRevisionId` or input fingerprint is affected. Keep the rows and approval audit; only prevent them from being used as the default downstream input. Do not delete or silently unapprove historical data.[VERIFIED: src/lib/remake-projects/scenedetect/mutations.ts:63-84; .planning/phases/07-prompt/07-CONTEXT.md:35-38]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Background execution | API-side `spawn`, browser CLI call, custom in-memory queue | `submitTask` → BullMQ text queue → `withTaskLifecycle` | Existing Task owns auth, retry, heartbeat, result/error and refresh recovery.[VERIFIED: src/lib/task/submitter.ts:119-209; src/lib/workers/shared.ts:319-430] |
| Prompt result persistence | JSON blob on Shot or overwrite `payload` | append-only PromptTrack/PromptVersion and adopted pointer | Required to preserve old approved versions and independent slot/Shot review.[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:33-38] |
| Review gate | infer approved from Task `completed` | explicit version review/adoption state | Existing code exposes Task terminal state separately from business review.[VERIFIED: src/app/api/remake-projects/[projectId]/tasks/route.ts:42-65] |
| Structured image schema | string splitting/regex-only headings | versioned Zod parser plus raw output fallback | The Skill contract has stable field groups and explicit uncertainty rules; parse failure must retain raw output.[CITED: /Users/jamiezhao/.codex/skills/image-to-structured-prompt/SKILL.md:9-12,110-118; /Users/jamiezhao/.codex/skills/image-to-structured-prompt/references/field-schema.md:5-81] |
| Atomic fan-out | loop `create` with no transaction or partial commits | validate whole result then one `$transaction` | D-03 requires no partial Shot versions.[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:20-24] |
| CLI cancellation | kill by PID from request or rely on CLI flag | Worker-owned child handle + DB `assertTaskActive` + SIGTERM/SIGKILL timeout path | Installed CLI help exposes no timeout/cancel option; cancellation is an executor concern.[VERIFIED: local `codex exec --help`, 2026-08-08; src/lib/workers/utils.ts:68-72] |

**Key insight:** The hard part is not generating prose; it is keeping a version's meaning bound to the exact Shot revision and approval state. Every read/write path should therefore go through the Prompt service, while the CLI remains a replaceable executor.

## Common Pitfalls

### Pitfall 1: New analysis silently replaces approved input

**What goes wrong:** A new result is written as “current” merely because the Task completed. [VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:35-38]
**How to avoid:** Keep `latestVersionId` and `adoptedVersionId` distinct; only explicit approve-and-adopt changes the latter.
**Warning signs:** Snapshot returns one version without `isAdopted`, or Phase 8/9 can query “latest” without checking review status.

### Pitfall 2: Partial Video Prompt success

**What goes wrong:** The model returns four of five Shot results and a loop persists four rows. [VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:20-24]
**How to avoid:** Compare exact expected stable IDs before opening the persistence transaction; write all rows in one transaction.
**Warning signs:** `PromptVersion.create` appears inside a per-shot loop outside `$transaction`, or UI shows a successful Shot after the project-level Task failed.

### Pitfall 3: Stale SceneDetect inputs attach to new revisions

**What goes wrong:** A long CLI run finishes after a user changes a boundary/keyframe and its result becomes valid by accident. [VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:49-59]
**How to avoid:** Carry source/Shot revision plus media refs/fingerprint in payload and re-check them in the commit transaction.
**Warning signs:** Worker reloads “current Shot” after the CLI call without comparing the captured revision.

### Pitfall 4: Global queue concurrency regression

**What goes wrong:** Setting Text Worker concurrency to 3 satisfies image UI tests but throttles unrelated text flows. [VERIFIED: src/lib/workers/text.worker.ts:712-720]
**How to avoid:** Add a Prompt-image-specific concurrency gate/dedicated worker and test 4 submissions with 3 active.
**Warning signs:** Existing `QUEUE_CONCURRENCY_TEXT` behavior changes or the fourth task is marked processing instead of queued.

### Pitfall 5: Unsafe CLI argument and output handling

**What goes wrong:** User content becomes shell syntax, paths or secrets leak through stderr/task errors, or unbounded stdout fills memory. [VERIFIED: src/app/api/remake-projects/[projectId]/tasks/route.ts:19-21; src/app/api/tasks/[taskId]/route.ts:42-87]
**How to avoid:** Use `spawn(file, args, { shell: false })`, pass prompt via stdin or a controlled file, allow only fixed flags, cap raw/stderr bytes, redact URLs/absolute paths/API-key patterns before logging and storing user-facing errors. Preserve raw analysis separately with an explicit size limit.
**Warning signs:** template literals form a command string, raw stderr is returned in the API, or `JSON.parse` trusts arbitrary result shape.

### Pitfall 6: Parser drops useful raw Skill output

**What goes wrong:** A heading or JSON parse change makes the UI blank and destroys the only evidence. [VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:28-31; .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:56-64]
**How to avoid:** Persist `rawOutput` and nullable `parsedOutput`; show a “partially unstructured” full-analysis view when parsing fails. The two primary fields are Section 3 integrated prompt and Section 4 negative constraints.[CITED: /Users/jamiezhao/.codex/skills/image-to-structured-prompt/SKILL.md:110-118]

### Pitfall 7: Reusing a session across reruns

**What goes wrong:** A rerun inherits stale conversation context and violates the new-session decision. [VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:20-22]
**How to avoid:** Every trigger creates a new session; one video task holds one child process/session for its complete call. Store session ID and execution timestamps as provenance, not as the source of truth.

## Code Examples

### Task descriptor skeleton

```ts
// Proposed contract; names are new Phase 7 values. [ASSUMED]
const PROMPT_TASKS = {
  image: { capability: 'remake.prompt.image.analyze', targetType: 'remake_shot_prompt' },
  video: { capability: 'remake.prompt.video.analyze', targetType: 'remake_project_prompt' },
} as const

const dedupeKey =
  `remake-prompt:image:${projectId}:${shotId}:${slot}:${sourceRevision}:${shotRevision}:${mediaId}`
```

The descriptor must include `sourceRevision`, `shotRevision`, `slot` or project run key, executor/skill/schema versions, and input fingerprint. Use the established `submitTask` payload and BullMQ `jobId`/dedupe behavior.[VERIFIED: src/lib/remake-projects/scenedetect/task-contract.ts:10-44; src/lib/task/queues.ts:89-101]

### CLI boundary skeleton

```ts
const child = spawn(codexPath, [
  'exec', '--json', '--output-schema', schemaPath,
  '-C', controlledWorkDir, '--sandbox', 'read-only',
], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })

const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
const cancelPoll = setInterval(async () => {
  if (!(await isTaskActive(taskId))) child.kill('SIGTERM')
}, cancelPollMs)
// Capture bounded stdout/stderr; parse JSONL only after exit; always clear timers.
```

Use the installed `codex exec` flags verified above; do not assume a CLI-side timeout flag. On timeout, allow a short grace period and send SIGKILL if needed. Return a sanitized typed error, while storing bounded raw executor output only in the Prompt version/run record. The process should receive one controlled prompt containing all video inputs, so reruns instantiate a new process/session.[VERIFIED: local `codex exec --help` and `codex exec resume --help`, 2026-08-08; .planning/phases/07-prompt/07-CONTEXT.md:20-22]

### Image result contract

```ts
// Proposed stable parser contract. [ASSUMED]
const imageResultSchema = z.object({
  analysisBasis: z.unknown().optional(),
  structured: z.record(z.unknown()),
  integratedPrompt: z.string(),
  negativeConstraints: z.string(),
  uncertainties: z.array(z.string()).default([]),
}).strict()

type StoredImageResult = {
  rawOutput: string
  parsedOutput: unknown | null
  parseStatus: 'parsed' | 'partial'
  integratedPrompt: string | null
  negativeConstraints: string | null
}
```

The stable parsed fields should map the Skill schema sections 1-6, with section 3主体 and section 4场景 as nested structured data, while the UI promotes `integratedPrompt` and `negativeConstraints`. The exact JSON key names above are a first-version implementation choice; the source Skill defines the semantic fields, not a machine-readable JSON API.[CITED: /Users/jamiezhao/.codex/skills/image-to-structured-prompt/references/field-schema.md:5-81; /Users/jamiezhao/.codex/skills/image-to-structured-prompt/SKILL.md:110-118]

### Atomic video persistence skeleton

```ts
const parsed = videoEnvelopeSchema.parse(rawOutput)
assertExactShotSet(parsed.shots, input.shots.map((shot) => shot.id))
assert(parsed.inputFingerprint === input.inputFingerprint)

return prisma.$transaction(async (tx) => {
  const current = await readPromptInputState(tx, projectId)
  assertSameFingerprint(current, input)
  const run = await tx.remakePromptRun.create({ data: runData })
  for (const result of parsed.shots) {
    const track = await getOrCreateTrack(tx, result.shotId, 'video')
    await appendVersion(tx, track.id, result, run.id)
  }
  return { runId: run.id, shotCount: parsed.shots.length }
})
```

The loop is safe only inside the single transaction and only after exact-set validation. A thrown parse/stale/DB error rolls back every new version. Existing approved rows and their adopted pointers are untouched.[VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:47-60; .planning/phases/07-prompt/07-CONTEXT.md:20-24]

## Concrete File Plan / Closest Analogs

| Area | Modify | Create | Closest analog |
|---|---|---|---|
| Prisma | `prisma/schema.prisma` | timestamped migration | `RemakeShotRevision`, `RemakeProvenanceRecord`, `RemakeInvalidation` at `prisma/schema.prisma:485-577` |
| Contracts | `src/lib/task/types.ts`, task type catalog/guards as required | `src/lib/remake-projects/prompt/contracts.ts`, `task-contract.ts` | `src/lib/remake-projects/scenedetect/task-contract.ts:10-87` |
| CLI | — | `src/lib/remake-projects/prompt/executor.ts` | `src/lib/remake-projects/scenedetect/video-probe.ts:1-35` for `execFile`; SceneDetect executor-client for boundary separation |
| Worker | `src/lib/workers/text.worker.ts` | `src/lib/workers/handlers/remake-prompt.ts` | `src/lib/workers/handlers/scenedetect.ts:1-76`, `src/lib/workers/shared.ts:319-430` |
| Domain service | `src/lib/remake-projects/service.ts` | `src/lib/remake-projects/prompt/service.ts`, optional `invalidation.ts` | `src/lib/remake-projects/scenedetect/keyframes.ts:39-60`, `mutations.ts:39-93` |
| API | — | `src/app/api/remake-projects/[projectId]/prompts/route.ts`, `[shotId]/image/[slot]/route.ts`, `[target]/versions/[versionId]/...` | `scenedetect/analyze/route.ts:13-41`, `tasks/[projectId]/route.ts:33-66`, `tasks/[taskId]/route.ts:42-88` |
| Query/UI | `RemakeWorkbench.tsx`, `useRemakeProject.ts`, `query/keys.ts`, locale messages | `modes/remake/prompt/PromptStage.tsx` plus version/editor subcomponents | `RemakeWorkbench.tsx:19-77`, `useRemakeProject.ts:8-59`, existing prompt-stage components under novel-promotion are visual/editor analogs only |
| Tests | task catalogs/route catalog as guards require | focused unit, integration, E2E files listed below | `tests/integration/api/remake-projects-scenedetect-*.test.ts`, `tests/e2e/remake-scenedetect-review.spec.ts` |

Do not modify the vendored SceneDetect app to add Prompt UI. Its integration runtime remains a separate stage; Prompt belongs in the Waoo shell and reads Waoo snapshot data.[VERIFIED: .planning/ROADMAP.md: v1.1 integration boundary; .planning/phases/06-scenedetect/06-CONTEXT.md; src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx:68-70]

## Planning Implications (maximum 4 Waves)

### Wave 1: Contracts and persistence

Add the minimum PromptTrack/PromptVersion/PromptRun schema and migration, Zod contracts, stable target keys, input fingerprint, review/adoption service, and invalidation hooks. Unit-test append-only versions, independent tracks, old approved pointer preservation, stale input rejection, and approved/adopted read gate.

### Wave 2: Task and Codex executor

Add the two Task types/descriptors, API submit routes, bounded safe CLI runner, image concurrency 3 gate, Text Worker handlers, raw/parsed output capture, session metadata and sanitized errors. Test command construction, JSONL/result parsing, timeout, cancel, retry/dedupe, queue overflow and independent image failures.

### Wave 3: Snapshot/API and frontend integration

Extend `getRemakeProjectSnapshot` and React Query types/keys with current/latest/history prompt projections and task projections. Add Prompt stage to `RemakeWorkbench`, image slot actions/results, video project action/results, versions, edit-save-as-new, approve/adopt, all required empty/loading/queued/running/failed/stale states. Keep the Task drawer as the technical detail surface.

### Wave 4: End-to-end acceptance and hardening

Run API/Worker integration against fixtures, then Playwright desktop/mobile flow. Cover four rapid image clicks (3 active + queued overflow), raw plus parsed display, independent approvals, video rerun retaining old adopted versions, atomic video failure, refresh recovery, stale invalidation, no direct browser CLI, and no horizontal overflow. Phase cannot close until external frontend code is merged and one real backend Codex path is verified.[VERIFIED: .planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:121-149; .planning/phases/07-prompt/07-CONTEXT.md:40-44]

## State of the Art

| Old/current pattern | Phase 7 application | Impact |
|---|---|---|
| Generic `RemakeProvenanceRecord` attached to Shot | Add Prompt-specific immutable version metadata while retaining generic provenance | Prompt history and adoption can be queried without overloading SceneDetect payload JSON. |
| Task terminal state projected as `reviewStatus: independent` | Separate Prompt version review/adoption fields | Worker success no longer implies human approval.[VERIFIED: src/app/api/remake-projects/[projectId]/tasks/route.ts:42-65] |
| SceneDetect per-shot transaction | Video Prompt project-level transaction after whole-result validation | Prevents partial fan-out by design.[VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:47-60] |

**Deprecated/outdated for this phase:** storing Prompt text directly in `RemakeShotRevision.payload`, overwriting an approved Prompt on re-analysis, per-Shot Video CLI calls, browser-side CLI invocation, and automatic “analyze all keyframes”. These conflict with locked decisions.[VERIFIED: .planning/phases/07-prompt/07-CONTEXT.md:20-38]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | API/Worker/CLI wrapper | ✓ | v22.22.3 | — |
| npm + installed dependencies | Prisma/Next/Vitest | ✓ | npm 10.9.8; `node_modules` present | — |
| Codex CLI | real Prompt executor path | ✓ | `codex-cli 0.146.0` | Human-blocking if deployment worker lacks same binary/auth |
| Redis | BullMQ queues and concurrency gate | ✓ | redis-cli 8.6.2; `PONG` | Do not fall back to browser memory; configure the service or block execution |
| MySQL | Prisma integration tests/runtime | available as client; live server not confirmed | mysql 9.6.0 client | use project test Docker/CI database |
| Docker | test service fallback | ✓ | 29.3.0, Colima test context | — |
| ffprobe | video input/probe | ✓ | installed; version output unavailable | existing SceneDetect probe contract |
| Playwright browser | UI acceptance | configured | executable depends on runner | use `PLAYWRIGHT_EXECUTABLE_PATH` if required |

The phase has external dependencies, so the planner must include a worker environment check and a fixture/mock path for deterministic tests. The current project also contains `.env`; never include its values in Task payloads, logs, or captured CLI output.[VERIFIED: local availability probe, 2026-08-08; src/app/api/remake-projects/[projectId]/tasks/route.ts:19-21]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 2.x for unit/integration; Playwright 1.x for E2E |
| Config | `vitest.config.ts`, `playwright.config.ts` |
| Quick run | `npx vitest run tests/unit/remake-projects tests/unit/worker/remake-prompt.test.ts -x` (use the local Vitest equivalent if `-x` is unsupported) |
| API/Worker integration | `cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api/remake-projects-prompt*.test.ts tests/integration/task/remake-prompt*.test.ts` |
| Full relevant suite | `npm run test:behavior:full` plus `npx playwright test tests/e2e/remake-prompt.spec.ts` |

The repository’s configured Vitest test timeout is 30 seconds and Playwright has desktop/tablet/mobile projects.[VERIFIED: vitest.config.ts:15-29; playwright.config.ts:3-16]

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| IPRM-01/02/03 | valid confirmed frame creates structured version with skill/schema/executor provenance | unit + Worker integration | `vitest run tests/unit/remake-projects/prompt-contract.test.ts tests/unit/worker/remake-prompt.test.ts` | Wave 0 |
| IPRM-04/05/06 | edit appends; approve/adopt is per slot; pending is not downstream eligible | API integration | `vitest run tests/integration/api/remake-projects-prompt-review.test.ts` | Wave 0 |
| IPRM-07 | malformed/failed image task is retryable and does not affect siblings | Worker/API integration | `vitest run tests/integration/task/remake-prompt-image.integration.test.ts` | Wave 0 |
| VPRM-01/02/03 | one video invocation receives full input and maps exact stable Shot IDs | executor contract + Worker integration | `vitest run tests/unit/remake-projects/prompt-video-contract.test.ts tests/integration/task/remake-prompt-video.integration.test.ts` | Wave 0 |
| VPRM-04/05/06 | per-Shot video edit/history/adopt gate | API integration + E2E | `vitest run tests/integration/api/remake-projects-prompt-review.test.ts` | Wave 0 |
| VPRM-07 | whole-run failure writes no new versions and leaves old versions | Worker integration | `vitest run tests/integration/task/remake-prompt-video-atomic.integration.test.ts` | Wave 0 |
| D-07 | 4 rapid image submissions yield at most 3 running and queued overflow | concurrency integration + E2E | `vitest run tests/integration/task/remake-prompt-concurrency.integration.test.ts`; `playwright test tests/e2e/remake-prompt.spec.ts` | Wave 0 |
| D-15 | real route, refresh recovery, responsive no-overflow and one real Codex path | E2E/manual gate | `playwright test tests/e2e/remake-prompt.spec.ts` | Wave 0 |

### Wave 0 Gaps

- [ ] Add Prompt contract/service tests, including exact-set video validation and stale fingerprint rejection.
- [ ] Add Worker executor tests with a fake `spawn` child; do not make the default unit suite call a live Codex account.
- [ ] Add API contract tests for trigger, snapshot, edit, approve/adopt, history and retry routes.
- [ ] Add `tests/e2e/remake-prompt.spec.ts` with authenticated fixture/project environment variables and a separate opt-in real Codex test.
- [ ] Update task-type catalog/route catalog/requirements matrix when repository guards require new routes/types.

### Sampling Rate

- Per task: focused Vitest unit test.
- Per wave: focused integration/API suite plus typecheck.
- Phase gate: relevant behavior guards, integration tests, Playwright E2E and one real backend Codex path green before `$gsd-verify-work`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---|---|---|
| V2 Authentication | yes | Every Prompt route uses existing project/user auth; Worker trusts task ownership and rechecks project ownership before persistence. |
| V3 Session Management | yes | Codex session ID is execution metadata only; never treat it as Waoo auth or approval state. |
| V4 Access Control | yes | Validate project → remake project → Shot/track/version ownership on every mutation; never trust executor-provided IDs. |
| V5 Input Validation | yes | Strict Zod request and output schemas, exact Shot set, revision/media fingerprint and bounded text/JSON sizes. |
| V6 Cryptography | yes | Use Node `crypto` SHA-256 for input fingerprints; do not invent a signing scheme or store secrets in provenance. |

### Known Threat Patterns for Next.js + Worker + CLI

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Shell injection through prompt/path | Tampering | `spawn` with fixed executable and argv, `shell:false`; prompt via stdin/controlled file. |
| Prompt/executor output includes API keys, absolute paths or signed URLs | Information disclosure | Redact before task error/log/API projection; raw output access remains authorized and bounded.[VERIFIED: src/app/api/remake-projects/[projectId]/tasks/route.ts:19-21] |
| Cross-project Shot ID in result | Elevation of privilege/tampering | Resolve expected IDs from authenticated input and compare in transaction; executor IDs are untrusted.[VERIFIED: src/lib/remake-projects/scenedetect/keyframes.ts:49-53] |
| Cancel race after CLI success | Tampering/lost update | Recheck active task before commit and recheck input fingerprint in transaction; canceled/stale task cannot create a version. |
| Oversized raw output | Availability | cap stdout/stderr/raw fields and store an explicit truncation marker; reject result if required structured fields are absent. |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | The recommended PromptTrack/PromptVersion/PromptRun split is the smallest maintainable Prisma design. | Summary/Architecture | Migration shape or query complexity changes; user/planner confirmation required. |
| A2 | `codex exec --json` JSONL can expose a session/thread identifier that the parser can capture from an event, or the runner can record a nullable ID plus full bounded event metadata. | Standard Stack/CLI | Session provenance field may need a CLI-specific adapter test or alternate metadata source. |
| A3 | A Redis-backed semaphore or dedicated Prompt worker is acceptable for the fixed image concurrency of 3. | Architecture Pattern 4 | A deployment-specific queue design decision remains before implementation. |

These are design assumptions, not verified facts. The current CLI help verified flags and resume syntax but not the exact JSONL event schema; planner should add a focused smoke/fixture test before locking the parser.[VERIFIED: local `codex exec --help` and `codex exec resume --help`, 2026-08-08]

## Open Questions

1. **What exact `codex exec --json` event contains the session ID and final answer?**
   - What we know: installed CLI provides JSONL mode, output schema and resume by session ID.[VERIFIED: local `codex exec --help`, 2026-08-08]
   - What's unclear: this session did not run a live account-backed CLI request, and Context7/ctx7 was unavailable.
   - Recommendation: make a fake JSONL fixture plus one opt-in smoke test against the installed binary; fail closed if no final structured result is captured.
2. **Where should the Prompt image concurrency gate live in production?**
   - What we know: global Text Worker concurrency is currently 10.[VERIFIED: src/lib/workers/text.worker.ts:712-720]
   - What's unclear: deployment runs one worker process or multiple replicas.
   - Recommendation: use a Redis semaphore with lease/renewal if multiple replicas are possible; otherwise a dedicated prompt-image worker with concurrency 3 is simpler.
3. **Which media URL/storage contract does the external frontend consume?**
   - What we know: SceneDetect media URLs are Waoo API URLs built from project/media IDs.[VERIFIED: src/app/api/remake-projects/[projectId]/scenedetect/project/route.ts:21-35]
   - What's unclear: the external frontend branch is not present in this worktree.
   - Recommendation: expose the same stable project-scoped media URL shape in Prompt snapshot and avoid exposing storage keys.

## Sources

### Primary (HIGH confidence)

- `prisma/schema.prisma:485-577,797-890` — Remake Shot/revision/provenance/invalidation and Task/GraphRun definitions.
- `src/lib/workers/shared.ts:319-430,648-730` — lifecycle, heartbeat, terminal state and progress/event publication.
- `src/lib/workers/text.worker.ts:655-720` — Text Worker dispatch and concurrency.
- `src/lib/remake-projects/scenedetect/keyframes.ts:39-60` — revision check plus transaction persistence analog.
- `src/lib/remake-projects/scenedetect/mutations.ts:39-93` — optimistic token, append revision and invalidation analog.
- Local `codex-cli 0.146.0` `codex exec --help` / `codex exec resume --help` — installed CLI flags and resume syntax.

### Secondary (MEDIUM confidence)

- `.planning/phases/07-prompt/07-CONTEXT.md:6-128` — locked product decisions and scope.
- `.planning/phases/07-prompt/07-FRONTEND-REQUIREMENTS.md:7-149` — frontend contract and acceptance flow.
- `src/app/api/tasks/[taskId]/route.ts:42-88` and `src/app/api/remake-projects/[projectId]/tasks/route.ts:33-66` — cancellation and sanitized task projection.

### Tertiary (LOW confidence)

- None. Context7 was unavailable and no web provider was enabled; CLI session event shape remains an open question rather than an asserted fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for in-repo tools and installed versions; MEDIUM for Codex JSONL event details because only local help was inspected.
- Architecture: HIGH for reuse boundaries and transaction patterns; MEDIUM for the proposed PromptTrack schema and concurrency implementation choice.
- Pitfalls: HIGH for Task/SceneDetect behaviors observed in source; MEDIUM for process-level signal behavior until executor tests exist.

**Research date:** 2026-08-08
**Valid until:** 2026-08-15 for Codex CLI behavior; 2026-09-07 for stable in-repo architecture.
