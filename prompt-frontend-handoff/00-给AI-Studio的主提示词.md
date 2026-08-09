# 给 AI Studio 的主提示词（复制粘贴用）

> 使用方法：把下面「开始复制」到「结束复制」之间的内容整段粘贴到 AI Studio 对话框。
> 如果你的 AI Studio 支持上传文件/图片，把本文件夹里的文件传给它；如果不支持，把每个文件内容直接粘贴到提示词后面（提示词里已标注哪些文件最关键）。

---

开始复制 ↓

## 任务

你是 waoowaoo 项目的前端工程师。请为我实现「视频翻拍工作台」中的 **Prompt 分析阶段（PromptStage）** 前端页面。这个项目是 Next.js 15 App Router + React 19 + TypeScript + Tailwind CSS v4 + next-intl 的 Web 应用，后端能力已全部就绪，你只负责前端 UI。

## 背景

项目是一个 AI 影视创作平台（waoowaoo，中文名「AI动漫制作工作台」）。目前翻拍工作台有两个阶段：`overview`（项目概览）和 `scenedetect`（视频分析/镜头审核）。本次要新增第三个阶段 `prompt`（Prompt 分析），让用户对已确认的镜头生成、审核、编辑、批准图片 Prompt 和 Video Prompt。

## 必须遵守的规则（按优先级）

1. **在现有工作台内扩展，不新建页面**：读 `02-现有工作台骨架.tsx`（RemakeWorkbench.tsx 完整源码）。它的 `STAGES` 数组是 `['overview', 'scenedetect']`，你要把它扩展为 `['overview', 'scenedetect', 'prompt']`，并新增 `<PromptStage>` 组件挂载到 `remake-stage-main` 区域，与 `SceneDetectStageHost` 并列。
2. **风格必须与现有 UI 一致**：读 `05-设计系统与视觉风格.md`（颜色/圆角/阴影/字体 token）和 `07-可复用UI组件清单.md`（现有 Glass 组件）。**优先 import 现有组件**（如 `@/components/ui/primitives` 里的 GlassButton/GlassSurface/GlassModalShell 等），不要自己造一套 UI。整体是浅色背景 + 玻璃态卡片 + 黑白灰为主的极简风格。
3. **数据全部走现成 hooks**：读 `04-前端数据hooks-合同.md`。用 `useRemakeProject(projectId)` 拿 snapshot（里面已有 prompt 相关的 tracks/任务投影），用 `useAnalyzeRemakePrompt` / `useSaveRemakePromptVersion` / `useApproveAndAdoptRemakePrompt` 三个 mutation 完成操作。**不要自己写 fetch**。
4. **文案必须用 next-intl**：读 `06-现有文案样例.json`（zh）和 `messages/en/remake-workbench.json`（en）。所有可见文字用 `t('...')` 引用，key 已全部定义好（如 `imagePrompt`、`videoPrompt`、`analyzeVideo`、`queued`、`running`、`failed`、`pendingReview`、`approved`、`versionHistory`、`saveAsNewVersion`、`approveAndAdopt`、`fullAnalysis`、`retry`、`latest`、`adopted`、`viewing`、`stages.prompt` 等）。如缺 key 可补充，但要中英文都补。
5. **后端 API 已就绪**：读 `03-后端API-合同.md`。图片分析是「逐张关键帧手动触发」（每次一个 POST），Video 分析是「整段触发」（一个 POST）。不要实现批量分析。
6. **交互规则（产品决策，不可改）**：
   - 图片 Prompt：Start/Middle/End 三张关键帧各自独立，用户逐张点击分析；同一时间最多 3 个任务在跑，其余排队，状态必须如实展示（排队中/分析中/失败）。
   - 新分析结果默认「待审核」，不会自动替换已批准版本；用户编辑保存为新版本，然后「批准并采用」才生效。
   - 每个 Prompt 有版本历史，支持查看、比较两个版本、选择采用。
   - 刷新页面后状态必须从服务端恢复（因为数据来自数据库）。
7. **响应式**：桌面 + 移动布局都要可用（参考 `08-截图/` 中现有页面的响应式行为）。

## 交付物

1. 新增 `PromptStage` 组件（建议放 `src/app/[locale]/workspace/[projectId]/modes/remake/prompt/` 目录，参考现有 `scenedetect/` 目录结构）
2. 修改 `RemakeWorkbench.tsx`：STAGES 加 `prompt`、挂载 `<PromptStage>`
3. 必要的 CSS（参考现有 `scenedetect-stage.css` 的命名方式）
4. 中英文案补充（如需要）

完成后请给出：改动了哪些文件、如何启动验证、还有什么需要我确认的。

结束复制 ↑

---

## 如果你的 AI Studio 不支持上传文件

把上面提示词粘贴后，按下面的清单把文件内容**追加粘贴**到对话里（最关键的三个：02 骨架、03 API、04 hooks）：
- `02-现有工作台骨架.tsx`（完整代码，必传）
- `03-后端API-合同.md`（必传）
- `04-前端数据hooks-合同.md`（必传）
- `05-设计系统与视觉风格.md`（必传，风格就靠它）
- `01-前端需求文档.md`（目标规格）
- `07-可复用UI组件清单.md`（组件复用）
- `06-现有文案样例.json`（文案 key）
- `08-截图/*.png`（如果有截图，作为图片上传最有效）
