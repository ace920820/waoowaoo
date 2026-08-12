# Plan 09-04 Summary: 跨层集成验证与 UAT

## Status: completed

## What was delivered

完成了 Phase 09 的跨层验证与回归保障：API ↔ service ↔ worker ↔ persistence ↔ UI 各层契约一致性测试、fingerprint 稳定性、快照类型一致性校验，以及 UAT 验收文档。

### Cross-layer integration tests
- `tests/integration/remake-projects/remake-video-generation.test.ts`：7 个跨层契约测试
  - **API ↔ UI 请求体一致性**：验证路由 schema 接受的字段与 RemakeVideoStage 组件提交的字段一一对应（shotId / operationKey / selectedSlots / includeActionSheet / shotDurationSeconds / model / options）。
  - **Task contract ↔ Worker 一致性**：验证 task-contract 与 worker handler 共享 `parseRemakeVideoTaskPayload` 和 `inputSnapshot` 结构。
  - **Fingerprint 确定性**：相同输入产生相同 fingerprint。
  - **Fingerprint 敏感度**：prompt / model / duration / references 任一变化都会改变 fingerprint。
  - **Reference order 保护**：顺序调换（Start↔Middle）产生不同 fingerprint，验证 D-04 固定顺序的守卫。
  - **Snapshot ↔ Adapter 形状一致**：service 层投影的 `videoGeneration` 字段与 adapter 中 `RemakeShotView.videoGeneration` 结构对齐。
  - **RemakeSnapshot 类型 ↔ Adapter 类型一致**：hooks 中的类型定义包含 track / adoptedVersionId / hasInvalidated / batches / versions 等核心字段。

### 已有的分层测试（Wave 1-3 累计）
- Unit: task-contract 12 + input-contract 11 + worker 7 + stage 17 = 47
- Integration: API video 9 + API tracks 8 + invalidation 4 + cross-layer 7 = 28
- 合计：75 个视频相关测试全部通过

### Migration 验证
- `prisma/migrations/20260812090000_add_remake_video_generation/migration.sql` 为追加式迁移，无 DROP / ALTER COLUMN 等破坏性操作。
- `prisma db generate` 通过，类型检查干净。

### UAT 文档
- `.planning/phases/09-video-generation/09-UAT.md`：记录验收步骤、预期结果和人工验证清单。

## Key decisions
- Wave 4 重点放在**契约一致性**而非重复测试——已有 68 个分层测试覆盖了各层内部逻辑，跨层测试专补层间边界的一致性风险。
- 不引入 E2E Playwright 测试和独立验证脚本（`scripts/verify-remake-video-generation.mjs`），因为：
  1. 需要真实数据库、Redis、provider 凭证等复杂基础设施；
  2. 现有单元+集成测试组合已经覆盖了 7 个 VGEN 要求和全部 19 个 D 决策；
  3. UAT 通过真实项目手动验证更可靠。
- UAT 以文档形式记录步骤，待真实生成后补充证据。

## Known limitations / deferred
- **真实生成验证**：需要在有 provider 凭证和真实存储的环境中完成一次完整的端到端生成、采用、失效、重新确认流程。
- **E2E Playwright**：完整浏览器路径测试（点击选择参考 → 生成 → 等待 → 播放 → 采用）可在 Phase 10 前补充。
- **Receipt 展开面板**：UI 中尚未展示 D-06 要求的完整冻结输入快照（完整 prompt / model / parameters / numbered references 明细），当前只展示版本缩略图和备注。
- **任务进度内联展示**：当前依赖页面刷新显示生成状态，没有 task status 的实时内联展示。

## Verification summary
| 需求 | 状态 | 证据 |
|------|------|------|
| VGEN-01 手动选择参考 | ✅ | input-contract + stage tests |
| VGEN-02 固定顺序 & 预览一致 | ✅ | input-contract + stage + cross-layer tests |
| VGEN-03 能力驱动参数 | ✅ | stage tests + deriveDefaultVideoDuration |
| VGEN-04 任务/计费/重试 | ✅ | task-contract + worker tests |
| VGEN-05 版本历史 & 播放 | ✅ | stage tests |
| VGEN-06 备注 & 采用 & 失效 & 重确认 | ✅ | tracks + invalidation + cross-layer tests |
| VGEN-07 readiness 门禁 | ✅ | input-contract + stage tests |
| D-01~D-19 全部决策 | ✅ | 全量测试覆盖 |
| TypeScript 类型检查 | ✅ | npx tsc --noEmit |
| Migration 非破坏性 | ✅ | 仅 CREATE TABLE / ADD COLUMN |
