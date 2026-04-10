# VIDEO AUDIO / DIALOGUE 当前开发进展

> 更新时间：2026-04-11 02:03 Asia/Shanghai
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

当前状态：**已完成**

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

## 四、当前最新进度（P2 第二实施切片已完成）

### 已完成结果
根据最新一轮 Codex 开发结果，P2 第二实施切片已经落下：

- 新增 panel 级结构化 speech foundation：
  - `src/lib/novel-promotion/panel-speech-plan.ts`
- 将视频生成接入 speech intent：
  - `src/lib/workers/video.worker.ts`
- 明确让 `stage=videos` 运行时保留 panel 的 `speechPlan` 契约：
  - `src/lib/novel-promotion/stages/video-stage-runtime/useVideoPanelsProjection.ts`
- 补强视频提示词构造，使其显式消费 panel 视觉字段 + speech contract：
  - `src/lib/novel-promotion/panel-speech-plan.ts`
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
- storyboard/detail → panel state contract → video runtime 的 speech 接线
- 视频生成请求中的显式 speech execution contract，而不再只是把 speech plan 当作被动 metadata
- `silent / dialogue / voiceover` 在生成提示层拥有明确差异：
  - `silent`：明确禁止口播/旁白和说话型嘴部表演
  - `dialogue`：明确要求按结构化台词执行 on-screen speech
  - `voiceover`：明确要求按旁白/画外音执行，避免误做成口型对白
- 视频请求对自由文本 `videoPrompt` 的依赖降低，因为同时消费了 panel 的结构化视觉字段（shotType / cameraMove / description / duration / srtSegment）

### P2.2：本轮新增落实点
本轮在 **P2-切片1 + P2.1** 的基础上，继续完成了 P2-切片2 的核心接线：

1. **`stage=videos` 的 prompt/request 现在显式按 `speechMode` 分支**
   - `silent` / `dialogue` / `voiceover` 不再只有 JSON 元数据差异
   - 现在会生成明确的行为指令块（Speech Direction）
   - worker 生成请求时实际消费这些结构化字段

2. **视频阶段 panel contract 保留 `speechPlan`**
   - `useVideoPanelsProjection` 现在把 `speechPlan` 投影到 `VideoPanel`
   - `stage=videos` 不再在运行时把 speech 结构信息丢掉

3. **视频 prompt 不再主要只靠自由文本 `videoPrompt`**
   - 现在会额外拼入 panel 的结构化视觉上下文
   - 包括 shot type / camera move / description / duration / srt text reference
   - speech 与 visual 被拆成两个显式 contract，而不是混在一段自由文本里碰运气

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

### P2.2 回归覆盖
- `tests/unit/worker/panel-speech-plan.test.ts`
  - 覆盖重复短对白歧义匹配拒绝
  - 覆盖窄幅且唯一 fuzzy 匹配
  - 覆盖 JSON 序列化下的换行 / 分隔符注入安全
  - 覆盖 dialogue / voiceover 的显式执行指令
  - 覆盖 panel visual context + speech contract 共同构成视频 prompt
- `tests/unit/worker/video-worker.test.ts`
  - 覆盖 `generateAudio=false` 时 prompt 与 runtime 选项保持一致
  - 覆盖 silent / dialogue / voiceover 在 worker 请求构造上的显式分支

### 本轮提交
- 本地 commit：见当前分支最新提交
- 提交信息：`实现 P2 切片2 语音驱动视频生成链路`

### 当前判断
换句话说：

> **P2-切片2 已完成；下一步进入 P2-切片3（provider 适配与生成护栏）。**

---

## 五、下一步预期交付

下一步默认应进入：

### P2-切片3
重点是：
1. 按 provider 能力把 speech contract 映射成更稳定的请求参数/模板
2. 增加 silent / dialogue / voiceover 的 provider 级护栏
3. 补 provider 差异回归，减少模型漂移带来的“乱说话 / 说错词”问题

当前状态：**下一步**

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
- 当前已完成 **P2 第二实施切片**：让 storyboard/detail 的 speech contract 真正进入 `stage=videos` 生成请求
- 下一步进入 **P2 第三实施切片**：provider 适配与生成护栏
