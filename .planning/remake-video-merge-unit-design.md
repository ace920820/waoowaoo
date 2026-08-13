# 翻拍视频：短镜头合并 unit 设计方案

> 状态：**设计讨论 / 待评审**（未进入具体 Phase plan）
> 建立：2026-08-13
> 关联：Phase 9（单 Shot 视频生成）、Phase 10（批量编排）、Phase 11（素材检查与导出）
> 当前主线：feat/p1-1-screenplay-dialogue-guard 上的 remake 视频生成工作

## 问题背景

视频翻拍管线是：镜头边界识别 → 提取关键帧 → 转写 Prompt（分析/审核）→ 生成新关键帧 → 生成翻拍视频。

生成翻拍视频时，视频模型有**时长短下限**（当前约 4s，上限 15s）。但部分镜头边界识别出的 Shot 实际时长可能 < 4s（甚至 2~3s）。这类短镜头单独调用模型会被 `deriveDefaultVideoDuration` 强制"拉长"到最短档位（4s），造成：

- 翻拍视频时长与原镜头节奏不匹配；
- 一个仅 2~3s 的动作被注水到 4s，观感拖沓。

因此需要把**短镜头与相邻镜头合并成一次视频生成**（本设计称之为 **单元 / unit**），生成一段覆盖多个镜头的完整翻拍视频。

## 已确认的产品决策（用户拍板）

1. **交付单位 = 合并 unit**：合并后的一组镜头共用一个翻拍视频，用户直接对**整个 unit** 审核 / 采用 / 备注，**不**把生成视频裁剪回单个 shot。
2. **合并方式 = 纯手动**：系统不做默认自动合并，只在用户主动把 >= 2 个相邻镜头加入同一个 unit 时才合并生成。
3. **合并方向 = 优先同构相邻镜头**：优先把"场景（sceneTag）/ 角色（characterTags）相同/相近"的相邻镜头合进同一 unit，保持动作与画面连贯；无同构邻居时再退化为简单按 sequence 相邻贪心。
4. **一个 Shot 只允许属于唯一 unit**：某 Shot 一旦加入某 unit，即归属该唯一 unit，不可同时挂到多个 unit。
5. **unit 成员弃用独立单 shot 视频**：加入 unit 的 Shot 不再拥有独立的单 shot 视频生成通路（其 `RemakeVideoTrack` 不启用 / 或该 Shot 视为由 unit 交付），避免"同内容两个采用源"的歧义。
6. **MVP 不处理超长镜头**：unit 总长上限按现有模型上限（15s）行为一致——超出上限不做自动拆段，只要求用户拆组/接受拉长；超过 15s 的单个长镜头不在本设计范围（沿用现有拉长到上限的兜底），后续再迭代。
7. **每镜头只保留一个关键帧**：组内每个镜头贡献 1 张 adopted 关键帧（默认取 middle / 最忠实画面的那帧），作为该镜头时间段画面锚；N 镜头传 N 张，按 sequence 顺序。
8. **动作表合并为一张大图**：把 unit 各镜头按序铺进 6 宫格 / 9 宫格，重新合成一张 unit 级动作表，作为整段节奏的单一动作参考。
9. **提示词合并为一条，带时间锚点**：把各镜头 adopted Video Prompt 合并为一条分镜时间表，逐镜头标注 `[累计区间]` 时间位置（如 `0-1s 镜头1；1-4s 镜头2`），头部声明多镜头 cut 切换、非连续运镜。

> 说明：交付单位为 unit 意味着 Phase 11 现有的"每个 Shot 恰有一个采用视频版本"假设会被打破，导出与完整性检查需改为**每个 unit（或其覆盖的 Shot 集合）恰有一个采用视频版本**。这是需要同步调整的下游契约，见文末"下游影响"。

## 关键架构洞察：现有多镜头生成范式可复用

当前 **通用视频 Worker** 已有成熟的"一次调用覆盖多个镜头"范式（`handleShotGroupVideoTask` + `buildShotGroupArkContentPlan` / `buildShotGroupVideoPrompt`）：

- 一个 shot-group 挂多个 item（每个 item = 一个镜头）；
- 所有 item 的参考图 + 一张 composite（九宫格分镜合成图）一并塞入外发模型的 `content[]`（`reference_image` / `reference_audio`，上限图 9 / 音频 3）；
- prompt 把每个有序槽位当作**连续的动作节拍序列**描述，**一次调用生成一段完整长视频**；
- 外发经 `resolveVideoSourceFromGeneration` → 上传 COS → 持久化。

**翻拍合并 unit 可以直接借用该范式**，差异点在于：

- reference 不是"一张 composite"，而是**各参与镜头已采用的 start/middle/end 新关键帧 + 动作表**（这正是翻拍已经产出的输入）；
- prompt 不是"一个镜头组的总提示"，而是**组内各 Shot 已批准的 Video Prompt 按时间顺序拼接**，并声明镜头间是"剪接切换（cut）"而非连续运镜。

## 数据模型建议

现有模型是严格的"每 shot 一 video track"：`RemakeVideoTrack @@unique([shotRevisionId])`。要支持合并 unit，需要新增跨 shot 的粒度，**不动现有单 shot 通路**。

### 新增模型

```
RemakeVideoUnit
  id
  remakeProjectId
  userLabel?            # 用户备注
  createdAt / updatedAt
  members  RemakeVideoUnitMember[]   # 有序成员
  batches  RemakeVideoBatch[]        # 生成历史（复用现有 batch/version/采用语义）

RemakeVideoUnitMember
  id
  unitId
  shotRevisionId        # 关联的具体 shot revision
  ordinal               # 组内顺序（1..n，须与 sequence 连续）
  @@unique([unitId, ordinal])
  @@unique([shotRevisionId])          # 默认一个 shot 只属于一个 unit；如需多归属用分区字段
```

> 决策点：`shotRevisionId` 唯一会限制"一个 Shot 同属多个 unit"。MVP 阶段建议**先限制一个 shot 只归属一个 unit**（或归属唯一 active unit），避免多 unit 引用同一 shot 带来的采用/导出歧义。若以后需要"同一镜头可出现在不同比较 unit"，再加 `scopeKey` 分区。

复用说明：
- unit 的生成历史继续复用 `RemakeVideoBatch` / `RemakeVideoVersion` / `RemakeVideoAdoptionEvent` / provenance / invalidation，只需把这些表的 `track`/`trackId` 关系从"video track"泛化为"video container"（unit 或单 shot track），或为 unit 单建一组 batch/version 表。
- 推荐**单建 `RemakeVideoUnitTrack`**（对应 unit），保持既有单 shot track 结构不变、迁移最小；unit track 的 batch/version 完全复用 `RemakeVideoBatch` / `RemakeVideoVersion` 现有的 trackId 外键约定（多态：用 `trackType` 区分 `shot` / `unit`）。

### 对现有表的无破坏约束

现有 `RemakeVideoTrack @@unique([shotRevisionId])` 保留。**对未加入任何 unit 的 Shot**，单 shot 生成照旧；**已加入 unit 的 Shot**，其独立 `RemakeVideoTrack` 不启用（成员弃用单 shot 通路，决策 5）——成片页对该 shot 只走其 unit 的交付。

> 约束表达：可在 `RemakeVideoUnitMember` 的 `shotRevisionId` 上加唯一（由模型保证一 shot 至多一 unit），并让视频生成 API 对"该 shot 已归属某 unit"的请求直接拒绝并提示走 unit 提交。

## 生成管线（unit 提交）

### 输入快照设计

`buildVideoGenerationSubmission` 目前按 `shotId` 单打。为 unit 扩展为**多 shot 快照**：

```ts
// 单元级输入快照（新增，或泛化现有 snapshot）
// 注意：members 枚举"可用输入"（用于收集/去重/溯源/门禁），
// 而实际传给模型的 orderedReferences 是按「传递策略」归并后的 unit 级集合
// （每成员 1 关键帧 + 合并动作表大图 + 去重资产），两者不一定一一对应。
type VideoUnitInputSnapshot = {
  projectId; remakeProjectId;
  unitId;
  members: Array<{
    stableKey; shotRevisionId; ordinal;
    selectedKeyframe: { slot: 'start'|'middle'|'end'; mediaRef }; // 该成员贡献的 1 个关键帧（原则 A）
    adoptedVideoPrompt: string;                                    // 该成员已批准的视频 prompt
    timeRangeSeconds: { start: number; end: number };              // 时长贡献（用于总时长 + 时间锚点）
  }>;
  orderedReferences: OrderedVideoReference[];  // ← 实际发送：每成员 1 关键帧 + 合并动作表大图 + 去重资产（原则 A/B/C）
  model; options; referenceMode;
  durationSeconds;  // 组内各成员时长之和 → 经 deriveDefaultVideoDuration 归一化到 [min, 15s]
}
```

### 时长合并

- 组内总时长 = `Σ members.timeRangeSeconds`；
- 总时长仍走 `deriveDefaultVideoDuration` 的上/下限与离散档位归一化（D-10 / D-11 逻辑复用）：
  - 若总和 < 模型最短时长：提示用户在 unit 中加入更多镜头或接受拉长；
  - 若总和 > 15s：提示拆分为多个 unit（不要静默截断——但注意成员本身 < 4s，仍要能组成 unit）；
  - 纯手动取舍由用户掌控，系统只做合法性校验 + 明确提示，不自动增删成员。

### 跨镜头参考图与提示词的传递策略（核心难点）

这是本设计最关键的部分。预设约束：外发模型 `content[]` **图上限 9 / 音频上限 3**（`REMAKE_VIDEO_IMAGE_CAP=9` / `REMAKE_VIDEO_AUDIO_CAP=3`）。因此**每个镜头的参考输入必须精简**——否则 N 镜头 + 动作表 + 资产会很快顶满 9 张图上限 → **跨镜头不能全量传递**。

跨镜头传递已定稿为 **"每镜头一帧 + 合并动作表大图 + 资产去重 + 时间锚点提示词"**，四条原则如下：

### 原则 A：每个镜头只保留一个关键帧，作为其时间段画面锚

- 组内**每个镜头贡献 1 张** adopted 关键帧（建议默认取该镜头的 middle / 最忠实画面的那帧），作为该镜头时间段的画面锚。
- 因此 N 个镜头的 unit **传 N 张关键帧**，按 sequence 顺序入 `orderedReferences`；N 张关键帧 + 1 张合并动作表 + 去重资产必须 ≤ `content[]` 图上限 9。
- **契约调整**：现有 `assertVideoReferencesHaveKeyframe` 判 `role.endsWith('_keyframe')`（start/middle/end）。unit 需新增每成员角色（如 `shot_keyframe`），或复用 start/middle/end 语义——落地时在 `reference-roles.ts` 扩展 role 枚举 + 排序（用时间顺序），并放宽/新增抽查函数。

### 原则 B：动作表合并为一张六宫格 / 九宫格大图

- 动作表（action sheet）表达"这段怎么动、怎么拍"的节奏序。合并后**重新合成一张代表整段动作序列的大图**（6 格或 9 格，取决于 unit 镜头数）。
- 复用/扩展 Phase 8 的 `renderActionSheet`：把 unit 各镜头按 sequence 顺序铺进六宫格 / 九宫格（每格 = 一个镜头的一帧 + 镜头编号标注），存为新的 unit 级 action_sheet 输出版本，作为 unit 的单一动作参考。
- 与原则 A 的解耦：合并动作表大图负责"节奏 / 顺序 / 怎么拍"，而每镜头单帧负责"该镜头画面忠实度"。

### 原则 C：角色 / 场景 / 物品 / 语音 —— 跨镜头**去重并入**

- 资产是 per-shot 绑定的（`RemakeShot.sceneAssetId / characterAssetIds / propAssetIds`），跨镜头必然重复（同一角色/场景在不同镜头反复出现）。
- **跨 unit 全部成员收集后按 asset id 去重**：同一角色只入一次 `character_reference`，场景一次，物品一次；角色语音也去重。
- 去重后仍超上限（图 9 / 音频 3）时，按既有权重降级：关键帧 > 动作表 > 角色 > 场景 > 物品 > 语音。参考 `buildRemakeReferencePlan` 已实现的排序 + 截断（按 role 顺序，音频 cap=3 优先）。

### 原则 D：提示词合并为一条，且按镜头时长标注时间位置

unit 提示词不是"重新写一段"，也不是简单拼接段落，而是**合并为一条带时间锚点的分镜时间表**：

```
这是按时间顺序切换的多镜头视频，N 段镜头之间为剪接切换（cut），不是连续运镜。
总时长约 <DURATION> 秒。各镜头的时间位置与提示如下：

0-1s（镜头 1）：<adoptedVideoPrompt_1>
1-4s（镜头 2）：<adoptedVideoPrompt_2>
4-6.5s（镜头 3）：<adoptedVideoPrompt_3>
...

整体一致性要求：
- 各镜头保持角色形象、场景、画风一致（以对应时间段的 @Image 关键帧为锚）；
- 镜头切换自然、节奏紧凑，不补足空洞对话/无意义填充。
```

- 每个镜头的时间区间 = 该镜头贡献时长在 unit 累计时间轴上的 `[累计起始, 累计结束)`（用成员 `timeRange` 求和；时长归一化后的缩放按各镜头占比按比例换算）。
- 参考锚定：时间区间顺序与 `orderedReferences` 中关键帧顺序一致（@Image 顺序即时间顺序），模型可据时间锚点把对应画面落到正确时刻。
- 综合提示 + `buildRemakeReferencePromptSuffix`（@Image/@Audio 使用说明）仍保留。
- 门禁：unit 任一个成员**缺少 adopted 视频 Prompt 或 adopted 关键帧**时，阻止 unit 提交并逐成员列缺项（对齐 VGEN-07）。

### 冻结核对（提交时所见即所得）

unit 提交前，服务端把上述 4 原则固化为 **unit 输入快照**（返回给前端预览 + 冻结进 batch/version），保证：

- 用户看到的参考图、顺序、时间锚点、prompt、参数 = 模型实际收到的；
- 每个镜头的关键帧、其时间区间、来源稳定 key 显式可追溯；
- 沿用单镜头的 `videoInputFingerprint`（基于稳定 JSON）做 task 去重，跨成员/时间锚变化会自动改变指纹。

### 提示词（unit 版）—— 时间锚点模板形态

> 原则 D 已给出核心结构；这里明确"时间区间"计算方法与模型期望。

时区锚点计算（纯函数，可单测）：`unit.members` 按 ordinal 累加各自 `durationSeconds`，得到每个成员的 `[startOffset, endOffset)`；若总时长经 `deriveDefaultVideoDuration` 被归一化到档位值 `T`，则各成员区间按占比 `memberDur / ΣmemberDur × T` 缩放，保证各段时长总和 = 视频实际时长。

### 提交入口 / 交互

- 成片页（`RemakeVideoStage`）在**手动选择多个镜头后**提供"合并为一个 unit 生成"。
- 交互要点：
  - 用户从 Shot 列表勾选 2+ 个相邻镜头；
  - 系统按 `sceneTag` / `characterTags` 判定同构性，给出**默认分组建议**（可改）；
  - 展示该 unit 的总时长、模型能力校验、将冻结的全部参考图（固定顺序）、完整 unit prompt 预览；
  - 提交后走与单 shot 相同的 watch / 失败反馈 / 版本出现闭环。

## Worker 执行

新增 task handler（或扩展现有 `handleRemakeVideoTask` 支持多成员）：

- 解析 unit 快照（collect 各成员可用输入）→ 按传递策略归并为 unit 级 `orderedReferences`（每成员 1 关键帧 + 合并动作表大图 + 去重资产，原则 A/B/C）；
- Ark 模型走 `ark_content_multireference`（`content[]`：reference_image + reference_audio，图≤9 / 音频≤3）；
- 非 Ark 模型降级 composite_image（取第一个主关键帧）；
- unit prompt = 时间锚点模板（原则 D）+ 参考使用说明后缀；
- 生成 → 上传 COS（`remake/{projectId}/videos`）→ 创建 unit 的 batch + version；
- 多 unit 的受控并发 / 失败重试 / 恢复进入 Phase 10 范围。

## Provider 调用与单 shot 差异

| 维度 | 单 shot 翻拍 | 合并 unit 翻拍 |
|------|-------------|----------------|
| reference 组织 | 单 shot 的 start/middle/end 关键帧 + 动作表 | **每镜头 1 张关键帧（按序）** + 一张六宫格/九宫格合并动作表大图 + 跨成员去重资产（原则 A/B/C） |
| prompt 语义 | 单个镜头动作 | 有序镜头切换序列（cut-based），整体一致性约束 |
| 时长 | 单个 shot 时长归一化 | 成员时长之和归一化 |
| generationMode | normal / firstlastframe | normal（multi-segment 不宜用单一 firstlastframe）；若模型仅支持 firstlastframe 则需降级为"多段分别生成"兜底 |
| 音频 | 可选声音参考 ×1 | 组内成员声音参考合并（去重，音频≤3） |

## 合并方向（同构优先）的具体规则

1. 用户选中一组候选镜头（默认已按 sequence 排序）。
2. 对组内每个 < 最短时长的短镜头，优先寻找**相邻且 sceneTag 相交 / characterTags 相交最多**的镜头纳入同 unit，保证画面/空间连续。
3. 无同构相邻镜头时，退化为按 sequence 相邻贪心（只并入相邻的短镜头，或并入足够长的锚点镜头，使 unit 总时长落回合法区间）。
4. 反向合并的空间性：若一个 2s 镜头左右各有 3s + 3s 镜头，优先与"同场景/同角色"的一侧合并，而非机械就近。
5. 是否必须合并：**纯手动**——用户可自由选择，系统不强制；系统只对"总时长越界 / 成员数 < 2"给出阻止与说明。

## 下游影响（需并行评估）

- **Phase 11 完整性检查 / 导出**：从"每 Shot 恰有一个采用视频版本"改为"每个 unit（覆盖的 Shot 均已审核）恰有一个采用视频版本 + 各 unit 的成员构成记录"。导出按 unit 顺序命名，manifest 需记录 unit 与其成员 shot 的映射（含时间码、成员关键帧、prompt、参数）。
- **Phase 10 批量**：unit 与单 shot 要能统一纳入批量执行 / 取消 / 失败重试；unit 是编排的"任务原子单位"。
- **上游失效**：unit 的任一成员 shot 的 Prompt / 关键帧变化，应利用现有 provenance/invalidation 传播到整个 unit 的版本复核状态（与 D-17 语义对齐，但作用范围是 unit）。
- **门禁（VGEN-07 对齐）**：unit 组内任一成员缺少已采用关键帧 / 已批准 Video Prompt / 合法参数时，阻止该 unit 生成并逐成员说明原因。

## 开放问题（待评审）

**已确认：**
- ✔ 一个 shot 只允许属于唯一 unit（由 `RemakeVideoUnitMember.shotRevisionId` 唯一保证）。
- ✔ 不允许混合：unit 成员必须放弃独立单 shot 视频版本（决策 5），成片页对该 shot 只走 unit 交付。
- ✔ MVP 不处理超过 15s 的长镜头；unit 总长上限按现有模型上限，超出不做自动拆段，只要求拆组/接受拉长。

**仍待评审：**
1. unit 是否需要自己的"版本采用"门（unit 级采用指针）？推荐是，采用指针在 unit track 上 —— 与单 shot 语义一致，建议直接沿用。
2. 短镜头是否必须在 unit 内，还是允许单独生成（拉长至最短档）作为用户兜底？MVP 建议允许单独生成兜底，避免强制合并降低可用性。
3. 同构判定的阈值定义（sceneTag / characterTags 相交到什么程度算"同构"）需要一个明确的评分规则，落地时作为纯函数 + 单测。

---
*此文档用于推动设计定型；下一步是将确认后的方案落进 Phase 9/10 的 plan 与 prisma 迁移。*
