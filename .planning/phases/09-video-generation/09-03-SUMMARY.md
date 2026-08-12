# Plan 09-03 Summary: 成片页 UI — 输入选择、能力控件、播放、历史、采用与复核

## Status: completed

## What was delivered

完成了翻拍成片页（RemakeVideoStage）的生产级单 Shot 视频生成与审核 UI，覆盖：手动参考图选择 + 固定顺序预览、模型与能力参数控件、原始/生成双播放器、版本历史、备注、显式采用与替换确认、失效标记与重新确认。所有交互遵循 D-01~D-19 决策，严格复用既有视频生成基础设施，不新建路由/配置/参数体系。

### Snapshot 层修复
- `src/lib/remake-projects/service.ts` `getRemakeProjectSnapshot`：在每个 Shot 的 current revision 上投影 `videoGeneration.track`，包含 track id、adoptedVersionId、hasInvalidated、batches（含 operationKey、versions[mediaUrl/status/invalidated/note]）。此前 adapter 中读取 `shot.videoGeneration` 但 snapshot 未提供，导致类型错误和 UI 拿不到视频数据。
- `src/lib/query/hooks/useRemakeProject.ts` `RemakeSnapshot` 类型：补充 `videoGeneration.track` 字段类型，与 adapter 中的 `RemakeShotView.videoGeneration` 对齐。

### 输入选择与固定顺序预览（D-01~D-06）
- 三帧槽位（Start / Middle / End）以缩略图按钮形式呈现，只有已采用的新关键帧可点击，未采用的灰显禁用（D-01/D-02）。
- 默认无选中项，不静默代选；动作表作为可选 checkbox（D-03）。
- "实际输入预览" 可展开/收起，按固定顺序 Start → Middle → End → 动作表 编号展示，使用与提交完全相同的 `buildOrderedVideoReferences` 函数，确保所见即所得（D-04/D-05）。
- readiness 检查：至少一张已采用关键帧 + Video Prompt 已批准 + 动作表选择合法 + 已选模型；不满足时按钮禁用并逐条列出原因（VGEN-07）。

### 能力驱动参数控件（D-07~D-11）
- 模型下拉：选项来自 `useUserModels().video`，默认选中项目 `videoModel` 配置。
- 能力字段（时长 / 分辨率 / 生成音频）：通过 `resolveEffectiveVideoCapabilityDefinitions` 从所选模型的 capabilities 推导，只展示模型真实支持的选项。
- 切换模型后调用 `normalizeVideoGenerationSelections` 重新归一化参数，不兼容的值被替换为新模型默认值（D-09）。
- 默认时长按 D-10/D-11 推导：原 Shot 时长向上取整 → 约束到 [最短, min(15, 模型最大)] → 离散档位时向上取最近合法值，由 `deriveDefaultVideoDuration` 计算。
- 本次修改只影响当前 Shot 的本次提交，不回写项目默认配置（D-07）。

### 播放与版本历史（D-13/D-16）
- 左右分栏：原始视频 + 生成版本，各自独立播放器，无同步联动或逐帧对比（D-16）。
- 版本历史横向滚动，最新在前；已采用版本标绿色"当前"角标，失效版本标琥珀色"复核"角标。
- 点击版本缩略图切换右侧生成播放器的播放源，不改变采用指针（纯浏览）。

### 备注、采用、重新确认（D-14/D-15/D-19）
- 备注：textarea + 保存按钮，调用 `POST /video/tracks/[trackId]` 的 `note` action。
- 采用：非当前采用版本显示"采用此版本"按钮；替换已有采用时后端返回 CONFIRM_REQUIRED，前端弹出确认对话框，用户确认后带 `confirmReplace: true` 重试。
- 重新确认：当前采用版本失效时显示"重新确认（继续采用）"按钮，调用 `reconfirm` action。
- 所有写操作完成后刷新 snapshot 获取权威状态。

### 测试
- `tests/unit/remake-projects/remake-video-stage.test.tsx`：17 个
  - 手动参考选择（3 个槽位渲染、默认无选中、动作表开关、输入预览存在）
  - 提交 readiness（按钮禁用、原因展示）
  - 能力控件（模型下拉、duration/resolution/generateAudio 字段）
  - 版本历史（最新在前排序、采用角标、双播放器）
  - 失效版本与重新确认（需复核 badge、重确认按钮）
  - 采用流程（采用按钮存在、替换确认逻辑在源码中）
  - 备注功能（textarea + 保存按钮、状态同步与 API 调用）
  - 固定顺序预览与请求一致性（源码契约）
- 所有既有视频相关测试（51 个）继续通过，全量类型检查干净。

## Key decisions
- 模型/能力控件直接在每个 Shot 卡片内，而非页面级别——因为每个 Shot 的默认时长不同（D-10），且 D-07 要求"每个 Shot 默认带出项目当前配置，用户每次生成前均可修改"。
- 使用原生 `<select>` 而非 `ModelCapabilityDropdown` 组件——因为翻拍场景不需要 i18n/分级定价/高级参考模式等复杂功能，保持简单可控，后续如有需要可升级。
- 刷新机制用 `useRefreshRemakeProject`（全局 query 失效）而非局部状态乐观更新——保证数据一致性，且视频生成是异步任务，刷新频率本来就低。
- 确认替换采用两步（先试一次 → 被拒 → 弹确认 → 再试带 flag）而非前端预判——后端是权威来源，避免前端和后端判断不一致。

## Known limitations / deferred
- 没有使用 ModelCapabilityDropdown 的完整能力（定价 tier 展示、provider 名称、搜索等），Phase 9 MVP 阶段用原生 select 足够。
- 原始视频播放器 src 为空（需要从 source media 推导播放地址，后续接入）。
- 没有完整的 frozen receipt 展开面板（D-06 的完整输入快照查看），只展示了版本列表和备注；详细 receipt（含完整 prompt、model、parameters、references）在 Wave 4 或后续迭代补充。
- 没有任务进度内联展示（task status 需要从 snapshot.tasks 关联到视频批次），当前依赖页面刷新。
- Wave 4 的跨层集成测试、E2E、UAT 文档待完成。
