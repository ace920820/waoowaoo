# Requirements: waoowaoo AI 影视 Studio

**Defined:** 2026-04-19
**Core Value:** 用户在完成剧本后，必须能用更短路径、更少无效编辑成本进入可生产的视频生成阶段

## v1 Requirements

### Workflow Modes

- [ ] **MODE-01**: 用户可以按“集”在剧本页查看并修改当前生产模式
- [ ] **MODE-02**: 新创建或首次进入配置的集默认使用“多镜头片段模式”
- [ ] **MODE-03**: 用户可以切换该集为“传统模式”，继续沿用现有标准链路
- [ ] **MODE-04**: 用户必须在点击“确认并开始绘制”前完成该集模式配置

### Traditional Flow

- [ ] **TRAD-01**: 传统模式下，系统继续执行“故事 → 剧本 → 分镜剧本 → 单镜头分镜 → 视频生成”的现有逻辑
- [ ] **TRAD-02**: 传统模式用户仍可使用现有与传统分镜剧本相关的页面能力与操作入口

### Multi-Shot Flow

- [ ] **MSHT-01**: 多镜头片段模式下，片段剧本生成后系统默认不再预生成冗长的传统分镜剧本
- [ ] **MSHT-02**: 系统以 15 秒多镜头片段作为一次视频生成的最小单位，为每个片段直接生成可用于视频生成的情节提示词
- [ ] **MSHT-03**: 系统生成的每个 15 秒片段提示词需要基于该集剧本页中已确认的剧情内容、场景信息与片段划分结果
- [ ] **MSHT-04**: 每个 15 秒片段最多支持容纳 9 个分镜镜头，并在生成内容中体现镜头推进、景别变化、角色动作与情绪节奏
- [ ] **MSHT-05**: 系统为每个 15 秒片段生成的情节提示词应接近可直接投喂模型的详细镜头描述，而不是传统冗长分镜剧本
- [ ] **MSHT-06**: 系统可以为每个 15 秒片段生成少量与剧情匹配的台词内容，并将台词按动作节奏写入对应片段提示词中
- [ ] **MSHT-07**: 多镜头片段中的台词内容应来源于剧本，但用户在后续视频生成阶段仍可编辑或覆盖这些台词
- [ ] **MSHT-08**: 多镜头片段模式用户可以在更短路径下直接进入绘制或生产阶段，而无需先完成传统分镜剧本编辑

### Single-Shot Flexibility

- [ ] **SHOT-01**: 多镜头片段模式下，系统默认不预先为该集生成单镜头分镜
- [ ] **SHOT-02**: 多镜头片段模式下，用户仍可以为该集手动添加单镜头分镜作为补充

### Script Page UX

- [ ] **UI-01**: 剧本页可以清晰展示当前集的生产模式与对应的下一步动作
- [ ] **UI-02**: 多镜头片段模式下，剧本页应隐藏、降级或绕开不再必要的传统分镜剧本字段、按钮或步骤
- [ ] **UI-03**: 当用户切换模式时，界面反馈必须让用户理解该集将进入哪条生产路径
- [ ] **UI-04**: “确认并开始绘制”按钮触发的后续流程必须与该集当前模式一致

## v2 Requirements

### Multi-Shot Asset Injection

- **AST-01**: 多镜头分镜表生成时可以引入人物素材作为参考输入
- **AST-02**: 多镜头分镜表生成时可以引入物品素材作为参考输入
- **AST-03**: 多镜头分镜表生成时可以引入场景素材作为参考输入
- **AST-04**: 资产缺失时系统可以给出合理提示并定义继续生成策略

### Advanced Reference Mode

- **REF-01**: 多镜头片段生成支持通过 `@` 语法引用更多资产
- **REF-02**: 多镜头片段生成支持最多 3 段视频作为参考输入
- **REF-03**: 多镜头片段生成支持最多 9 张图片作为参考输入
- **REF-04**: 多镜头片段生成支持最多 3 段 mp3 音频作为参考输入
- **REF-05**: 用户可以利用音频 / 视频 / 图片参考实现更细粒度的人物、风格与表现控制

## Out of Scope

| Feature | Reason |
|---------|--------|
| 在本阶段把资产系统接入多镜头分镜表生成 | 属于 P2，明确延后到下一阶段 |
| 在本阶段扩展全能参考模式输入面板与 `@` 资产高阶能力 | 属于 P3 bonus，不是当前主流程阻塞项 |
| 完全删除传统模式 | 仍需兼容依赖逐镜头精细控制的用户 |
| 完全禁用单镜头分镜 | 产品目标是改变默认路径，不是取消补充能力 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODE-01 | Phase 1 | Pending |
| MODE-02 | Phase 1 | Pending |
| MODE-03 | Phase 2 | Pending |
| MODE-04 | Phase 1 | Pending |
| TRAD-01 | Phase 2 | Pending |
| TRAD-02 | Phase 2 | Pending |
| MSHT-01 | Phase 2 | Pending |
| MSHT-02 | Phase 2 | Pending |
| MSHT-03 | Phase 2 | Pending |
| MSHT-04 | Phase 2 | Pending |
| MSHT-05 | Phase 2 | Pending |
| MSHT-06 | Phase 2 | Pending |
| MSHT-07 | Phase 3 | Pending |
| MSHT-08 | Phase 3 | Pending |
| SHOT-01 | Phase 2 | Pending |
| SHOT-02 | Phase 3 | Pending |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 1 | Pending |
| UI-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 after initialization*
