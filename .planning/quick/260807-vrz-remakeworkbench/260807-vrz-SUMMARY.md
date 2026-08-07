---
status: complete
quick_id: 260807-vrz
---

# 翻拍工作台入口修复

## Result

- 项目管理页提供“动漫制作 / 视频翻拍”项目类型选择；创建翻拍项目后直接进入其工作台。
- 翻拍项目详情页挂载 `RemakeWorkbench`，不再停留在旧的三行占位内容。
- 新增入口回归测试，锁定创建页类型选择、直接导航和详情页实际挂载。

## Validation

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-workbench-entry.test.ts tests/unit/remake-projects/remake-workbench-contract.test.ts tests/integration/api/remake-project-core.test.ts` - 7 passed
- Targeted ESLint - passed
- `npm run typecheck` - passed
- `curl -I http://127.0.0.1:3100/zh/workspace` - 200 OK

## Ownership Note

The UI implementation was already present as uncommitted workspace changes when this quick task began. It was preserved and validated without staging or committing it. This quick task adds the regression coverage and execution record only.
