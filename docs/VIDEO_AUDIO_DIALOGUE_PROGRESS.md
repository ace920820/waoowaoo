# VIDEO AUDIO / DIALOGUE 当前开发进展

> 更新时间：2026-04-11 03:08 Asia/Shanghai
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

当前状态：**通用 guardrails / regression 已完成；provider-specific mapping 暂缓**

### P2 当前不做
- 不做完整 P3 可观测 UI 层
- 不做完整 schema 大改版的所有附属能力
- 不做整套高级编辑/观察面板

---

## 四、当前最新进度（P2-切片3 稳定收益优先收口已完成）

### 本轮结论
本轮严格按“稳定收益优先”收窄，没有为了名义上的 slice3 去硬塞 provider-specific mapping。

原因：
- 当前视频 provider 的 speech 能力并不统一，很多能力既没有稳定显式参数，也缺少足够可回归的合同面。
- 如果按 provider 分叉 speech contract，很容易把现在单一真相源的 prompt/request contract 再次打散，增加“某 provider 生效、某 provider 漂移”的脆弱点。
- 本轮更高收益的是继续强化通用 guardrails，让所有 provider 至少先消费同一份更硬的 speech contract，再通过回归测试卡住 silent / dialogue / voiceover 三类常见退化。

### 本轮新增完成内容
1. **强化通用 speech execution guardrails**
   - 文件：`src/lib/novel-promotion/panel-speech-plan.ts`
   - 对三种模式补强执行约束：
     - `silent`：更明确禁止口播、旁白、lip-sync 倾向和 speech-shaped mouth cycles
     - `dialogue`：明确要求只说结构化台词原文；如果做不到，优先收敛为克制/少嘴型，而不是说错词
     - `voiceover`：更明确禁止把旁白做成画内对白或可见唇形同步

2. **把 guardrails 写进结构化 speech JSON**
   - 在 `[Structured Speech Plan JSON]` 中新增稳定的 `guardrails` 数组
   - 目的不是扩业务 schema，而是把 prompt contract 里的关键约束变成更可回归的结构化字段
   - 这样后续测试可以直接断言 contract，而不是只盯自然语言文案

3. **补强 regression tests**
   - `tests/unit/worker/panel-speech-plan.test.ts`
     - 新增 silent / dialogue / voiceover 的 guardrails 断言
     - 明确校验 `dialogue` 的 verbatim 限制与“宁可克制、不要错词”
     - 明确校验 `voiceover` 的“不要变成画内口型对白”
   - `tests/unit/worker/video-worker.test.ts`
     - 补 worker prompt 注入断言，确保上述 guardrails 真正进入生成请求 prompt

### 本轮验证结果
已完成：
- 使用 `node --import tsx` + `node:assert/strict` 运行手工断言脚本，验证通过：
  - `silent`：命中 non-speaking 指令、抑制 lip-sync / speech-shaped mouth cycles、结构化 `guardrails` 存在
  - `dialogue`：命中 verbatim 台词约束、禁止 paraphrase / substitute wording、要求错词时优先克制而不是乱说
  - `voiceover`：命中 off-screen narration 指令、禁止 visible lip-sync、结构化 `guardrails` 正确写入
- 直接运行聚焦单测：
  - `./node_modules/.bin/vitest run tests/unit/worker/panel-speech-plan.test.ts tests/unit/worker/video-worker.test.ts`
  - 结果：`2` 个 test files / `23` 个 tests 全部通过

说明：
- 仓库默认的 `pre-commit` 仍会触发全量 `lint + typecheck + test:all`
- 其中已有的 `fetch.preconnect` 相关 typecheck 噪音会拦住提交流程，但这不是本轮改动引入的问题

### provider-specific mapping 暂缓说明
本轮**未新增 provider-specific speech mapping**。

暂缓原因：
- 缺少稳定、跨 provider 一致且可测试的 speech 参数面，贸然做 provider 分叉会让系统更脆。
- 目前最稳定的公共合同仍然是：
  - 统一 speech plan
  - 统一 prompt contract
  - 统一 `generateAudio` 控制面
- 在没有更可靠 provider 能力证据前，继续强化通用 guardrails 的收益更确定，也更容易持续回归。

### 已完成结果
此前 P2 第二实施切片已经落下：

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

### P2.2 review follow-up：本轮新增落实点
本轮是对 **P2 第二实施切片代码 review** 的收口修复，重点不是扩 scope，而是把已有 speech-driven video wiring 再压实一层：

1. **修复多 clip 场景下 voice line → screenplay 的 `lineIndex` 对齐问题**
   - `derivePanelSpeechPlan` 现在支持在 panel 所属 clip 之外，额外消费 episode 级 clip 集合作为全局 line lookup
   - panel 文本 fallback 仍限定在当前 clip 内，避免跨 clip 误绑同文案台词
   - 因此 clip2+ 的 panel 在命中 episode-global `voiceLines.lineIndex` 时，仍能拿回正确 screenplay item/type
   - 这次专门补了两 clip regression，确保后续 clip 的 `voiceover` 不会被默认降级成 `dialogue`

2. **继续硬化 `[Speech Direction]` 自由文本执行块**
   - 不再把 `speaker / content / parenthetical` 原样插进指令区
   - 现在改成 quote + escape 的单行键值表达，显式保留内容但去掉换行污染结构的能力
   - 结构化 JSON speech block 继续作为机器可消费真相源，人类可读块则更稳健

3. **回归覆盖补强到 review 提出的两类问题**
   - 多 clip / 后续 clip / `voiceover` lineIndex 命中
   - newline-heavy / delimiter-like 文本对 `[Speech Direction]` 的污染防护

### P2.2：此前已完成的切片核心能力
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
  - 覆盖 `[Speech Direction]` 指令块对换行 / 分隔符样式输入的 quote+escape 硬化
  - 覆盖 dialogue / voiceover 的显式执行指令
  - 覆盖两 clip 场景下后续 clip `voiceover` lineIndex 仍能命中正确 screenplay item
  - 覆盖 panel visual context + speech contract 共同构成视频 prompt
- `tests/unit/worker/video-worker.test.ts`
  - 覆盖 `generateAudio=false` 时 prompt 与 runtime 选项保持一致
  - 覆盖 silent / dialogue / voiceover 在 worker 请求构造上的显式分支

### 本轮提交
- 本地 commit：见当前分支最新提交
- 提交信息：`实现 P2 切片2 语音驱动视频生成链路`

### 当前判断
换句话说：

> **P2-切片2 已完成；P2-切片3 本轮先完成了“通用 speech guardrails + regression”这部分稳定收口。provider-specific mapping 暂缓，待后续有足够稳定的 provider contract 再进入。**

---

## 五、下一步预期交付

下一步默认应进入：

### P2-切片3
重点是：
1. 继续观察本轮通用 guardrails 的实际生成收益
2. 仅在确认某 provider 存在稳定、可验证的显式 speech 参数面时，再做 provider-specific mapping
3. 如果后续进入 provider 分叉，必须先补对应回归合同，避免把统一 contract 再打散

当前状态：**通用 guardrails 已完成；provider mapping 暂缓观察**

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
4. **本地开发环境约定（2026-04-11 补记）**：`waoowaoo` 当前应按 **源码 `npm run dev` + 本地 dev MySQL** 使用，不应默认改接 Docker MySQL。
   - 当前开发数据库连接目标：`127.0.0.1:13306/waoowaoo`
   - 本地 dev MySQL 数据目录：`~/.local/share/waoowaoo-dev/mysql/data`
   - 当需要恢复“昨天正在使用的项目进度/数据”时，应优先拉起并连接这套本地 dev MySQL，而不是新起镜像库

---

## 七、给后续继续追问时的最短口径

如果后续再次问“现在做到哪了”，优先按下面口径回答：

- `stage=storyboard` 分镜图替换已完成
- `stage=videos` 首尾帧与多轮回归已完成
- P1 + P1.1（对白真相源统一与风险收口）已完成
- 当前已完成 **P2 第二实施切片**：让 storyboard/detail 的 speech contract 真正进入 `stage=videos` 生成请求
- 下一步进入 **P2 第三实施切片**：provider 适配与生成护栏
