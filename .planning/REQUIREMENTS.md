# Requirements: waoowaoo AI 影视 Studio

**Defined:** 2026-04-19
**Last updated:** 2026-04-26
**Core Value:** 用户在完成剧本后，必须能用更短路径、更少无效编辑成本进入可生产的视频生成阶段

## Current Completion Snapshot

截至 2026-04-26，本轮“从剧本进入生产”的主流程已经从最初 P1 范围推进到多镜头生产质量增强：

- **Phase 1 — Episode Mode Entry:** 已实现。剧本页具备按集配置生产模式的入口，多镜头片段模式作为默认快路径。
- **Phase 2 — Multi-Shot Fast Path:** 已验证。多镜头模式可以绕开传统冗长分镜剧本，按 15 秒多镜头片段生成生产单元；传统模式继续可用。
- **Phase 02.1 — Multi-Shot Asset Injection:** 用户已验收。多镜头确认页支持场景、角色、物品、分镜氛围预设和自定义氛围绑定，并保留非阻塞缺失策略。
- **Phase 3 — Editable Production Handoff:** 用户已验收。多镜头确认页与成片页之间的提示词、台词、覆盖编辑、单镜头补充和刷新保护已收口。
- **Phase 03.1 — Multi-Shot Cinematic Prompting:** 已实现。LLM 拆解与下游生成提示词已从单一 `narrativePrompt` 升级为参考图、分镜表、视频、镜头级 cinematic plan 的专业化输出，并接入 `data/镜头语言.md` 的镜头语言方法论。
- **Phase 4 — Hardening And Rollout:** 尚未执行。应在导演分镜包导入需求完成或明确延期后，再进行最终整体回归与交付硬化。

## v1 Requirements — Original Workflow Reform

### Workflow Modes

- [x] **MODE-01**: 用户可以按“集”在剧本页查看并修改当前生产模式
- [x] **MODE-02**: 新创建或首次进入配置的集默认使用“多镜头片段模式”
- [x] **MODE-03**: 用户可以切换该集为“传统模式”，继续沿用现有标准链路
- [x] **MODE-04**: 用户必须在点击“确认并开始绘制”前完成该集模式配置

### Traditional Flow

- [x] **TRAD-01**: 传统模式下，系统继续执行“故事 → 剧本 → 分镜剧本 → 单镜头分镜 → 视频生成”的现有逻辑
- [x] **TRAD-02**: 传统模式用户仍可使用现有与传统分镜剧本相关的页面能力与操作入口

### Multi-Shot Flow

- [x] **MSHT-01**: 多镜头片段模式下，片段剧本生成后系统默认不再预生成冗长的传统分镜剧本
- [x] **MSHT-02**: 系统以 15 秒多镜头片段作为一次视频生成的最小单位，为每个片段直接生成可用于视频生成的情节提示词
- [x] **MSHT-03**: 系统生成的每个 15 秒片段提示词需要基于该集剧本页中已确认的剧情内容、场景信息与片段划分结果
- [x] **MSHT-04**: 每个 15 秒片段最多支持容纳 9 个分镜镜头，并在生成内容中体现镜头推进、景别变化、角色动作与情绪节奏
- [x] **MSHT-05**: 系统为每个 15 秒片段生成的情节提示词应接近可直接投喂模型的详细镜头描述，而不是传统冗长分镜剧本
- [x] **MSHT-06**: 系统可以为每个 15 秒片段生成少量与剧情匹配的台词内容，并将台词按动作节奏写入对应片段提示词中
- [x] **MSHT-07**: 多镜头片段中的台词内容应来源于剧本，但用户在后续视频生成阶段仍可编辑或覆盖这些台词
- [x] **MSHT-08**: 多镜头片段模式用户可以在更短路径下直接进入绘制或生产阶段，而无需先完成传统分镜剧本编辑

### Single-Shot Flexibility

- [x] **SHOT-01**: 多镜头片段模式下，系统默认不预先为该集生成单镜头分镜
- [x] **SHOT-02**: 多镜头片段模式下，用户仍可以为该集手动添加单镜头分镜作为补充

### Script Page UX

- [x] **UI-01**: 剧本页可以清晰展示当前集的生产模式与对应的下一步动作
- [x] **UI-02**: 多镜头片段模式下，剧本页应隐藏、降级或绕开不再必要的传统分镜剧本字段、按钮或步骤
- [x] **UI-03**: 当用户切换模式时，界面反馈必须让用户理解该集将进入哪条生产路径
- [x] **UI-04**: “确认并开始绘制”按钮触发的后续流程必须与该集当前模式一致

## Completed Inserted Requirements

### Multi-Shot Asset Injection — Phase 02.1

- [x] **AST-01**: 多镜头分镜表生成时可以引入人物素材作为参考输入
- [x] **AST-02**: 多镜头分镜表生成时可以引入物品素材作为参考输入
- [x] **AST-03**: 多镜头分镜表生成时可以引入场景素材作为参考输入
- [x] **AST-04**: 资产缺失时系统可以给出合理提示并定义继续生成策略
- [x] **AST-05**: 用户手动选择的场景 / 角色 / 物品资产优先级高于系统预选与剧本回退
- [x] **AST-06**: 多镜头确认页保存后，资产绑定、分镜氛围预设和自定义氛围应持久化到 shot-group draft metadata

### Editable Production Handoff — Phase 3

- [x] **HAND-01**: 多镜头成片页提供独立的“视频提示词”编辑入口
- [x] **HAND-02**: 多镜头成片页提供独立的“台词 / 说话内容”编辑入口
- [x] **HAND-03**: 台词覆盖值持久化为 draft metadata，清空时可回退到生成草稿台词
- [x] **HAND-04**: 多镜头确认页允许用户继续手动添加单镜头分镜作为补充
- [x] **HAND-05**: 无关 refetch、重新准备 drafts 或服务端刷新不得覆盖未保存本地编辑
- [x] **HAND-06**: 已保存的 override、asset binding、mood metadata 必须在 draft rebuild 后保留

### Multi-Shot Cinematic Prompting — Phase 03.1

- [x] **CINE-01**: 多镜头 LLM 拆解输出应区分 `referencePrompt`、`storyboardPrompt`、`videoPrompt`，而不是始终复用同一段剧情提示词
- [x] **CINE-02**: 多镜头 LLM 拆解输出应包含 `emotionalIntent`、`visualStrategy` 和 shot-level `shots[]`
- [x] **CINE-03**: shot-level cinematic plan 应覆盖景别、角度、运镜、构图、打光、场面调度、动作、台词和情绪作用
- [x] **CINE-04**: 参考图提示词必须保持“单张辅助参考图 / 母图”导向，禁止要求九宫格、拼贴、字幕或 UI 元素
- [x] **CINE-05**: 分镜表提示词必须明确使用 ordered slots / shot-level commands 生成分镜参考表
- [x] **CINE-06**: 视频提示词必须将 ordered slots 视为一个最长约 15 秒的连续多镜头节拍序列
- [x] **CINE-07**: `data/镜头语言.md` 中的景别心理、角度心理、运镜、构图、打光、180° 规则、典型场景套路和提示词禁忌应被蒸馏进上游拆解与下游生成提示词
- [x] **CINE-08**: 旧 LLM 输出只包含 `narrativePrompt`、`embeddedDialogue`、`shotRhythmGuidance`、`expectedShotCount` 时仍应兼容

## New Requirements — Director Storyboard Package Import

该需求来自外部导演 agent 团队的生产流程：导演团队会根据一集剧本产出更高质量的分镜设计文档，包含分镜剧本、分镜表、图片生成提示词、视频提示词与生产资产建议。Waoo 需要支持导入这种特定格式的分镜配置文件，并自动预填多镜头确认子页面与成片子页面的重要配置。

### Package Contract — Proposed Phase 03.2

- [ ] **SBPI-01**: 系统定义 `waoo.storyboard_package` v1.0 schema，作为导演分镜包的机器可读导入合同
- [ ] **SBPI-02**: 导入格式必须支持 `.json` 文件，以及 Markdown 中的 fenced block：<code>```waoo-storyboard-package+json</code>
- [ ] **SBPI-03**: schema 顶层必须包含 `schema`、`schemaVersion`、`packageId`、`title`、`language`、`global`、`assets`、`scenes[]`
- [ ] **SBPI-04**: 每个 scene 必须包含 `sceneId`、`title`、`targetDurationSec`、`directorIntent`、`segments[]`
- [ ] **SBPI-05**: 每个 segment 必须包含 `segmentId`、`order`、`timecode`、`targetDurationSec`、`title`、`sceneLabel`、`dramaticFunction`、`reviewConfig`、`videoConfig`、`cinematicPlan`
- [ ] **SBPI-06**: `reviewConfig` 必须能表达多镜头确认子页面字段：`templateKey`、`referencePromptText`、`storyboardMode`、`compositePromptText`、资产引用、分镜氛围预设和自定义氛围
- [ ] **SBPI-07**: `videoConfig` 必须能表达成片子页面字段：`videoPrompt`、`dialogueText`、`dialogueLanguage`、`includeDialogue`、`generateAudio`、`referenceMode`、`videoModel`、`generationOptions`
- [ ] **SBPI-08**: `cinematicPlan.shots[]` 必须能承载导演分镜表中的 shot id、时长、dramatic beat、information unit、purpose、blocking、shot/lens/DOF、camera movement、composition、lighting、edit、imagePrompt
- [ ] **SBPI-09**: validator 必须校验 `templateKey` 只能为 `grid-4` / `grid-6` / `grid-9`，并校验 `shots.length` 与模板槽位数兼容
- [ ] **SBPI-10**: validator 必须校验单个 segment 目标时长默认不超过 15 秒；如未来允许例外，必须显式标记
- [ ] **SBPI-11**: parser 不应自由猜测普通 Markdown 表格；没有 fenced JSON block 的 Markdown 应返回明确错误，提示使用 Waoo 导入模板导出
- [ ] **SBPI-12**: mapper 应把导演语义字段映射到 Waoo 内部 multi-shot draft / shot-group persistence payload，而不是要求导演团队直接理解数据库字段

### Import API And Persistence — Proposed Phase 03.3

- [ ] **SBPI-13**: 新增导入 API，支持 `preview` 和 `commit` 两种模式
- [ ] **SBPI-14**: preview 模式必须返回待创建 / 待覆盖的 shot groups、segment 列表、镜头数量、资产匹配结果、schema validation warnings 和覆盖策略
- [ ] **SBPI-15**: commit 模式必须创建或更新多镜头 shot groups，并写入 `title`、`templateKey`、`groupPrompt`、`videoPrompt`、音频 / 对白 / 参考模式 / 视频生成参数
- [ ] **SBPI-16**: commit 模式必须写入 draft metadata：`referencePromptText`、`compositePromptText`、`storyboardModeId`、`storyboardModeLabel`、`storyboardModePromptText`、`selectedLocationAsset`、`selectedCharacterAssets`、`selectedPropAssets`、`storyboardMoodPresetId`、`customMood`、`dialogueOverrideText`、`cinematicPlan`
- [ ] **SBPI-17**: commit 模式必须写入 shot-group items 的 `title` 和 `prompt`，使每格分镜可直接使用导演团队的 shot-level image prompt
- [ ] **SBPI-18**: 资产匹配应优先按 package asset `externalId` / `matchName` 匹配项目内已有场景、角色、物品；匹配不到时应作为 `scriptDerived` fallback 或 preview warning，不应静默创建资产
- [ ] **SBPI-19**: 覆盖策略必须显式：默认可创建新 imported shot groups；覆盖已有 imported shot groups 时必须基于 `packageId + segmentId` 或用户确认
- [ ] **SBPI-20**: 导入行为不得覆盖用户已手动编辑但未确认覆盖的现有多镜头片段
- [ ] **SBPI-21**: API integration tests 必须覆盖 preview、commit、asset match、missing asset fallback、items prompt persistence、draft metadata persistence 和重复导入覆盖策略

### Script Page Upload UI — Proposed Phase 03.4

- [ ] **SBPI-22**: 剧本页多镜头片段模式下，在“确认并开始绘制”旁边增加“上传分镜表”按钮
- [ ] **SBPI-23**: 上传入口必须支持选择 `.md` / `.json` 文件，并在前端或 API 层解析 `waoo.storyboard_package` v1.0
- [ ] **SBPI-24**: 上传后必须展示导入预览：将导入的 scene / segment、每段时长、镜头数量、模板、参考图提示词摘要、视频提示词摘要
- [ ] **SBPI-25**: 上传预览必须展示资产匹配结果：场景、角色、物品分别是已匹配、剧本回退还是需要用户手动绑定
- [ ] **SBPI-26**: 上传预览必须展示覆盖策略：创建新分镜组、覆盖已导入分镜组、保留已有生成媒体或重置生成媒体
- [ ] **SBPI-27**: 用户确认导入后，系统应自动进入多镜头确认子页面，并预填辅助参考图提示词、分镜表模板、分镜模式、剧情内容、场景、角色、物品和氛围
- [ ] **SBPI-28**: 用户进入成片子页面后，视频提示词、台词 / 说话内容、台词语言、音频开关、参考模式和视频参数应使用导入配置预填
- [ ] **SBPI-29**: 导入后的字段仍必须可编辑，并沿用 Phase 3 的未保存编辑保护与已保存 metadata preservation 规则
- [ ] **SBPI-30**: UI tests 必须覆盖上传按钮展示、preview rendering、asset warning、commit 成功后导航，以及用户取消导入不改变现有数据

## Waoo Storyboard Package v1.0 Design Notes

### Recommended Delivery Shape

导演团队可以继续交付人类可读 Markdown，但文档末尾必须额外包含机器可读 fenced block：

````md
```waoo-storyboard-package+json
{
  "schema": "waoo.storyboard_package",
  "schemaVersion": "1.0",
  "packageId": "A13_EMPTY_ROOM_V1_3",
  "title": "空房间 45 秒完整场景多片段生产包",
  "language": "zh",
  "global": {
    "targetDurationSec": 45,
    "segmentDurationSec": 15,
    "defaultTemplateKey": "grid-6",
    "visualBible": {
      "style": "restrained realistic film stills, low saturation, 35mm film look",
      "negativePrompt": "crying woman, tears, melodramatic acting, inconsistent face, inconsistent outfit"
    }
  },
  "assets": {
    "locations": [{ "externalId": "LOC_OLD_APARTMENT", "name": "旧公寓", "matchName": "旧公寓" }],
    "characters": [{ "externalId": "CHAR_LI_WEI", "name": "李未", "matchName": "李未" }],
    "props": [{ "externalId": "PROP_KEY", "name": "旧钥匙和门锁", "matchName": "钥匙" }]
  },
  "scenes": [
    {
      "sceneId": "A_S01",
      "title": "空房间",
      "targetDurationSec": 45,
      "directorIntent": "让观众跟随她逐步确认缺席。",
      "segments": [
        {
          "segmentId": "A13_SEG_001",
          "order": 1,
          "timecode": "00:00-00:15",
          "targetDurationSec": 15,
          "title": "归来与第一处缺席",
          "sceneLabel": "旧公寓门口 / 玄关",
          "dramaticFunction": "钥匙卡住、屋里无灯、玄关少一双鞋。",
          "reviewConfig": {
            "templateKey": "grid-6",
            "referencePromptText": "Cinematic concept mother image for a 15-second segment, not a collage...",
            "storyboardMode": {
              "id": "director-keyframe-sheet",
              "label": "导演关键帧分镜表",
              "promptText": "Create a 2x3 keyframe storyboard sheet..."
            },
            "compositePromptText": "Create a 2x3 keyframe storyboard sheet, 6 panels...",
            "assets": {
              "locationRefs": ["LOC_OLD_APARTMENT"],
              "characterRefs": ["CHAR_LI_WEI"],
              "propRefs": ["PROP_KEY"]
            },
            "mood": { "presetId": null, "customMood": "冷静、低照度、无人等待" }
          },
          "videoConfig": {
            "videoPrompt": "Generate a restrained 15-second cinematic video segment...",
            "dialogueText": "",
            "dialogueLanguage": "zh",
            "includeDialogue": false,
            "generateAudio": false,
            "referenceMode": "smart-multi-frame",
            "generationOptions": { "duration": 15, "resolution": "1080p", "generateAudio": false }
          },
          "cinematicPlan": {
            "shots": [
              {
                "shotId": "A13_S01_SH01",
                "index": 1,
                "durationSec": 2.5,
                "title": "李未深夜回到公寓门口",
                "shotSize": "WS",
                "lens": "28mm 轻广角",
                "cameraMovement": "static",
                "composition": "李未15%，门墙65%，走廊负空间20%",
                "lighting": "走廊感应灯冷白偏绿 4300K",
                "imagePrompt": "Wide shot, Li Wei approaches her apartment door..."
              }
            ]
          }
        }
      ]
    }
  ]
}
```
````

### Mapping Summary

| Package Field | Waoo Internal Target |
|---------------|----------------------|
| `reviewConfig.referencePromptText` | `draftMetadata.referencePromptText` |
| `reviewConfig.compositePromptText` | `draftMetadata.compositePromptText` + `shotGroup.groupPrompt` |
| `reviewConfig.templateKey` | `shotGroup.templateKey` |
| `reviewConfig.storyboardMode.*` | `draftMetadata.storyboardModeId / Label / PromptText` |
| `reviewConfig.assets.locationRefs` | `selectedLocationAsset` or `scriptDerivedLocationAsset` |
| `reviewConfig.assets.characterRefs` | `selectedCharacterAssets` or `scriptDerivedCharacterAssets` |
| `reviewConfig.assets.propRefs` | `selectedPropAssets` or `scriptDerivedPropAssets` |
| `reviewConfig.mood.*` | `storyboardMoodPresetId` / `customMood` |
| `videoConfig.videoPrompt` | `shotGroup.videoPrompt` |
| `videoConfig.dialogueText` | `draftMetadata.dialogueOverrideText` or `embeddedDialogue` |
| `videoConfig.dialogueLanguage` | `shotGroup.dialogueLanguage` |
| `videoConfig.includeDialogue` | `shotGroup.includeDialogue` |
| `videoConfig.generateAudio` | `shotGroup.generateAudio` + `generationOptions.generateAudio` |
| `videoConfig.referenceMode` | `omniReferenceEnabled` / `smartMultiFrameEnabled` |
| `cinematicPlan` | `draftMetadata.cinematicPlan` |
| `cinematicPlan.shots[].title` | `NovelPromotionShotGroupItem.title` |
| `cinematicPlan.shots[].imagePrompt` | `NovelPromotionShotGroupItem.prompt` |

## Deferred / Future Requirements

### Advanced Reference Mode

- [ ] **REF-01**: 多镜头片段生成支持通过 `@` 语法引用更多资产
- [ ] **REF-02**: 多镜头片段生成支持最多 3 段视频作为参考输入
- [ ] **REF-03**: 多镜头片段生成支持最多 9 张图片作为参考输入
- [ ] **REF-04**: 多镜头片段生成支持最多 3 段 mp3 音频作为参考输入
- [ ] **REF-05**: 用户可以利用音频 / 视频 / 图片参考实现更细粒度的人物、风格与表现控制

## Out of Scope / Guardrails

| Feature | Reason |
|---------|--------|
| 完全删除传统模式 | 仍需兼容依赖逐镜头精细控制的用户 |
| 完全禁用单镜头分镜 | 产品目标是改变默认路径，不是取消补充能力 |
| 在导入导演分镜包时静默创建新资产 | 容易污染项目资产库；首版应预览匹配结果并允许剧本回退或手动绑定 |
| 自由解析任意 Markdown 表格并猜测字段 | 不稳定且难以测试；首版只支持 `.json` 或 Markdown fenced JSON block |
| 导入后直接触发图片 / 视频生成 | 首版目标是预填写配置并进入确认页，生成动作仍由用户确认触发 |
| 覆盖用户已有手动编辑而不提示 | 必须继承 Phase 3 的编辑保护与 metadata preservation 原则 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODE-01 | Phase 1 | Implemented |
| MODE-02 | Phase 1 | Implemented |
| MODE-03 | Phase 2 | Verified |
| MODE-04 | Phase 1 | Implemented |
| TRAD-01 | Phase 2 | Verified |
| TRAD-02 | Phase 2 | Verified |
| MSHT-01 | Phase 2 | Verified |
| MSHT-02 | Phase 2 | Verified |
| MSHT-03 | Phase 2 / 03.1 | Verified |
| MSHT-04 | Phase 2 / 03.1 | Verified |
| MSHT-05 | Phase 2 / 03.1 | Verified |
| MSHT-06 | Phase 2 | Verified |
| MSHT-07 | Phase 3 / 03.1 | User accepted |
| MSHT-08 | Phase 3 | User accepted |
| SHOT-01 | Phase 2 | Verified |
| SHOT-02 | Phase 3 | User accepted |
| UI-01 | Phase 1 | Implemented |
| UI-02 | Phase 2 | Verified |
| UI-03 | Phase 1 | Implemented |
| UI-04 | Phase 3 / 03.1 | User accepted |
| AST-01..AST-06 | Phase 02.1 | User accepted |
| HAND-01..HAND-06 | Phase 3 | User accepted |
| CINE-01..CINE-08 | Phase 03.1 | Implemented |
| SBPI-01..SBPI-12 | Phase 03.2 | Implemented |
| SBPI-13..SBPI-21 | Phase 03.3 | Implemented |
| SBPI-22..SBPI-30 | Phase 03.4 | Implemented |
| REF-01..REF-05 | Future / deferred | Pending |

**Coverage:**
- Original v1 requirements: 20 total, 20 implemented / verified / accepted
- Inserted completed requirements: 20 total, 20 implemented / verified / accepted
- New director storyboard import requirements: 30 total, 30 implemented in Phases 03.2-03.4
- Deferred advanced reference requirements: 5 total

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-26 after completing Phase 03.4 Script Page Upload UI*
