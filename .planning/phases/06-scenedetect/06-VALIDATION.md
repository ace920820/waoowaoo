---
phase: 6
slug: scenedetect
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-07
---

# Phase 6 - Validation Strategy

> Phase 6 执行期间的自动化反馈合同。当前为规划稿。`$gsd-validate-phase 6` 按 GSD 只在 Phase 6 已执行并产生 SUMMARY 后追溯审计；它不是 06-01 的执行前置，也不能在未执行阶段提前把本文改为 validated/approved。

## Execution Environment Preconditions

- 06-01 开工前确认执行环境可调用 `ffprobe`，并用受支持最小视频验证 duration/fps/width/height/totalFrames 输出。
- 06-03 开工前确认 server-only `SCENEDETECT_EXECUTOR_BASE_URL` 的 `/api/health` 可达，并配置不暴露给浏览器的 `SCENEDETECT_EXECUTOR_TOKEN`；真实 analyze/keyframes smoke 仍保留在下方 Manual-Only，直到具备可重复 CI 环境。

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 + Playwright 1.62.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | 各 task 的 focused `npx vitest run <files>` 命令 |
| **Full suite command** | `npm run typecheck && npm run lint && node scripts/vendor-scenedetect.mjs --check && npm run check:test-tasktype-coverage && BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/scenedetect-*.test.ts tests/contracts/remake-scenedetect-*.test.ts tests/integration/api/remake-projects-scenedetect-*.test.ts tests/guards/remake-scenedetect-*.test.ts && npx playwright test tests/e2e/remake-scenedetect-review.spec.ts` |
| **Estimated runtime** | 约 4-8 分钟，取决于 Playwright 与数据库启动时间 |

## Sampling Rate

- **After every task commit:** 运行该 task `<verify><automated>` 中的 focused 命令。
- **After every plan wave:** 运行该 plan 的全部 focused suites；Wave 5 以后同时运行 vendor check、lint 与 typecheck。
- **Before `$gsd-verify-work`:** Full suite 必须为 green，且有服务环境需通过真实 executor health smoke。
- **Max feedback latency:** focused suite 目标小于 120 秒；Playwright/full suite 可放宽至 8 分钟。

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SHOT-01 | T-06-01..03 | 鉴权、限额、服务端 probe、幂等 current source revision | integration | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-source.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | SHOT-01 | T-06-01..03 | 上传补偿、替换保留历史、旧结果失效 | integration | 同 06-01-01 | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | SHOT-03 | T-06-04..06 | 非法 envelope、越界帧和错误来源无法入库 | unit/contract | `npx vitest run tests/unit/remake-projects/scenedetect-result-envelope.test.ts tests/unit/remake-projects/scenedetect-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | SHOT-03 | T-06-04..06 | worker bytes 受限归一化、事务导入和 replay | integration | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-import.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | SHOT-03 | T-06-04..06 | 只从 active Waoo revisions 重建 native project | contract | `npx vitest run tests/contracts/remake-scenedetect-native-contract.test.ts tests/integration/api/remake-projects-workbench.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | SHOT-02 | T-06-07..09 | 固定 server-only executor、超时、大小和响应 schema | unit | `npx vitest run tests/unit/remake-projects/scenedetect-executor.test.ts tests/unit/remake-projects/scenedetect-task-contract.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | SHOT-02 | T-06-07..09 | 既有 text queue 分派、真实 stage-only 进度、current import | unit/guard | `npx vitest run tests/unit/remake-projects/scenedetect-executor.test.ts && npm run check:test-tasktype-coverage` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 4 | SHOT-04 | T-06-10..12 | 项目鉴权 analyze/native API，空项目不回落 sample | integration | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-runtime.test.ts` | ❌ W0 | ⬜ pending |
| 06-04-02 | 04 | 4 | SHOT-04 | T-06-10..12 | opaque mediaId、Range/HEAD、同源 canvas、跨项目拒绝 | integration/browser fixture | 同 06-04-01 | ❌ W0 | ⬜ pending |
| 06-04-03 | 04 | 4 | SHOT-04 | T-06-10..12 | Task projection 绑定 user/project 且错误脱敏 | integration | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-runtime.test.ts tests/integration/api/remake-projects-task-projection.test.ts` | ❌ W0 | ⬜ pending |
| 06-05-01 | 05 | 5 | SHOT-05 | T-06-13..15 | patch 可重放、防篡改；vendor lint 隔离不掩盖 host/runtime | guard/lint | `node scripts/vendor-scenedetect.mjs --sync && node scripts/vendor-scenedetect.mjs --check && npx vitest run tests/guards/remake-scenedetect-vendor-provenance.test.ts && npm run lint && npm run typecheck` | ❌ W0 | ⬜ pending |
| 06-05-02 | 05 | 5 | SHOT-05 | T-06-13..15 | empty/source embedded runtime 保留整 App 状态机 | contract/unit | `node scripts/vendor-scenedetect.mjs --check && npx vitest run tests/contracts/remake-scenedetect-native-contract.test.ts tests/unit/remake-projects/remake-workbench-contract.test.tsx tests/guards/remake-scenedetect-vendor-provenance.test.ts` | ❌ W0 | ⬜ pending |
| 06-06-01 | 06 | 6 | SHOT-05, SHOT-08 | T-06-16..18 | stable UUID、immutable revision、If-Match、invalidation | integration | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 06-06-02 | 06 | 6 | SHOT-05, SHOT-08 | T-06-16..18 | save ordering、canonical remap、409 recovery | contract/integration | `npx vitest run tests/contracts/remake-scenedetect-native-contract.test.ts tests/integration/api/remake-projects-scenedetect-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 06-07-01 | 07 | 7 | SHOT-06 | T-06-19..21 | frame tuple/current revision 绑定，stale callback 不覆盖 | integration/unit | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-keyframes.test.ts tests/unit/remake-projects/scenedetect-task-contract.test.ts` | ❌ W0 | ⬜ pending |
| 06-07-02 | 07 | 7 | SHOT-07 | T-06-19..21 | server review gate、逐项原因、客户端不自算 eligibility | unit/integration | `npx vitest run tests/unit/remake-projects/scenedetect-review-gate.test.ts tests/integration/api/remake-projects-scenedetect-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 06-08-01 | 08 | 8 | SHOT-04, SHOT-07 | T-06-22..24 | 同一 App 实例、portal containment、overlay drawer | unit | `npx vitest run tests/unit/remake-projects/remake-scenedetect-upload-host.test.tsx tests/unit/remake-projects/remake-scenedetect-runtime.test.tsx tests/unit/remake-projects/remake-workbench-contract.test.tsx` | ❌ W0 | ⬜ pending |
| 06-08-02 | 08 | 8 | SHOT-04 | T-06-22..24 | 禁止 deep import、复制编排和第二事实来源 | guard | `node scripts/vendor-scenedetect.mjs --check && npx vitest run tests/guards/remake-scenedetect-phase6-compatibility.test.ts tests/guards/remake-scenedetect-no-duplicate-source.test.ts tests/guards/remake-scenedetect-vendor-provenance.test.ts` | ❌ W0 | ⬜ pending |
| 06-08-03 | 08 | 8 | SHOT-01..08 | T-06-22..24 | 真实 workspace 闭环、三档视口、媒体/canvas、焦点和样式隔离 | e2e/visual | `npx playwright test tests/e2e/remake-scenedetect-review.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/fixtures/scenedetect/executor-fixture.ts` - 由 06-03-01 的 TDD setup 创建；模拟真实同步 `/api/health`、`/api/analyze`、`/api/keyframes` response，不提供虚假 SSE/百分比。
- [ ] `tests/fixtures/scenedetect/media-fixture.ts` - 由 06-04-02 的 TDD setup 创建；提供小型可 seek 视频和首/中/尾帧像素锚点，支持 Range、canvas 非空和跨项目拒绝断言。
- [ ] `tests/guards/remake-scenedetect-vendor-provenance.test.ts` - clean sync、registered patch replay、tamper 和 upstream drift 基线。
- [ ] `tests/integration/api/remake-projects-scenedetect-source.test.ts` - source 上传、probe、幂等、补偿和替换 tracer。
- [ ] 其余测试文件由对应 TDD task 先写失败断言再实现；不得以手工验收替代 SHOT-01..08 的自动化证据。

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 真实部署 executor readiness smoke | SHOT-02, SHOT-06 | 本机当前未安装 Python SceneDetect 且 `127.0.0.1:8000` 不可用；mock 只能验证合同 | 在有服务环境设置 server-only `SCENEDETECT_EXECUTOR_BASE_URL`/`SCENEDETECT_EXECUTOR_TOKEN`，对最小视频执行 analyze 与 keyframes，确认 health、超时、媒体导入和 provenance；交付前必须转为可重复 CI smoke 或留下环境证据。 |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s for focused suites
- [ ] Full suite and executor readiness evidence are green
- [ ] `nyquist_compliant: true` set by `$gsd-validate-phase`

**Approval:** pending
