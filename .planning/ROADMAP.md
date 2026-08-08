# 路线图：waoowaoo AI 影视 Studio

## 里程碑

- ✅ **v1.0 原剧本生产流程改革** - Phase 1-03.4 已交付，Phase 4 已取消（2026-08-07，覆盖关闭）
- 🚧 **v1.1 AI 视频翻拍工作台整合** - Phase 5-11，待开始规划

## 已归档里程碑

<details>
<summary>✅ v1.0 原剧本生产流程改革 - 2026-08-07 关闭</summary>

- [x] Phase 1: Episode Mode Entry - 4 个计划，已实现
- [x] Phase 2: Multi-Shot Fast Path - 5 个计划，已验证/用户验收
- [x] Phase 02.1: Multi-Shot Asset Injection - 5 个计划，用户验收
- [x] Phase 3: Editable Production Handoff - 5 个计划，用户验收
- [x] Phase 03.1: Multi-Shot Cinematic Prompting - 3 个计划，已实现
- [x] Phase 03.2: Storyboard Package Import Contract - 3 个计划，已实现
- [x] Phase 03.3: Import API And Persistence - 3 个计划，已实现
- [x] Phase 03.4: Script Page Upload UI - 3 个计划，已实现
- [~] Phase 4: Hardening And Rollout - **已取消**，未执行

完整历史路线：`.planning/milestones/v1.0-ROADMAP.md`

关闭说明：实现计划已完成，但早期阶段缺少当前格式的正式 verification 文件；Phase 2 仍有 1 项人工 UAT 缺口。这些内容以 `override_closeout` 记录在 `.planning/STATE.md`，不作为 v1.1 的隐含范围。

</details>

## 当前里程碑：v1.1 AI 视频翻拍工作台整合

**里程碑目标：** 用户在同一项目内完成原视频导入、复用 SceneDetect 的 Shot/关键帧分析与审核、Prompt 与生成版本审核、批量执行和最终素材导出；所有项目状态由 waoowaoo 持久化，并可追踪、可回退、可恢复。

## 规划约定

- **每个 Phase 最多 4 个 wave（执行计划）**：Phase 7-11 规划必须遵守，除非用户明确批准例外（记录在 STATE.md）。
- 规划优先复用既有模式（Task 接入、版本存储、审核 UI、门禁、失败重试），禁止重复实现已存在能力。
- Wave 按"可独立验证的交付边界"拆分：简单需求合并，复杂需求才单独成 wave。

## 阶段

- [ ] **Phase 5: 翻拍项目与核心工作台** - 建立以 Project、Shot 和 Task 为共同状态中心的可恢复翻拍工作台。
- [ ] **Phase 6: SceneDetect 镜头与关键帧审核** - 将原视频分析结果接入同一审核界面，并允许人工修订和确认。
- [ ] **Phase 7: Prompt 分析与人工审核** - 为已确认 Shot 生成、修订、比较和批准结构化图片与 Video Prompt。
- [ ] **Phase 8: 新关键帧生成与版本选择** - 基于已批准的图片 Prompt 生成、比较和采用新的关键帧。
- [ ] **Phase 9: 新视频镜头生成与版本选择** - 使用采用的关键帧和已批准 Video Prompt 生成、审核和采用 Shot 视频。
- [ ] **Phase 10: 批量任务编排与恢复** - 提供受控批量执行、取消、重试、恢复和项目级任务进度。
- [ ] **Phase 11: 最终素材检查与导出** - 检查每个 Shot 的采用版本完整性，并导出供人工剪辑的素材和 manifest。

## 阶段详情

### Phase 5: 翻拍项目与核心工作台

**目标：** 建立支持“视频翻拍项目”类型的页面框架、公共 Project/Shot/Task/版本合同、SceneDetect 适配器边界，以及可整体承载 SceneDetect 应用的 stage host，为后续实际接入镜头分析和生成阶段提供稳定入口。
**依赖：** 无；复用 v1.0 已有项目、存储、生成和任务基础设施，并登记 SceneDetect 外部能力合同。
**Requirements**: RMP-01, RMP-02, RMP-03, RMP-04, RMP-05, RMP-06, TASK-01, TASK-02, TASK-03
**Success Criteria** (what must be TRUE):

  1. 用户可以创建“视频翻拍”项目，同时既有剧本/小说推广项目的行为保持不变。
  2. 用户可以进入翻拍工作台框架，查看原视频接入状态、当前阶段、完成度、失败项、待审核项和关联任务状态；未接入视频时不生成虚假 Shot。
  3. Waoo 定义稳定 Shot、revision、媒体引用、审核和 provenance 合同；外部 SceneDetect Shot 通过适配器映射，不把外部序号或前端数组下标当作主键。
  4. Phase 5 以源码 vendoring 建立 SceneDetect 完整应用的 canonical vendor 入口、来源清单、同步/hash 合同和编译期类型边界；StageHost 挂载的是完整 `SceneDetectApp`，不得拆出 Timeline、ShotInspector 等组件后在 Waoo 重写 `App.tsx` 编排。
  5. StageHost/runtime 合同由 SceneDetect 原生 `SceneDetectProject`、`Shot`、`VideoMetadata` 类型及最小 integration runtime 推导，而不是由 Waoo DTO 倒推；真实 runtime 注入和编辑闭环留给 Phase 6。
  6. Waoo 的 Task/GraphRun 成为唯一执行状态中心；SceneDetect 只作为可替换 executor/capability，不产生第二套队列、项目存储或任务中心。

**计划：** 6 个计划

- [x] `05-01-PLAN.md` — 建立翻拍项目类型、稳定领域模型和真实工作台入口，不创建伪造 Shot
- [x] `05-02-PLAN.md` — 定义 SceneDetect schema/API、稳定身份、媒体和幂等导入适配合同
- [x] `05-03-PLAN.md` — 将 SceneDetect executor/capability 接入既有 Task/GraphRun
- [x] `05-04-PLAN.md` — 建立 SceneDetect 完整应用 canonical vendor、原生 runtime/type 合同及正反复用门禁
- [x] `05-05-PLAN.md` — 在 canonical App 上建立 Waoo 工作台/StageHost，并完成查询与响应式嵌入验证
- [x] `05-06-PLAN.md` — 汇总旧模式兼容、正反复用门禁和 Phase 5 最终目标回归

**UI hint**: yes

### Phase 6: SceneDetect 镜头与关键帧审核

**目标：** 将 vendored SceneDetect 完整应用作为一个 stage 整体接入 waoowaoo，保留其布局、播放器、时间轴、Shot 管理、关键帧审核和 `App.tsx` 编辑状态机，只替换与 Waoo 集成所必需的数据与执行边界。
**依赖：** Phase 5 的翻拍工作台框架、canonical vendor 入口、原生类型驱动的 integration runtime、SceneDetect 适配器合同、稳定身份和媒体存储合同。
**Requirements**: SHOT-01, SHOT-02, SHOT-03, SHOT-04, SHOT-05, SHOT-06, SHOT-07, SHOT-08
**Success Criteria** (what must be TRUE):

  1. 用户可以在 waoowaoo 上传原视频，并通过既有 Task/SceneDetect executor 看到上传、探测、关键帧提取和失败恢复状态。
  2. SceneDetect 的分析结果通过版本化适配器导入 Waoo，持久化原视频引用、原始/当前边界、候选关键帧和外部分析 provenance。
  3. waoowaoo 通过 canonical vendor 入口整体挂载 `SceneDetectApp`，保留其 `App.tsx` 编排、布局、undo/redo、拆分/合并/删除和关键帧选择逻辑；Waoo 不抽取子组件重新搭建编辑器。
  4. integration runtime 将 IndexedDB/projectStore 替换为 Waoo API，将 Blob/runtime 媒体 URL 替换为 Waoo 对象存储签名引用，将直接分析调用替换为 Waoo Task/GraphRun；Task 进度适配为 SceneDetect 现有回调，不重写其分析弹窗状态机。
  5. 用户修改结果时只通过 Waoo API 写入稳定 Shot revision，并按现有失效合同标记下游需要复核；确认状态作为后续 Prompt 阶段的门禁。
  6. SceneDetect 阶段保留自身深色视觉并做样式作用域隔离；Waoo 浅色 glass 只用于项目栏、阶段导航、概览和 Task 抽屉，不重排 SceneDetect 主体。
  7. 只允许 embedded root 高度/overflow、modal portal containment、项目入口隐藏和 Phase 11 前导出入口禁用等必要 integration patch；现有 SceneDetect 项目 JSON 可迁移，但 IndexedDB、runtime 文件和独立 JSON API 不成为 Waoo 最终事实来源。

**Plans**: 1/8 plans executed

- [x] 06-01-PLAN.md
- [ ] 06-02-PLAN.md
- [ ] 06-03-PLAN.md
- [ ] 06-04-PLAN.md
- [ ] 06-05-PLAN.md
- [ ] 06-06-PLAN.md
- [ ] 06-07-PLAN.md
- [ ] 06-08-PLAN.md

**UI hint**: yes

### Phase 7: Prompt 分析与人工审核

**Goal**: 用户可以为已确认 Shot 创建、修订、比较和批准可追溯的结构化图片 Prompt 与 Video Prompt。
**Depends on**: Phase 6
**Requirements**: IPRM-01, IPRM-02, IPRM-03, IPRM-04, IPRM-05, IPRM-06, IPRM-07, VPRM-01, VPRM-02, VPRM-03, VPRM-04, VPRM-05, VPRM-06, VPRM-07
**Success Criteria** (what must be TRUE):

  1. 用户可以对已确认 Shot 的 Start、Middle、End 原始关键帧发起图片 Prompt 分析，得到覆盖主体、构图、机位、光线、材质和画面质感等字段的结构化结果。
  2. 用户可以并排查看原始关键帧和图片 Prompt，编辑任意字段、比较历史版本并选择当前采用版本；每个结果都记录兼容 Executor 的 Skill 与 Schema 版本。
  3. 用户可以根据原始 Shot、时间信息和已确认关键帧生成 Video Prompt，并审阅其中的动作、调度、机位、镜头运动、节奏和环境变化。
  4. 用户可以播放原始 Shot、编辑与比较 Video Prompt 版本并明确批准或人工修订；未批准 Prompt 不会成为默认批量生成输入，整段分析失败可重试且显示可理解错误。

**Plans**: 4 plans

Plans:
- [ ] `07-01-PLAN.md` — 建立 append-only Prompt schema、版本/审核/采用/失效合同与整段 Video 原子持久化
- [ ] `07-02-PLAN.md` — 接入统一 Task、Codex CLI Worker、认证触发路由与 Redis 图片三并发门禁
- [ ] `07-03-PLAN.md` — 扩展 snapshot/API/query，并将外部 Prompt 前端合入现有 RemakeWorkbench
- [ ] `07-04-PLAN.md` — 完成 unit/API/Worker/Playwright/真实 Codex 验证与阻塞式真实用户流验收
**UI hint**: yes

## v1.1 集成边界

### SceneDetect 复用原则

1. **后端优先复用：** 复用 SceneDetect 的 `pySceneDetect` 分析、帧边界换算、首/中/尾关键帧提取和按修订边界重新提取能力；Waoo 只负责任务编排、鉴权、媒体存储、结果导入和状态持久化。
2. **前端整应用复用：** 复用单元是 SceneDetect 的完整应用及其 `App.tsx` 编排，不是播放器、Timeline、ShotInspector、KeyframeSelector 等零散组件。Waoo 不重写编辑状态机、undo/redo、分析流程或页面布局。
3. **适配器负责口径转换：** SceneDetect schema/API 的 `shotNumber`、帧范围、媒体 URL、关键帧和审核字段必须先转换为 Waoo 的稳定 Shot UUID、revision、Asset/Output 引用、Review 状态和 provenance。
4. **单一事实来源：** SceneDetect 可以作为分析执行器和可复用 UI 能力提供者，但 Waoo 数据库、对象存储和既有 Task/GraphRun 是项目状态、版本和任务状态的唯一事实来源。
5. **源码 vendoring：** SceneDetect 前端通过 canonical vendor root 引入；`VENDOR.json` 记录源仓库/路径、commit 或版本、文件 hash、同步命令和允许的 integration patches。当前不选 iframe，也不在本里程碑开始前抽 npm 包。
6. **原生类型驱动：** StageHost 和 `SceneDetectIntegrationRuntime` 从 SceneDetect 原生 `SceneDetectProject`、`Shot`、`VideoMetadata` 与回调合同推导；Waoo snapshot 先经 adapter 转换，不把 normalized Waoo Shot DTO 直接当编辑器 props。
7. **视觉与嵌入边界：** SceneDetect stage 保留自身深色主题并做样式作用域隔离；glass 只约束 Waoo 外壳。允许最小 embedded integration patch，但不得改造原页面布局或重复学习成本高的交互。
8. **禁止重复实现：** Phase 5/6 不新增第二套镜头检测算法、时间轴状态、Shot 项目文件、关键帧提取服务、编辑器编排、队列或 Task Center；如接口不兼容，只新增边界 adapter/runtime 和兼容测试。

### Phase 5/6 交付顺序

`Phase 5 项目框架与适配器合同` → `Phase 6 SceneDetect 实际接入与审核闭环` → `Phase 7 Prompt 分析` → `Phase 8/9 生成`。

Phase 5 的 tracer 可以使用固定的 SceneDetect adapter fixture 验证稳定 Shot 映射，并通过 compile-only/disabled harness 验证 vendored 完整 App、原生类型和 StageHost 合同，但不能创建没有原视频来源的伪造业务 Shot，也不开放真实编辑阶段。Phase 6 才负责注入真实 Waoo runtime，完成上传、分析、导入和编辑回写。

### Phase 8: 新关键帧生成与版本选择

**Goal**: 用户可以使用已批准的图片 Prompt，经现有图片模型网关生成、比较和采用可追溯的新关键帧版本。
**Depends on**: Phase 7
**Requirements**: KFRM-01, KFRM-02, KFRM-03, KFRM-04, KFRM-05, KFRM-06, KFRM-07
**Success Criteria** (what must be TRUE):

  1. 用户可以为 Start、Middle、End 关键帧选择模型、尺寸、质量、参考资产和允许参数，并通过现有图片模型网关发起生成。
  2. 用户可以对比原始关键帧和多个生成版本，为每个位置选择一个当前采用版本；每次生成都保留 Prompt 版本、参数、任务和输出资产关系。
  3. 用户修改 Prompt 或重新生成后，旧 Prompt、图片和采用记录不会被覆盖；仅需 Start/End 或模型不支持 Middle Frame 时，界面会显示真实输入合同。
  4. 未有已批准图片 Prompt 的关键帧不会进入默认批量生成，并会作为项目缺失项呈现给用户。

**Plans**: TBD
**UI hint**: yes

### Phase 9: 新视频镜头生成与版本选择

**Goal**: 用户可以使用采用的关键帧和已批准 Video Prompt，经现有视频模型网关生成、审核和采用新的 Shot 视频版本。
**Depends on**: Phase 7, Phase 8
**Requirements**: VGEN-01, VGEN-02, VGEN-03, VGEN-04, VGEN-05, VGEN-06, VGEN-07
**Success Criteria** (what must be TRUE):

  1. 用户可以选择视频模型、时长、分辨率、音频开关和受支持参数，并以 Shot 时长、采用关键帧和批准 Video Prompt 生成新视频镜头。
  2. 用户可以看到所选模型实际使用的首帧、尾帧、多帧或其他参考模式，而不是被虚构的输入合同误导。
  3. 用户可以播放原始 Shot 与多个生成视频版本、添加审核备注并选择一个当前采用版本；每个版本保留关键帧、Prompt、参数、任务和输出资产关系。
  4. 用户修改 Prompt、关键帧或参数后可以重新生成且保留历史；缺少采用关键帧、批准 Video Prompt 或合法参数时，系统会阻止默认批量生成并说明原因。

**Plans**: TBD
**UI hint**: yes

### Phase 10: 批量任务编排与恢复

**Goal**: 用户可以在不中断审核工作的前提下，可靠地批量运行、停止、重试和恢复翻拍生产任务。
**Depends on**: Phase 5, Phase 6, Phase 7, Phase 8, Phase 9
**Requirements**: TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09, TASK-10
**Success Criteria** (what must be TRUE):

  1. 用户可以选择多个 Shot 批量执行当前阶段，或只执行未处理、待复核或失败项，并能取消未完成任务、重试单项或全部失败项。
  2. 用户重复点击批量操作或刷新页面时，不会产生无法识别的重复任务，也不会因重试重复生成已经成功的结果。
  3. Worker 中断或服务重启后，用户可以看到任务已恢复、可重试或明确失败，而不会永久停留在虚假的运行中状态。
  4. 用户可以在统一 Task Center 查看项目级运行进度并继续审核其他 Shot；错误信息与运行日志不泄露敏感配置且指出可操作的失败原因。

**Plans**: TBD
**UI hint**: yes

### Phase 11: 最终素材检查与导出

**Goal**: 用户可以确认 Shot 素材完整、定位需修复项，并导出按镜头顺序组织的可人工剪辑交付物。
**Depends on**: Phase 9, Phase 10
**Requirements**: MAT-01, MAT-02, MAT-03, MAT-04, MAT-05
**Success Criteria** (what must be TRUE):

  1. 用户可以在最终素材视图逐 Shot 检查边界、关键帧、两类 Prompt、新关键帧、新视频和审核状态是否完整。
  2. 用户可以筛选缺失、失败、待审核或没有采用视频版本的 Shot，并直接跳转到对应修复位置；导出前会看到完整性检查，并确保每个准备导出的 Shot 恰有一个采用视频版本。
  3. 用户可以导出按 Shot 顺序命名的视频素材，以及包含时间码、时长、采用版本、Prompt 和生成参数的 manifest；系统不会自动拼接视频、添加音频或发布。

**Plans**: TBD
**UI hint**: yes

## 需求覆盖

v1.1 的 57 条需求均已映射，且每条需求仅归属一个阶段：Phase 5（9）、Phase 6（8）、Phase 7（14）、Phase 8（7）、Phase 9（7）、Phase 10（7）、Phase 11（5）。

## 进度

| 阶段 | 里程碑 | 计划完成 | 状态 | 完成日期 |
|------|--------|----------|------|----------|
| 1-03.4 | v1.0 | 31/31 | 已交付 | 2026-08-07 |
| 4 | v1.0 | 0/0 | 已取消 | 2026-08-07 |
| 5. 翻拍项目与核心工作台 | v1.1 | 0/TBD | 未开始 | - |
| 6. SceneDetect 镜头与关键帧审核 | v1.1 | 0/TBD | 未开始 | - |
| 7. Prompt 分析与人工审核 | v1.1 | 0/TBD | 未开始 | - |
| 8. 新关键帧生成与版本选择 | v1.1 | 0/TBD | 未开始 | - |
| 9. 新视频镜头生成与版本选择 | v1.1 | 0/TBD | 未开始 | - |
| 10. 批量任务编排与恢复 | v1.1 | 0/TBD | 未开始 | - |
| 11. 最终素材检查与导出 | v1.1 | 0/TBD | 未开始 | - |

---
*Last updated: 2026-08-07 for milestone v1.1 AI 视频翻拍工作台整合*
