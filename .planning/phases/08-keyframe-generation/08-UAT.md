---
status: complete
phase: 08-keyframe-generation
source: [08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md, 08-08-SUMMARY.md]
started: 2026-08-12T15:47:00+08:00
updated: 2026-08-12T16:00:00+08:00
---

## Current Test

number: [testing complete]
name: -
expected: -
awaiting: -

## Tests

### 1. 阶段自由导航与选中镜头保持
expected: 翻拍工作台顶部分页标签（Prompt 分析/分镜/成片）可自由切换；切换后保持当前选中的镜头。
result: pass

### 2. 镜头名称简洁显示
expected: prompt 分析、分镜、成片三个页面的镜头名称均显示简洁的「镜头01」格式，不显示超长 ID。
result: pass

### 3. 分镜 2×3 布局对齐
expected: 每个镜头的原始帧（上排）与新画面（下排）按 Start/Middle/End 三列严格对齐。
result: pass

### 4. 源帧查看切换
expected: 点击某列原始帧只切换「当前查看帧」，不会改变「用于生成」勾选状态。
result: pass

### 5. 用于生成勾选
expected: 勾选/取消「用于生成」复选框立即生效，且不切换当前查看帧。
result: pass

### 6. 新画面空卡状态
expected: 无已生成版本的槽位显示「待生成 + 生成图片」，即使未配置前端模型也可点击生成。
result: pass

### 7. 生成交互与校验
expected: 点击生成弹出张数选择/浮窗；未勾选「用于生成」时点击生成给出明确提示且不触发生成。
result: pass

### 8. 候选预览切换
expected: 生成后候选 radio 切换仅为非破坏性预览，不触发采用。
result: skipped
reason: 无法生成图片，因此无法测试

### 9. 采用确认与恢复
expected: 采用版本走明确确认弹窗；替换不覆盖历史；可恢复上一版本。
result: skipped
reason: 无法生成图片，无法走采用流程

### 10. 画面描述绑定当前帧 Prompt
expected: 「画面描述」显示当前选中帧（Start/Middle/End）的已采用图片 Prompt，可编辑并「保存即采用」。
result: pass

### 11. 场景/角色/物品资产选择器
expected: 场景可用下拉选择（跟随默认/本镜头指定）；角色与物品为 Chip 多选，使用稳定资产 ID。
result: issue
reported: "场景下拉选择正常，但选择并确认后没有保存，显示为未选择状态"
severity: major
fixed: "资产选择确认后立即持久化；hasChanges 纳入资产字段，保存按钮正确启用；并修复 updateRemakeShotSemantics 归属校验恒失败导致的 PATCH 报错"（见 .planning/debug/remake-keyframe-debug-fixes.md）

### 12. 成片页只读边界
expected: 成片页显示主画面参考与辅助动作参考；视频生成按钮禁用（Phase 9）。
result: issue
reported: "没有生成图片无法测试主画面；辅助动作参考图没有显示（应为三个关键帧的组合拼接图，纵向排列）"
severity: major
fixed: "action-sheet worker 现渲染并上传纵向三帧拼接图并写入 mediaId；媒体路由可解析 output mediaId；成片页以纵向模式显示"（见 .planning/debug/remake-keyframe-debug-fixes.md）

## Summary

total: 12
passed: 8
issues: 2
pending: 0
skipped: 2
blocked: 0

## Gaps

- truth: "场景资产选择并确认后应保存并显示选中状态（跟随默认/本镜头指定）"
  status: failed
  reason: "User reported: 场景下拉选择正常，但选择并确认后没有保存，显示为未选择状态"
  severity: major
  test: 11
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "成片页辅助动作参考应显示三个关键帧的组合拼接图（纵向排列）"
  status: failed
  reason: "User reported: 辅助动作参考图没有显示（应为三个关键帧的组合拼接图，纵向排列）"
  severity: major
  test: 12
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""


## Fix note (generation)
- 分镜页生成失败：开发 Redis(16379) 未运行导致任务无法入队；已启动 Redis 并重启 dev 栈。
- 二次生成同一槽位撞唯一约束：候选指纹纳入 operationKey 后修复。
- 详见 .planning/debug/remake-keyframe-debug-fixes.md
