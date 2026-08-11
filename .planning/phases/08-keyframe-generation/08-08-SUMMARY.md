---
phase: 08-keyframe-generation
plan: 08
subsystem: full-stack
tags: [remake, keyframes, prompt, classic-card, e2e]
requires:
  - plan: 07
    provides: Semantics panel structure and asset picker foundation
provides:
  - 画面描述 field bound to the selected Start/Middle/End image Prompt with save-and-adopt revisions
  - Classic storyboard new-frame card interactions (empty card 待生成/生成图片, hover floating bar, candidate radios, 查看数据)
  - Server-side model resolution (explicit model > project storyboardModel)
  - Phase 8 real-route E2E acceptance green (10/10 desktop + mobile)
affects:
  - src/lib/remake-projects/service.ts (deterministic keyframe track order)
  - src/vendor/scenedetect/components/Timeline.tsx (missing-duration guard)
  - src/components/Navbar.tsx (narrow-viewport logo shrink guard)
actuals:
  tokens: ~60000
  tasks: 2
tech-stack:
  added: []
  patterns: [save-and-adopt atomic prompt revision, classic hover action bar, optimistic selection state]
key-files:
  created:
    - tests/unit/remake-projects/remake-prompt-edit-and-adopt.test.ts
    - tests/unit/remake-projects/remake-keyframe-model-resolution.test.ts
    - tests/unit/remake-projects/remake-keyframe-classic-card.test.ts
    - tests/unit/remake-projects/remake-shot-semantics-prompt.test.ts
  modified:
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx
    - src/lib/remake-projects/prompt/service.ts
    - src/lib/remake-projects/keyframes/service.ts
    - src/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route.ts
    - src/app/api/remake-projects/[projectId]/keyframes/route.ts
    - src/app/api/remake-projects/[projectId]/keyframes/tracks/[trackId]/route.ts
    - src/lib/query/mutations/remake-keyframe-mutations.ts
    - src/lib/remake-projects/service.ts
    - tests/e2e/fixtures/remake-keyframe-project.ts
    - tests/e2e/remake-keyframes.spec.ts
key-decisions:
  - "「画面描述」显示当前选中帧的图片 Prompt，保存即创建不可变 revision 并自动批准采用（原子化）；原 semantics.description 保留为「镜头语义描述」。"
  - "进入分镜的 eligibility 只看 review 审核门（关键帧完整 + revision 有效），单槽位 Prompt 是否批准只禁用该槽位的「用于生成」，不再阻塞进入分镜。"
  - "新画面卡恢复经典交互：空卡直接提供生成按钮；每卡为 group，桌面悬浮显示浮窗（候选数量/生成/查看数据），移动端浮窗改为文档流内常驻，避免遮挡候选操作。"
  - "生成请求的 model 改为可选：显式 model > 项目 storyboardModel，未配置时返回 REMAKE_KEYFRAME_MODEL_NOT_CONFIGURED 可读错误，按钮不再因前端模型为空而隐藏。"
  - "「用于生成」复选框使用乐观本地状态：点击立即翻转，服务器回包后用权威值校准，避免异步受控状态导致交互误判。"
  - "GET keyframes/tracks/[trackId] 返回 getKeyframeTrackDetail（含 track.adoptedCandidateId），替换原 getKeyframeTrackHistory 形状。"
  - "快照接口 keyframeGeneration.tracks 按 start/middle/end 确定性排序。"
patterns-established:
  - "Classic storyboard empty-card state + hover action bar reuse (待生成/生成图片/重新生成 N 张/查看数据)."
  - "Candidate radios are non-mutating preview; adoption stays an explicit confirm flow."
requirements-completed: [KFRM-02, KFRM-04, KFRM-07]
coverage:
  - id: T1
    description: Prompt edit-and-adopt creates a new approved revision atomically
    verification:
      - kind: unit
      ref: tests/unit/remake-projects/remake-prompt-edit-and-adopt.test.ts
      status: pass
  - id: T2
    description: Keyframe generation model resolution falls back to project storyboardModel
    verification:
      - kind: unit
      ref: tests/unit/remake-projects/remake-keyframe-model-resolution.test.ts
      status: pass
  - id: T3
    description: Classic new-frame card interactions present without a manual model input
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-keyframe-classic-card.test.ts
      status: pass
  - id: T4
    description: Real-route acceptance covers handoff, selection persistence, comparison, and responsive bounds
    verification:
      - kind: e2e
      ref: scripts/verify-remake-keyframes-ui.mjs
      status: pass
duration: ~4h
status: complete
---

# Phase 8 Plan 08 Summary

**画面描述 Prompt 编辑 + 经典生成卡片交互，并修复 Phase 8 E2E 验收的全部阻塞。**

## 交付内容

1. **画面描述 = 当前帧图片 Prompt（可编辑、保存即采用）**
   - `ShotSemanticsPanel` 的「画面描述」绑定当前选中 Start/Middle/End 帧的采用版 Prompt。
   - 新增 `saveAndAdoptPromptHumanEdit` 原子操作（service + API `human_edit_and_adopt`）：创建新 revision 后同一事务内批准并采用；失败不改变旧版本。
   - 原 `semantics.description` 改名为「镜头语义描述」，人工语义数据不丢失。

2. **经典新画面卡片交互**
   - 空卡显示「待生成 + 生成图片」，不因前端模型为空而隐藏。
   - 每张卡为 `group`，桌面悬浮显示底部浮窗：张数选择 / 生成或重新生成 / 查看数据；移动端浮窗在文档流内常驻。
   - 候选 radio（`role="radio"`）切换预览，非破坏性，不触发采用；采用仍走明确确认弹窗。
   - 未勾选「用于生成」时点击生成给出明确提示，不触发生成。
   - 生成中展示任务状态并禁用重复提交。
   - 移除页面底部手工模型输入框；model 可选，服务端从项目 `storyboardModel` 解析，未配置时返回可读错误。

3. **E2E 验收修复（此前 8/10 失败 → 现在 10/10 通过）**
   - Prompt 交接 eligibility 改为审核门口径（`可生成 1 / 1`）。
   - E2E fixture 的 prompt `inputSnapshot` 补齐 schema 必填字段，选择/生成服务校验不再失败。
   - 测试用 `page.request`（带浏览器 session）替代无鉴权 `request`。
   - `GET keyframes/tracks/[trackId]` 返回 `track.adoptedCandidateId` 详情形状。
   - 快照接口 tracks 确定性排序（start/middle/end）。
   - Timeline 对缺失 `metadata.duration` 防御，修复运行时 TypeError。
   - 导航栏 logo 在窄屏 `shrink-0`，修复 0×0 不可见焦点。
   - 导航栏窄屏 `overflow-x-auto`，修复 390px 横向溢出。
   - 修复 E2E 中 `/modes/remake` 旧路由 URL（改为工作台真实路由）。

## Task Commits

- T1: Prompt「编辑并采用」后端 + ShotSemanticsPanel 画面描述绑定
- T2: 经典新画面卡片交互 + model 可选解析 + E2E 验收修复

## Verification

- `npm run typecheck` ✅
- `npm run test:unit:all` — 283 files / 1067 tests ✅
- `npm run test:guards` ✅（顺带修复 2 个历史违反：prompt-analyze 契约测试改为行为级、route-catalog 补齐 3 条 Phase 8 路由）
- `node scripts/verify-remake-keyframes-ui.mjs` — 10/10（desktop + mobile）✅

## Known Gaps

- 人工验收（桌面/移动端视觉与交互走查）仍待用户执行；自动化 E2E 已覆盖核心路径。
- `check:config-center-guards` 中 `video.worker.ts` 的 4 个既有 `modelId` 降级违规为 Phase 8 之外的历史问题，未在本 wave 处理。
