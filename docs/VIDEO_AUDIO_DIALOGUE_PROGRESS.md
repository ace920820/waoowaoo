# VIDEO AUDIO / DIALOGUE 当前开发进展

> 更新时间：2026-04-11 01:03 Asia/Shanghai
> 项目：`waoowaoo`
> 当前工作分支：`feat/p1-1-screenplay-dialogue-guard`

---

## 一、当前总目标

围绕 `stage=script → stage=storyboard → stage=videos` 的生成链路，逐步解决：

1. 无台词镜头也会在视频中生成人物说话
2. 有台词镜头说出的内容与剧本原文不一致
3. 视频提示词、对白文本、语音生成三者不是单一真相源
4. 用户在页面上无法直接看出一个镜头是否有台词、说什么、当前播放的是哪种音频版本

当前总方案文档：
- `docs/VIDEO_AUDIO_DIALOGUE_ALIGNMENT_PLAN.md`

---

## 二、已完成进展

### A. 分镜图替换能力（storyboard 子页面）
已完成：
- 下载当前分镜图
- 上传并替换当前分镜图
- 恢复上一张分镜图
- storyboard 当前图作为后续成片阶段首帧真相源

相关方案文档：
- `docs/STORYBOARD_IMAGE_REPLACEMENT_PLAN.md`

---

### B. 成片子页面尾帧图 / link-unlink 能力
已完成：
- `stage=videos` 页面增加首帧 / 尾帧展示
- 支持用户选择是否把下一分镜图作为当前尾帧
- 支持 link / unlink
- 修复了几轮相关回归：
  - 被引用为尾帧后，后一个分镜视频不显示/不播放
  - 前一个分镜 prompt 编辑框消失
  - 中间 panel 在链式场景下视频显示异常
  - 被前一个分镜引用后，后一个分镜自己的 prompt / 生成按钮消失

最近几次相关提交（已存在于仓库历史中）：
- `1ee3878` `feat(video): show linked tail frame on videos page`
- `80981c2` `fix(video): preserve linked panel playback and prompt display`
- `69bfed0` `fix(video): preserve blank prompts in linked chains`
- `fd20800` `fix(video-stage): preserve incoming tail panel controls`

---

### C. P1：统一对白文本真相源
已完成：
- 引入 screenplay-first 逻辑
- `clip.screenplay / dialogue items` 成为 voice/speech 分析主来源
- 只有在 screenplay 不可用时才回退到 `episode.novelText`

P1 本地提交：
- 原始本地提交：`5d7b455a7cc19058d9cf7023be5e3da3dbb50bad`
- 新分支中文提交：`5598a0b1f43056d0872692301a7937c0cae7a52b`
- 提交信息：`修复：加强 screenplay 语音分析防护`

当前已推送分支：
- `feat/p1-1-screenplay-dialogue-guard`

---

### D. P1.1：收 review 风险点
已完成：
- 只有在 screenplay 覆盖完整且结构可靠时，才接管真相源
- 混合质量 / 部分损坏 / 部分缺失的 screenplay，会安全回退到 `episode.novelText`
- screenplay-first 模式下，若 AI 输出不完整 / lineIndex 不一致，不再静默补默认值装作成功
- 改为显式失败/重试，避免把低质量结果继续传给后续链路

P1.1 当前有效分支提交：
- `5598a0b1f43056d0872692301a7937c0cae7a52b`
- 提交信息：`修复：加强 screenplay 语音分析防护`

说明：
- `main` 上此前已有英文 commit：`6060bb2 ...`
- 为便于分支推进与中文提交，当前工作线改为新分支上的中文 commit 版本

---

## 三、当前阶段

## 当前阶段：P2 已启动，第一实施切片已完成

### P2 总目标
建立 panel 级 speech plan 基础层，并把它逐步接入现有生成链路，让系统不再只靠自由文本 `videoPrompt` 去隐式表达“这个镜头会不会说话、说什么”。

### P2 三个实施切片

#### P2-切片1：panel 级 speech plan 基础层
目标：
- 给 panel 建立结构化 speech 语义基础层
- 初步区分：
  - `silent`
  - `dialogue`
  - `voiceover`
- 把 screenplay-first 的对白真相源继续向下游生成链路接进去
- 让视频生成请求开始消费结构化 speech intent，而不再完全依赖自由文本 `videoPrompt`

当前状态：**已完成**

#### P2-切片2：storyboard 输出与 video 生成真正消费 speech plan
目标：
- 让 storyboard/detail 阶段产出 speech 相关结构字段
- 让 `stage=videos` 的生成请求真正显式消费这些字段
- 明确 silent / dialogue / voiceover 在生成阶段的行为差异

当前状态：**未开始**

#### P2-切片3：provider 适配与生成护栏
目标：
- 按 provider 能力做 speech plan 映射
- 增加 silent / dialogue / voiceover 的生成护栏
- 补更多回归测试，避免 provider 间行为漂移

当前状态：**未开始**

### P2 当前不做
- 不做完整 P3 可观测 UI 层
- 不做完整 schema 大改版的所有附属能力
- 不做整套高级编辑/观察面板

---

## 四、当前最新进度（P2 第一实施切片 + P2.1 修复）

### 已完成结果
根据最新一轮 Codex 开发结果，P2 第一实施切片已经落下：

- 新增 panel 级结构化 speech foundation：
  - `src/lib/novel-promotion/panel-speech-plan.ts`
- 将视频生成接入 speech intent：
  - `src/lib/workers/video.worker.ts`
- 在 storyboards / episodes 返回数据中暴露 `speechPlan`：
  - `src/app/api/novel-promotion/[projectId]/storyboards/route.ts`
  - `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`
- 补了相关类型：
  - `src/types/project.ts`
  - `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/types.ts`
- 补了聚焦测试：
  - `tests/unit/worker/panel-speech-plan.test.ts`
  - `tests/unit/worker/video-worker.test.ts`

### 当前这一步的产出含义
这一切片完成后，系统已经开始拥有：
- panel 级 speech plan 基础层
- screenplay-first 到 speech intent 的接线
- 视频生成请求中的结构化 speech 提示块（而不只靠 `videoPrompt` 文本暗示）

### P2.1：已完成的 review 风险收口
本轮在 **P2-切片1** 之上补做了 P2.1，只处理 review 指出的三个风险点，不进入 P2-切片2：

1. **更严格的 panel ↔ speech fallback 匹配**
   - 先走标准化后的精确相等匹配
   - 只保留“长度受限、差异很小、且唯一”的窄幅 fuzzy 匹配
   - 对 `走吧` / `好` / 重复短句 / 歧义候选，改为拒绝绑定，不再静默挂到多个候选上

2. **speech-plan prompt 注入改为结构化 JSON**
   - 不再把 speaker / content / primaryText 直接拼成 `key=value` 文本行
   - 改为稳定的 JSON 结构块，降低换行、分隔符、伪字段注入污染 prompt 的风险

3. **统一 audio 控制面**
   - video worker 现在会先求出单一的 `effective generateAudio`
   - 同一个决策同时驱动：
     - 传给模型 provider 的运行时 `generateAudio`
     - 注入 prompt 的 speech/audio 指令
   - 因此不会再出现 `speechPlan` 要求有音频、但 runtime 又传 `generateAudio=false` 的冲突状态

### P2.1 回归覆盖
- `tests/unit/worker/panel-speech-plan.test.ts`
  - 覆盖重复短对白歧义匹配拒绝
  - 覆盖窄幅且唯一 fuzzy 匹配
  - 覆盖 JSON 序列化下的换行 / 分隔符注入安全
- `tests/unit/worker/video-worker.test.ts`
  - 覆盖 `generateAudio=false` 时 prompt 与 runtime 选项保持一致

### 本轮提交
- 本地 commit：`7c78216a560781f2d18180e0e7e5f170f7c3552a`
- 提交信息：`实现面板级语音计划基础能力`

### 当前判断
换句话说：

> **P2-切片1 已完成，且 review 风险点已通过 P2.1 收口；下一步才是 P2-切片2。**

---

## 五、下一步预期交付

下一步默认应进入：

### P2-切片2
重点是：
1. 让 storyboard/detail 阶段真正产出 speech 结构字段
2. 让 `stage=videos` 真正显式消费这些 speech 字段
3. 让 silent / dialogue / voiceover 在生成阶段表现出不同策略

当前状态：**尚未开始**

这一切片完成后，才会开始真正更接近你最关心的目标：
- 无台词镜头不再乱说话
- 有台词镜头更准确地说出 screenplay 中的文本

---

## 六、当前已知风险 / 备注

1. 仓库仍存在与本任务无关的全量校验噪音：
   - `fetch.preconnect` 相关测试类型错误
   - 一些现有 lint warning
2. 因此最近几轮本地提交，都采用了：
   - `--no-verify`
   - 或 `HUSKY=0`
3. `docs/` 目录当前被 `.gitignore` 忽略：
   - 文档可用于项目内记录
   - 但默认不会自动纳入 git 跟踪

---

## 七、给后续继续追问时的最短口径

如果后续再次问“现在做到哪了”，优先按下面口径回答：

- `stage=storyboard` 分镜图替换已完成
- `stage=videos` 首尾帧与多轮回归已完成
- P1 + P1.1（对白真相源统一与风险收口）已完成
- 当前正在做 **P2 第一实施切片**：建立 panel 级 speech plan 基础层，并把它接进生成链路
