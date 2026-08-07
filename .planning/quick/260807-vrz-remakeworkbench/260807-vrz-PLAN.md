---
quick_id: 260807-vrz
slug: remakeworkbench
description: 补齐翻拍工作台实际入口
---

<objective>
让用户可以从项目管理页创建视频翻拍项目，并在项目详情页看到已实现的翻拍工作台外壳。
</objective>

<tasks>
<task type="verify">
  <name>验证翻拍项目入口</name>
  <files>src/app/[locale]/workspace/page.tsx, src/app/[locale]/workspace/[projectId]/page.tsx, src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx, tests/unit/remake-projects/remake-workbench-entry.test.ts</files>
  <action>保留工作区既有的创建类型选择和工作台挂载改动；增加入口回归测试，验证项目管理页会发送 remake 类型并将用户带入真实的 RemakeWorkbench。</action>
  <verify>BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/remake-projects/remake-workbench-entry.test.ts</verify>
  <done>翻拍入口不再渲染旧占位，且回归测试锁定项目管理页和项目详情页之间的连接。</done>
</task>
</tasks>
