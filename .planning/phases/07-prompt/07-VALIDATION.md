---
phase: 07-prompt
status: validated
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-08
---

# Phase 7 - Validation Strategy

> 本文件起初是 Phase 7 的执行前验证合同；2026-08-10 已按实际代码、测试和用户验收重审。阶段具备强制的单元/API/Worker 覆盖，但尚不满足 Nyquist-compliant：视频 Prompt 的版本历史/比较在真实 UI 中没有完整交互实现，认证 E2E fixture 也尚未提供。

## Execution Preconditions

- Prisma migration 必须按以下顺序执行：修改 `prisma/schema.prisma`，生成并检查 migration，启动隔离测试数据库并应用 migration，运行 `prisma generate`，然后再运行依赖新模型的集成测试。
- Worker 测试必须能访问隔离 Redis；多 Worker 场景必须通过 Redis lease 验证，不得用浏览器内存或单进程变量代替。
- 真实 Codex smoke 必须显式开启，并使用后台 Worker 路径；没有真实结果时只能标记为环境阻塞，不能把 skip 当作 Phase 完成。
- 外部前端代码必须已经合入当前主项目工作树；仅有需求文档或外部设计分支不满足 D-15。

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 2.1.8 + Playwright 1.62.1 |
| Config | `vitest.config.ts`, `playwright.config.ts` |
| Focused runs | 各计划 `<verify><automated>` 命令 |
| Closing run | `REMAKE_PROMPT_ALLOW_ENV_SKIP=0 REMAKE_PROMPT_REAL_CODEX=1 node scripts/test-remake-prompt-integration.mjs` 加 focused suites 与 real-route Playwright |
| Max feedback latency | unit/contract < 120 秒；集成/E2E 允许 8 分钟 |

## Sampling and Wave Gates

- 每个 task 完成后运行该 task 的 focused verify。
- 每个 Wave 完成后运行该 Wave 的全部 focused suites；Wave 4 还必须运行 typecheck、requirements matrix、环境预检和 Playwright。
- 连续 3 个 task 不得没有 automated verify。
- 任何 `SKIP[ENV]` 只允许在 `REMAKE_PROMPT_ALLOW_ENV_SKIP=1` 的本地可移植性模式出现；关闭 Phase 时必须使用 `=0` 并失败退出。

## Requirement Verification Map

| Requirement | Evidence | Test/acceptance |
|---|---|---|
| IPRM-01 | Start/Middle/End 独立分析 | `remake-prompt-analyze`, `remake-prompt-stage-contract`, `prompt-image-generation-state` |
| IPRM-02 | 完整结构化图片字段 | `prompt-contract`, `remake-prompt` executor tests |
| IPRM-03 | Skill/Schema/Executor provenance | `remake-prompt-image`, `prompt-contract` |
| IPRM-04 | 原图、编辑并追加版本 | `remake-projects-prompt-review`, `remake-projects-prompt-history-compare` |
| IPRM-05 | 重分析、历史、比较与采用 | API covered; real-route E2E requires fixture |
| IPRM-06 | 明确批准后才能采用 | `prompt-service`, review API, stage contract |
| IPRM-07 | 独立失败与重试 | task contract, worker, image task persistence |
| VPRM-01 | 一次整段任务，使用当前有效镜头 | analyze API, video workspace, video atomic persistence |
| VPRM-02 | 每镜头结构化 Video Prompt | `prompt-contract`, video atomic persistence |
| VPRM-03 | 输入与执行 provenance | video workspace, executor, video atomic persistence |
| VPRM-04 | 看片、关键帧、编辑 Video Prompt | API/server covered; real UI history control incomplete |
| VPRM-05 | 重分析保留采用版本、历史、比较 | atomic persistence covered; real UI history/compare incomplete |
| VPRM-06 | 仅 approved + adopted + current 可下游读取 | `prompt-service`, review API, stage contract |
| VPRM-07 | 整段失败不保存部分版本并可重试 | `remake-prompt-video-atomic`; real UI retry/history needs fixture |

## Wave 0 Requirements

- [ ] `tests/fixtures/remake-prompt/codex-events.json`：锁定 JSONL parser fixture，包括 session metadata、final structured result、异常顺序和缺失 final result。
- [ ] `tests/integration/task/remake-prompt-video-atomic.test.ts`：覆盖整段一次调用、exact Shot set、零部分写入和整段重试。
- [ ] `tests/integration/task/remake-prompt-concurrency.test.ts`：模拟多个 Worker/replica，证明最多 3 个 image lease，第四个保持 queued。
- [ ] `tests/integration/api/remake-projects-prompt-review.test.ts`：覆盖历史、选定版本 full output、并排比较所需的两个版本、编辑追加、批准采用和跨项目拒绝。
- [ ] `tests/e2e/remake-prompt.spec.ts`：覆盖图片/Video 历史比较、刷新恢复、失败重试和桌面/移动端布局。

## Manual-Only Verification

| Behavior | Why manual | Instructions |
|---|---|---|
| 外部前端实际合入并可用 | 分支合并状态和视觉交互不能仅由后端测试证明 | 在翻拍工作台执行前端需求文档的 10 步流程，确认图片逐张触发、Video 只有整段触发、历史可比较、审核采用和刷新恢复均正常。 |
| 真实后台 Codex 路径 | 需要本机认证、真实媒体和可控调用成本 | 设置 `REMAKE_PROMPT_REAL_CODEX=1`，通过浏览器触发一次图片或整段 Video 分析，确认 CLI 只在 Worker 启动，pending 版本入库并能在页面查看。 |
| 认证 E2E fixture | Playwright 不能自行创建登录态、项目及多版本 Prompt 历史 | 设置 `REMAKE_PROMPT_E2E_PROJECT_ID` 和 `REMAKE_PROMPT_E2E_REVIEW_FIXTURE=1`，运行 `npx playwright test tests/e2e/remake-prompt.spec.ts --project=desktop`。 |
| Video Prompt 历史/比较 UI | 当前 `PromptVideoTab` 没有可点击的版本历史或比较控件；这是产品缺口而不是环境跳过 | 实现与图片 Prompt 相同的历史展开、选两版比较和采用反馈后，运行上述真实路由 E2E。 |

## Validation Audit 2026-08-10

| Metric | Count |
|--------|-------|
| Requirements mapped | 14 |
| Automated suites green in this audit | 13 suites / 55 tests |
| Redis integration tests green | 1 suite / 2 tests |
| New E2E workflows added | 2 behavioral flows |
| E2E workflows run without fixture | 4 explicitly skipped |
| Gaps found | 2 |
| Resolved | 1 |
| Escalated | 1 |

### Commands and Evidence

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run ...remake-prompt...`: 55 passed; the only initial failures were the Redis-dependent concurrency tests because Redis was absent.
- `BILLING_TEST_BOOTSTRAP=1 npx vitest run tests/integration/task/remake-prompt-concurrency.test.ts`: 2 passed with isolated MySQL/Redis.
- `npx playwright test tests/e2e/remake-prompt.spec.ts --project=desktop`: 4 explicit skips because the authenticated fixture variables were absent; no skip was treated as a pass.
- User acceptance: all ten Phase 7 workflow checks passed, including real whole-video Codex analysis; the user noted only that whole-video analysis takes time.

## Validation Sign-Off

- [x] 所有计划 task 均有至少一项 automated verify。
- [x] Wave 0 依赖文件已创建或由对应 TDD task 首先创建。
- [x] Video 失败语义与 D-03 一致：重试整段，不保存部分成功版本。
- [x] Prisma migration、isolated bootstrap、`prisma generate` 和 Redis 并发集成测试已执行。
- [x] 外部前端已合入当前工作树并完成人工验收。
- [ ] 图片和 Video Prompt 的完整真实路由历史比较 E2E 通过。
- [ ] Video Prompt 版本历史/比较 UI 已实现并验收。

**Approval:** partial - deterministic coverage and manual acceptance pass; Video history/compare E2E remains open.
