---
phase: 08-keyframe-generation
plan: 07
subsystem: frontend
tags: [remake, keyframes, assets, scene, character, prop]
requires:
  - plan: 05
    provides: Semantics panel and asset ID fields
provides:
  - Scene selection via GlobalAssetPicker (location type) with default/shot-specific source indication
  - Character chip multi-select via GlobalAssetPicker (character type)
  - Prop chip multi-select via GlobalAssetPicker (prop type)
  - Non-blocking missing-asset hints
affects: []
actuals:
  tokens: ~45000
  tasks: 3
tech-stack:
  added: []
  patterns: [asset chip selector, global asset picker reuse, scene/character/prop trio]
key-files:
  created:
    - tests/unit/remake-projects/remake-asset-picker-integration.test.ts
  modified:
    - src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx
key-decisions:
  - "Reused existing GlobalAssetPicker for all three asset types — no new picker implementation."
  - "Scene uses a button + modal pattern (not a native select) to match the classic storyboard layout."
  - "Character and prop use chip + add-button pattern consistent with the classic layout."
  - "Missing assets are explicitly non-blocking: the UI says '可继续生成' so the user knows generation won't fail."
  - "Both asset IDs and display text are stored; IDs are the source of truth, text is a convenience label."
patterns-established:
  - "Scene / character / prop trio layout, matching the classic storyboard asset-binding pattern."
requirements-completed: [KFRM-02, KFRM-04]
coverage:
  - id: T1
    description: Scene asset selector with default/shot-specific source
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-asset-picker-integration.test.ts:scene
      status: pass
  - id: T2
    description: Character chip multi-select with add/remove
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-asset-picker-integration.test.ts:character
      status: pass
  - id: T3
    description: Prop chip multi-select with non-blocking hint
    verification:
      - kind: contract
      ref: tests/unit/remake-projects/remake-asset-picker-integration.test.ts:prop
      status: pass
duration: ~50min
status: complete
---

# Phase 8 Plan 07 Summary

**场景 / 角色 / 物品资产选择器，复用经典分镜页的 GlobalAssetPicker。**

## 交付内容

1. **场景选择器**（`SceneAssetSelector`）
   - 按钮样式，点击打开 GlobalAssetPicker（location 类型）
   - 显示当前生效来源："跟随默认场景"或"本镜头单独指定"
   - 支持清除，回到跟随默认

2. **角色选择器**（`CharacterChipSelector`）
   - Chip 多选，点击已选 chip 移除
   - "+ 添加角色" 按钮打开 GlobalAssetPicker（character 类型）
   - 提示"手动选择会覆盖系统预选"

3. **物品选择器**（`PropChipSelector`）
   - Chip 多选，点击已选 chip 移除
   - "+ 添加物品" 按钮打开 GlobalAssetPicker（prop 类型）
   - 提示"物品缺失时仍允许生成，由 Prompt 描述补足"

4. **全部复用 `GlobalAssetPicker` 组件**，不重复造轮子。

5. **资产 ID 作为真实数据**（`sceneAssetId`、`characterAssetIds`、`propAssetIds`），显示名称作为标签辅助。

## Task Commits

- T1: SceneAssetSelector + 场景区域
- T2: CharacterChipSelector + 角色区域
- T3: PropChipSelector + 物品区域

## Verification

- `npx tsc --noEmit` ✅
- `npx vitest run tests/unit/remake-projects/` — 29 files / 100 tests ✅
- 7 个新增契约测试全部通过
- `npm run check:locale-navigation` ✅
- `npm run check:no-multiple-sources-of-truth` ✅

## Known Gaps

- 资产选择后显示的名称目前是占位（"场景"、"角色 N"、"物品 N"），完整名称需要从 asset 查询接口获取后显示。
- 场景的"项目默认场景"值需要从项目配置读取，当前只显示文字提示，不影响功能。
- 完整 E2E / Playwright 场景尚未补充，留待 Phase 8 最终验证阶段。
