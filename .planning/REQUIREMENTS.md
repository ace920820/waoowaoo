# Requirements: v1.1 AI 视频翻拍工作台整合

**Defined:** 2026-08-07
**Milestone:** v1.1
**Core Value:** 用户只做高价值审核与修订，系统自动完成从原始视频到可剪辑 Shot 视频素材之间的重复生产工作。

## Milestone Requirements

### 翻拍项目与核心状态

- [ ] **RMP-01**: 用户可以创建“视频翻拍”项目，并且该模式不会改变现有剧本/小说推广项目的行为
- [ ] **RMP-02**: 用户可以在翻拍项目框架中查看原始视频接入状态、Shot 总数、当前阶段、完成度、失败项和待审核项；未接入分析结果时显示明确的空载状态，不伪造镜头数据
- [ ] **RMP-03**: 每个 Shot 使用稳定标识关联原始时间范围、原始片段、关键帧、Prompt、生成结果和审核状态
- [ ] **RMP-04**: 用户刷新页面、关闭浏览器或服务重启后，可以从数据库中的真实状态继续项目
- [ ] **RMP-05**: 用户可以返回任一已完成阶段修改单个 Shot；下游状态必须明确标记为需要复核，而不是静默沿用过期结果
- [ ] **RMP-06**: 系统保存每次 AI 执行所使用的输入资产、参数、Executor、模型/Skill 标识和输出版本，便于追溯

### 原视频、镜头与关键帧审核

- [ ] **SHOT-01**: 用户可以上传受支持格式的原始影视/动画视频，并看到上传、探测和分析状态
- [ ] **SHOT-02**: 用户可以从 waoowaoo 通过 SceneDetect 适配器发起镜头切分，不需要切换到独立工具手工搬运结果；不得在 waoowaoo 重写 SceneDetect 检测算法
- [ ] **SHOT-03**: 系统可以通过版本化适配器接收并持久化 SceneDetect 输出的 Shot 序号、起止时间、时长、原始片段和候选关键帧，并映射为 Waoo 稳定 Shot 身份
- [ ] **SHOT-04**: 用户可以在 waoowaoo 的翻拍工作台复用或适配 SceneDetect 现有的原视频播放器、时间轴和 Shot 列表交互检查切分结果
- [ ] **SHOT-05**: 用户可以在同一审核界面复用 SceneDetect 已有的边界调整、删除、拆分/合并相邻 Shot 功能，并把变更写回 Waoo revision/invalidation 合同
- [ ] **SHOT-06**: 用户可以复用 SceneDetect 的关键帧选择和重新提取能力，为每个 Shot 从原始视频中选择或重新提取 Start / Middle / End 关键帧
- [ ] **SHOT-07**: 用户可以逐 Shot 或批量确认边界与关键帧；未确认 Shot 不得进入默认批量 Prompt 分析
- [ ] **SHOT-08**: 用户修改已确认的边界或关键帧后，系统保留旧版本并明确标记受影响的下游 Prompt/生成素材

### 图片 Prompt 分析与审核

- [ ] **IPRM-01**: 用户可以对已确认 Shot 的 Start / Middle / End 原始关键帧发起结构化图片 Prompt 分析
- [ ] **IPRM-02**: 图片 Prompt 结果必须结构化表达主体、外观、动作、空间关系、构图、机位、镜头/景深、场景、光线、颜色、材质、氛围和画面质感
- [ ] **IPRM-03**: 系统使用 `image-to-structured-prompt` 能力或兼容的版本化 Executor，并把 Skill/Schema 版本记录在结果中
- [ ] **IPRM-04**: 用户可以并排查看原始关键帧和结构化 Prompt，编辑任意字段并保存为新版本
- [ ] **IPRM-05**: 用户可以重新分析、比较历史版本并为每个关键帧选择一个当前采用的 Prompt 版本
- [ ] **IPRM-06**: 用户必须明确批准或人工修订图片 Prompt；系统不得自动把未审核结果作为批量图片生成的默认输入
- [ ] **IPRM-07**: 分析失败或结构化结果不合法时，用户可以查看可理解的错误并仅重试失败项

### Video Prompt 分析与审核

- [ ] **VPRM-01**: 用户可以基于原始 Shot 片段、起止时间、时长和已确认关键帧生成镜头级 Video Prompt
- [ ] **VPRM-02**: Video Prompt 必须覆盖主体动作、人物互动、动作方向、场面调度、景别、机位、镜头运动、节奏、场景/环境变化和时间推进
- [ ] **VPRM-03**: Video Prompt 结果必须引用实际分析输入，并记录模型、Schema 和执行版本，避免结果与错误 Shot 混淆
- [ ] **VPRM-04**: 用户可以同时播放原始 Shot、查看关键帧和编辑 Video Prompt，并把人工修改保存为新版本
- [ ] **VPRM-05**: 用户可以重新分析、比较历史版本并为每个 Shot 选择一个当前采用的 Video Prompt
- [ ] **VPRM-06**: 用户必须明确批准或人工修订 Video Prompt；未批准结果不得进入默认批量视频生成
- [ ] **VPRM-07**: Video Prompt 分析失败时，用户可以查看错误、保留成功结果并仅重试失败 Shot

### 新关键帧生成与版本选择

- [ ] **KFRM-01**: 用户可以使用当前采用的图片 Prompt，通过 waoowaoo 现有图片模型网关生成新的 Start / Middle / End 关键帧
- [ ] **KFRM-02**: 用户可以为单次生成选择模型、尺寸、质量、参考资产和项目允许的生成参数
- [ ] **KFRM-03**: 每次生成追加不可变的关键帧版本，并记录 Prompt 版本、参数、任务和输出资产关系
- [ ] **KFRM-04**: 用户可以对比原始关键帧和多个生成版本，并为每个关键帧位置选择一个当前采用版本
- [ ] **KFRM-05**: 用户可以修改 Prompt 后重新生成，而不会覆盖旧 Prompt、旧图片或已经采用的版本
- [ ] **KFRM-06**: 当某个 Shot 只需要 Start/End 或模型不支持 Middle Frame 时，界面必须明确显示实际输入合同，不伪造缺失帧
- [ ] **KFRM-07**: 没有已批准 Prompt 的关键帧不能进入默认批量图片生成，并在项目缺失项中可见

### 新视频镜头生成与版本选择

- [ ] **VGEN-01**: 用户可以使用 Shot 时长、当前采用的关键帧和当前采用的 Video Prompt，通过现有视频模型网关生成新视频镜头
- [ ] **VGEN-02**: 系统根据所选视频模型能力传入合法的首帧、尾帧、多帧参考或其他参考模式，并向用户显示实际使用的输入
- [ ] **VGEN-03**: 用户可以选择视频模型、时长、分辨率、音频开关和该模型支持的生成参数
- [ ] **VGEN-04**: 每次视频生成追加不可变版本，并记录关键帧版本、Video Prompt 版本、参数、任务和输出资产关系
- [ ] **VGEN-05**: 用户可以播放原始 Shot 与多个生成视频版本，添加审核备注，并选择一个当前采用版本
- [ ] **VGEN-06**: 用户可以修改 Prompt、关键帧或参数后重新生成，旧版本和采用记录仍可追溯
- [ ] **VGEN-07**: 缺少已采用关键帧、已批准 Video Prompt 或合法模型参数时，系统阻止该 Shot 进入默认批量生成并说明原因

### 统一任务、批量执行与恢复

- [ ] **TASK-01**: Shot 切分、关键帧提取、图片 Prompt、Video Prompt、图片生成和视频生成都使用统一 Task 状态模型
- [ ] **TASK-02**: Task 通过 `task_type + executor + capability` 路由到 SceneDetect 适配器、Codex/LLM、图片 Worker 或视频 Worker，业务页面不直接控制 CLI/进程；SceneDetect 复用既有执行能力，不新增第二套队列
- [ ] **TASK-03**: 用户可以查看排队、运行、成功、失败、取消和重试中的任务，并定位到对应 Project / Shot / 资产版本
- [ ] **TASK-04**: 用户可以取消尚未完成的任务、重试单项、重试全部失败项，成功结果不因批量重试而重复生成
- [ ] **TASK-05**: 用户可以选择多个 Shot 批量执行当前阶段，也可以只执行未处理项、待复核项或失败项
- [ ] **TASK-06**: 批量任务使用受控并发、幂等键和现有队列；重复点击或页面刷新不会创建不可识别的重复任务
- [ ] **TASK-07**: Worker 中断或服务重启后，任务可以恢复、重试或明确失败，不允许永久停留在虚假 Running 状态
- [ ] **TASK-08**: Codex/LLM 执行上下文来自数据库中的项目与 Shot 状态；Session 可复用但不能成为唯一状态存储
- [ ] **TASK-09**: Task 错误和运行日志必须过滤敏感配置，并向用户提供可操作的失败原因
- [ ] **TASK-10**: 统一 Task Center 显示项目级运行进度，用户可以在任务后台运行时继续审核其他 Shot

### 最终素材检查与导出

- [ ] **MAT-01**: 用户可以在最终素材视图按 Shot 查看边界/关键帧、图片 Prompt、新关键帧、Video Prompt、新视频和审核状态是否完整
- [ ] **MAT-02**: 用户可以筛选缺失项、失败项、待审核项和没有采用视频版本的 Shot，并直接跳转修复
- [ ] **MAT-03**: 每个准备导出的 Shot 必须有且仅有一个当前采用的视频版本，导出前系统给出完整性检查结果
- [ ] **MAT-04**: 用户可以导出按 Shot 顺序命名的视频素材，以及包含时间码、时长、采用版本、Prompt 和生成参数的 manifest
- [ ] **MAT-05**: 导出不会自动拼接视频、添加 BGM/音效或发布；这些步骤继续由用户在外部剪辑软件中完成

## Future Requirements

### 自动质量循环

- **AUTO-01**: 自动比较原始关键帧与生成关键帧，评分主体、动作、构图和风格一致性
- **AUTO-02**: 自动分析生成视频的角色一致性、动作、镜头运动和连续性
- **AUTO-03**: 根据质量分析自动优化 Prompt 并在预算范围内重试

### 高级执行与协作

- **EXEC-01**: 根据上下文、成本和错误率动态轮换/复用 Codex Session Pool
- **EXEC-02**: 为不同项目提供可配置的 Worker Pool、优先级和资源配额
- **COLL-01**: 多用户审核指派、评论、审批流和变更通知

### 剪辑辅助

- **EDIT-01**: 在不取代人工剪辑的前提下生成 EDL/XML/剪辑建议
- **EDIT-02**: 自动节奏、配乐和音效建议

## Out of Scope

| 功能 | 原因 |
|------|------|
| 自动拼接、配乐、音效、成片导出与发布 | 最终剪辑明确由人工在外部软件完成 |
| 无人工审核的一键翻拍 | 核心风险集中在动作方向、人物关系和版本选择，必须由人确认 |
| 自动质量评分和自动 Prompt 修复循环 | 先验证基础闭环和数据合同，避免过早扩大系统复杂度 |
| 重写 SceneDetect 镜头识别、时间轴编辑、Shot 管理或关键帧提取 | 现有前后端能力可复用，本轮只实现稳定集成、Waoo 状态映射和审核体验 |
| 重写图片/视频生成 Worker 与模型网关 | waoowaoo 已具备成熟生成基础，只补充翻拍输入和版本关系 |
| 通用 Agent Framework 或让 Codex Session 保存项目真相 | Project / Shot / Task 状态必须属于数据库和对象存储 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RMP-01 | Phase 5 | Pending |
| RMP-02 | Phase 5 | Pending |
| RMP-03 | Phase 5 | Pending |
| RMP-04 | Phase 5 | Pending |
| RMP-05 | Phase 5 | Pending |
| RMP-06 | Phase 5 | Pending |
| TASK-01 | Phase 5 | Pending |
| TASK-02 | Phase 5 | Pending |
| TASK-03 | Phase 5 | Pending |
| SHOT-01 | Phase 6 | Pending |
| SHOT-02 | Phase 6 | Pending |
| SHOT-03 | Phase 6 | Pending |
| SHOT-04 | Phase 6 | Pending |
| SHOT-05 | Phase 6 | Pending |
| SHOT-06 | Phase 6 | Pending |
| SHOT-07 | Phase 6 | Pending |
| SHOT-08 | Phase 6 | Pending |
| IPRM-01 | Phase 7 | Pending |
| IPRM-02 | Phase 7 | Pending |
| IPRM-03 | Phase 7 | Pending |
| IPRM-04 | Phase 7 | Pending |
| IPRM-05 | Phase 7 | Pending |
| IPRM-06 | Phase 7 | Pending |
| IPRM-07 | Phase 7 | Pending |
| VPRM-01 | Phase 7 | Pending |
| VPRM-02 | Phase 7 | Pending |
| VPRM-03 | Phase 7 | Pending |
| VPRM-04 | Phase 7 | Pending |
| VPRM-05 | Phase 7 | Pending |
| VPRM-06 | Phase 7 | Pending |
| VPRM-07 | Phase 7 | Pending |
| KFRM-01 | Phase 8 | Pending |
| KFRM-02 | Phase 8 | Pending |
| KFRM-03 | Phase 8 | Pending |
| KFRM-04 | Phase 8 | Pending |
| KFRM-05 | Phase 8 | Pending |
| KFRM-06 | Phase 8 | Pending |
| KFRM-07 | Phase 8 | Pending |
| VGEN-01 | Phase 9 | Pending |
| VGEN-02 | Phase 9 | Pending |
| VGEN-03 | Phase 9 | Pending |
| VGEN-04 | Phase 9 | Pending |
| VGEN-05 | Phase 9 | Pending |
| VGEN-06 | Phase 9 | Pending |
| VGEN-07 | Phase 9 | Pending |
| TASK-04 | Phase 10 | Pending |
| TASK-05 | Phase 10 | Pending |
| TASK-06 | Phase 10 | Pending |
| TASK-07 | Phase 10 | Pending |
| TASK-08 | Phase 10 | Pending |
| TASK-09 | Phase 10 | Pending |
| TASK-10 | Phase 10 | Pending |
| MAT-01 | Phase 11 | Pending |
| MAT-02 | Phase 11 | Pending |
| MAT-03 | Phase 11 | Pending |
| MAT-04 | Phase 11 | Pending |
| MAT-05 | Phase 11 | Pending |

**Coverage:** 57/57 个 v1.1 需求已映射到一个且仅一个 Roadmap 阶段。

---
*Last updated: 2026-08-07 after mapping all v1.1 requirements to the roadmap*
