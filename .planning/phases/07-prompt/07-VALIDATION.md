---
phase: 07-prompt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 7 - Validation Strategy

> 本文件是 Phase 7 执行前的验证合同。它把计划中的关键行为对应到可运行的测试；真实 Codex、Docker/Redis 和外部前端合入仍是关闭 Phase 7 的必要条件。

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
| IPRM-01..03 | 一张关键帧一个 Task，完整字段、raw output 和 provenance | `prompt-contract`, `remake-prompt-image` |
| IPRM-04 | 原图/编辑字段/追加新版本 | API review integration + Playwright |
| IPRM-05 | 重分析、历史列表、选定两个版本并排比较、采用后 pointer 变化 | API history/compare assertions + E2E compare view |
| IPRM-06 | pending/invalidated 不进入 generation read gate | service/API integration |
| IPRM-07 | 单图片失败可理解、只重试该失败图片 | Worker/API/E2E |
| VPRM-01..03 | 一次整段输入、一次新 Session、全量 stable Shot set、原子保存 | video atomic integration + fixture/real smoke |
| VPRM-04 | Shot 播放、关键帧查看、编辑追加 | API review integration + Playwright |
| VPRM-05 | 重分析保留旧采用版本、历史列表、按 Shot 并排比较并独立采用 | API history/compare assertions + E2E compare view |
| VPRM-06 | 只有 approved + adopted + current 可下游读取 | generation-read integration |
| VPRM-07 | 失败重试整段分析；旧版本保留；本次不保存任何部分 Shot 结果 | video atomic integration + E2E whole-run retry |

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

## Validation Sign-Off

- [ ] 所有计划 task 都有 automated verify。
- [ ] Wave 0 依赖文件已创建或由对应 TDD task 首先创建。
- [ ] 历史比较有 API、服务端和 E2E 证据，不能只验证“能看历史”。
- [ ] Video 失败语义与 D-03 一致：重试整段，不保存部分成功版本。
- [ ] Prisma migration、isolated bootstrap、`prisma generate` 和集成测试顺序已执行。
- [ ] Docker/MySQL/Redis、focused suites、typecheck、Playwright 和 real Codex smoke 全部通过。
- [ ] 外部前端已合入当前工作树并完成人工验收。

**Approval:** pending
