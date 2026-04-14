# waoowaoo 视频音频与对白约束开发计划

## 文档目的

将 `waoowaoo` 当前 `stage=script → stage=storyboard → stage=videos` 链路中“视频原生音频 / 对白文本 / 镜头 speech 语义”不一致的问题，整理为正式开发方案文档，作为后续实现与验收依据。

本方案默认前提：

- **视频生成音频是必须能力，不能通过关闭视频原生音频来回避问题。**
- 目标不是“禁音”，而是让视频中的语音输出**受 screenplay 严格约束**。
- 本文档以 `novel-promotion` 工作流为范围，重点聚焦：
  - `stage=script`
  - `stage=storyboard`
  - `stage=videos`
  - `voice_analyze / voice_generate / lip_sync`

---

## 一、问题定义

当前系统中，存在以下核心问题：

1. **无台词镜头也会在视频中出现人物说话**
2. **有台词镜头说出的内容与剧本原文不一致**
3. **整个片段剧本只有少量对白，但生成视频中出现更多“模型脑补台词”**
4. **视频提示词、对白文本、语音生成三者不是单一真相源**

用户希望达到的目标非常明确：

- 若剧本中没有台词，视频不能凭空加台词
- 若剧本中有台词，视频人物需要按准确内容与语气说出台词
- 视频音频生成必须保留，但不能由模型自由脑补对白

---

## 二、当前判断

### 2.1 一句话判断
当前问题的本质不是某一条 prompt 偶发写坏，而是：

> **“谁在说话”被写进了视频提示词，但“具体说什么”没有被严格绑定进视频生成请求。**

所以一旦视频模型支持并启用了原生音频，模型就会根据“正在说话”这一视觉语义，自由脑补说话内容。

### 2.2 当前系统的根本缺口

当前链路至少存在三类结构性缺口：

1. **文本真相源分裂**
   - `episode.novelText`
   - `clip.content`
   - `clip.screenplay`
   - `panel.description`
   - `panel.videoPrompt`
   - `voiceLine.content`
   多份数据会漂移

2. **缺少 panel 级结构化 speech plan**
   - 当前 panel 没有明确字段表达：
     - 是否允许说话
     - 谁说话
     - 说什么
     - 是对白还是旁白
     - 当前音频来源是什么

3. **视频原生音频链路与 voice/lipsync 链路脱节**
   - 视频生成并不严格消费 `voiceLine.content`
   - `voice_analyze` 也并不严格以 `clip.screenplay` 为唯一对白来源

---

## 三、总体方案

建议将后续开发主线定义为：

> **以 `clip.screenplay` 作为单一对白真相源，建立 panel 级 speech plan，再用 speech plan 驱动视频原生音频、voice line、UI 展示与校验。**

整体分为三个阶段：

- **P1：统一文本真相源**
- **P2：做结构化 speech plan**
- **P3：让 UI 可观测**

---

# P1：统一文本真相源

## 目标
把当前“对白从哪里来”的逻辑收敛成一条主链：

> **对白文本以后以 `clip.screenplay` 为准，不再由 `episode.novelText` 主导二次猜。**

---

## P1-1. 明确 `clip.screenplay` 成为对白主来源

### 要做什么
将当前 `voice_analyze` 的输入主来源，从：
- `episode.novelText`

改为优先：
- `clip.screenplay`

只在 screenplay 缺失或无结构化内容时，才允许 fallback 到旧来源。

### 为什么
用户在 `stage=script` 中编辑的对白与剧本结构，应该成为后续一切对白相关能力的主输入。否则：
- storyboard 按新 screenplay 走
- voice_analyze 按旧 novelText 走
- 两边必然漂移

### 交付物
- 新的对白真相源规则说明
- `voice_analyze` 输入优先级调整
- 旧链路 fallback 兼容方案

### 验收标准
- 同一个 clip 的对白文本，在 `stage=script`、voice line、视频 speech plan 中一致
- 未经用户明确修改，不允许文本被二次改写

---

## P1-2. 建立 screenplay 的结构化对白抽取器

### 要做什么
从 `clip.screenplay` 稳定提取结构化 dialogue items：

- `sceneId`
- `lineId`
- `speaker`
- `text`
- `lineType`（`dialogue | voiceover | action`）
- `emotionHint`（如已有）

### 为什么
当前很多链路还在从大段文本重新推断谁在说话、说什么，这会带来额外幻觉和漂移。应改成：

> **对白先被结构化，再被后续链路引用。**

### 交付物
- screenplay parser / extractor
- dialogue item 类型定义
- 从 screenplay 到 dialogue items 的稳定映射函数

### 验收标准
- 片段 1 的 7 句对白可准确抽出为 7 条结构化记录
- 不凭空多出新台词

---

## P1-3. 重构 `voice_analyze` 的职责

### 要做什么
将 `voice_analyze` 从“重新从 novelText 猜对白”改成：

- 读取 screenplay 派生出的 dialogue items
- 做：
  - line → panel 匹配
  - speaker → panel 绑定
  - emotion / strength 补充推断

### 为什么
`voice_analyze` 后续应该承担的是：
- **映射与补充**
而不是：
- **重新发明对白文本**

### 交付物
- 新版 voice_analyze 输入契约
- line-to-panel mapping 逻辑
- 与旧项目兼容的 fallback 机制

### 验收标准
- `voiceLine.content` 与 screenplay 中对应对话逐字一致
- speaker 信息与 screenplay 一致

---

# P2：做结构化 speech plan

## 目标
让每个 panel 不再只靠 `videoPrompt` 隐式表达“是否说话”，而是有一份明确、结构化、可校验的 **speech plan**。

---

## P2-1. 为 panel 增加 speech 相关字段

### 建议字段
建议在 panel 级增加至少以下字段：

- `speechMode`
  - `silent`
  - `dialogue`
  - `voiceover`
- `spokenText`
- `speaker`
- `voiceLineId`
- `allowSpeech`
- `emotionStyle`
- `emotionStrength`
- `audioSource`
  - `native_video`
  - `tts`
  - `lip_sync`
  - `none`

### 为什么
当前系统最大的问题是：
- `videoPrompt` 里写“说话”
- 系统却不知道“说哪句”

speech plan 的意义，就是把“说话”从隐式自然语言里抽出来，变成显式、结构化的控制数据。

### 交付物
- schema 设计
- migration 方案
- 旧项目兼容规则

### 验收标准
- 每个 panel 是否允许说话，可通过结构字段判断，而不是靠 prompt 猜
- 每个 dialogue panel 都能追溯到 voiceLine / dialogue item

---

## P2-2. 改 storyboard 输出 schema

### 要做什么
让 storyboard/detail 阶段在输出 `description` / `videoPrompt` 之外，还输出 speech 相关字段：

- `speech_mode`
- `is_speaking`
- `speaker`
- `spoken_text`
- `voiceover_text`

### 关键原则
今后：
- `videoPrompt` 只负责：
  - 画面
  - 动作
  - 构图
  - 镜头运动
  - 表情 / 表演
- **不要再让 `videoPrompt` 独自承担对白控制**

### 交付物
- storyboard detail prompt schema 更新
- 输出校验规则
- 旧 panel 数据兼容逻辑

### 验收标准
- `silent` panel 的 prompt 中不再出现“正在说话”这类模糊语义
- `dialogue` panel 的 spokenText 可独立存在，不埋在自由文本里

---

## P2-3. 用 speech plan 驱动视频生成请求

### 要做什么
在 `stage=videos` 提交生成请求时：

#### 若 `speechMode = silent`
- 强制告知模型：
  - 本镜头无对白
  - 不允许人物开口说台词

#### 若 `speechMode = dialogue`
- 把以下信息作为结构化约束注入视频生成请求：
  - `spokenText`
  - `speaker`
  - `emotionStyle`
  - `emotionStrength`
  - 是否允许 paraphrase（默认不允许）

#### 若 `speechMode = voiceover`
- 明确该镜头是旁白，不应转成角色开口说话

### 重点说明
由于当前业务要求是：
- **视频必须自己生成音频**

所以这里不能靠“关闭原生音频”回避，而必须把 speech plan 显式注入原生视频生成链路，减少模型脑补自由度。

### 交付物
- `speechMode` → video request 的映射规则
- provider prompt template / payload template
- `silent / dialogue / voiceover` 三类镜头的约束模板

### 验收标准
- 无对白镜头不再自创台词
- 有对白镜头输出与 screenplay 文本高度一致
- 旁白镜头不再误生成口型台词

---

## P2-4. 做 provider 差异化适配

### 要做什么
不同视频模型对“带音频视频”的可控性不同，因此需要一个 provider adapter 层，把统一 speech plan 映射成各家最适合的请求形式。

### 需要覆盖的能力维度
- 是否支持原生音频
- 是否支持明确 transcript
- 是否适合多角色对白
- 是否容易自由脑补
- 是否适合 voiceover

### 交付物
- provider capability matrix
- speech prompt template 按 provider 分支
- 失败/降级策略

### 验收标准
- 同一 speech plan 在不同 provider 下行为可预测
- 用户切模型后，不会完全失去对白约束

---

# P3：让 UI 可观测

## 目标
让用户能看见系统对每个镜头“说不说、谁在说、说什么”的理解结果，而不是等生成出来后再靠听去猜系统有没有跑偏。

---

## P3-1. 在 videos 页显示 panel 的 speech 状态

### 每个 panel 应可见的信息
- `speechMode`（silent / dialogue / voiceover）
- `speaker`
- `spokenText`
- `emotionStyle / emotionStrength`
- 当前 `audioSource`

### 交付物
- 视频卡片 speech 信息区
- 数据缺失 / stale 状态展示

### 验收标准
- 用户在生成前就知道该镜头有没有台词、说什么

---

## P3-2. 区分当前播放的是哪种视频/音频版本

### 要做什么
在视频页明确显示：
- 当前播放的是：
  - `base video`
  - `native-audio video`
  - `lip-sync video`

### 为什么
当前用户看到“人物说话”时，往往无法判断：
- 是原生视频模型自己说的
- 还是 lip-sync 后补上的

这会严重影响排查效率。

### 验收标准
- 用户可以明确知道当前看到的是哪一种音频来源

---

## P3-3. script 变更后的 stale 提示

### 要做什么
如果用户在 `stage=script` 改了剧本 / 对白：
- panel speech plan
- voice lines
- 当前视频音频草稿
都应该显示 stale 状态，并提示：
- 需要重跑 analyze / remap / regenerate

### 验收标准
- 改剧本后不会再悄悄沿用旧对白语义

---

## P3-4. 用户纠偏能力

### 可选增强
在 UI 中允许用户：
- 手动确认某个 panel 的 `speechMode`
- 修正 `speaker`
- 确认 / 编辑 `spokenText`

### 原则
先做“可观测”，后做“可编辑”；避免一次性把界面做成重型对白编辑器。

---

# 四、实施顺序建议

## Sprint 1（P1）
目标：先把对白主来源统一

包含：
- P1-1
- P1-2
- P1-3

### 验收门槛
- screenplay 中的对白可稳定抽取
- voice lines 与 screenplay 一致
- 不再主导使用 `episode.novelText` 重新猜对白

---

## Sprint 2（P2 前半）
目标：建立 panel 级 speech plan

包含：
- P2-1
- P2-2

### 验收门槛
- 每个 panel 都能明确标记 `silent / dialogue / voiceover`
- spokenText 不再只藏在自由文本 prompt 中

---

## Sprint 3（P2 后半）
目标：让 speech plan 真正进入视频音频生成

包含：
- P2-3
- P2-4

### 验收门槛
- silent 镜头不再乱说话
- dialogue 镜头说的话与 screenplay 一致
- 不同 provider 行为在可控范围内

---

## Sprint 4（P3）
目标：让用户可看见、可判断、可纠偏

包含：
- P3-1
- P3-2
- P3-3
- P3-4（可选）

### 验收门槛
- 用户在 UI 中能预判某镜头的语音行为
- script 改动后 stale 状态明确可见
- 用户可在 `stage=videos` 对单个 panel 做轻量对白覆盖，且下一次视频生成直接使用该文本

---

# 五、验收标准（总）

最终至少要满足以下三条：

1. **无台词镜头不再生成自创对白**
2. **有台词镜头的实际台词与 screenplay 一致**
3. **用户在 UI 上能看到这个镜头是否有台词、台词是什么、当前播放的是哪种音频版本**

---

# 六、风险与代价

## 6.1 数据结构变更
- panel 需要新增 speech plan 字段
- panel 可以新增轻量 `dialogueOverride` 作为视频阶段临时覆盖源
- 旧项目可能需要 backfill / migration

## 6.2 Prompt schema 需要调整
- storyboard detail prompt 输出结构要改
- provider 适配 prompt 要重做一部分

## 6.3 provider 差异较大
- 原生音频能力不是所有 provider 都能一样控制
- 需要能力矩阵和降级策略

## 6.4 测试成本上升
至少需要覆盖：
- silent panel
- dialogue panel
- voiceover panel
- screenplay 更新后的 stale 路径
- 多 provider 对 speech plan 的差异化映射

---

# 七、推荐决策

推荐正式采纳如下主方向：

1. **P1：统一文本真相源**
   - `voice_analyze` 改从 `clip.screenplay / dialogue items` 派生，不再主导读 `episode.novelText`

2. **P2：做结构化 speech plan**
   - 给 panel 增 speech 相关字段
   - 明确区分：
     - `silent`
     - `dialogue`
     - `voiceover`

3. **P3：让 UI 可观测**
   - 在视频页明确显示：
     - 这个镜头是否有台词
     - 台词文本是什么
     - 当前播放的是 `base / native-audio / lip-sync` 哪一种版本

---

# 八、下一步建议

建议后续执行顺序为：

- 先落文档与结构设计
- 再由 Codex 按阶段逐步实现
- 每完成一阶段，进行一次真实片段回归验证（尤其是“片段1只有7句台词”这类确定性样本）

如需继续推进，下一步默认应进入：

> **P1 的开发派单与工程拆解**

即：先把 `voice_analyze` 与 screenplay 的真相源统一，打掉目前最根本的漂移来源。
