# Shot Group（镜头组）工程落地拆解方案

## 文档目的

在 `waoowaoo` 现有 `stage=storyboard → stage=videos` 架构上，为 **镜头组（Shot Group）** 能力提供一份工程落地拆解方案。

本方案重点覆盖两类新增能力：

1. **镜头组分镜稿生成**
   - 支持 4 / 6 / 9 镜头组
   - 模板 + 组提示词 + 参考图生成组分镜稿
2. **镜头组长视频生成**
   - 基于多张图 / 四宫格 / 六宫格 / 九宫格，生成一段长视频
   - 重点适配 `Seedance 2.0` 全能参考模式

本方案默认以 **增量扩展** 为原则：

- 不推翻现有单 panel 图像 / 视频链路
- 不把 `shot group` 硬塞成普通 panel
- 不做一整套重型时间线系统

---

## 一、当前工程判断

### 1.1 一句话判断
最合理的工程归位不是改造“单 panel 视频任务”去同时兼容一切，而是：

> **在现有 panel 体系之上，新增一个独立的 shot group 领域对象，并补一条并行的 group image / group video 任务链路。**

也就是：

- `panel` 继续负责单镜头
- `shotGroup` 负责一组有顺序的镜头
- `video_panel` 继续负责单镜头视频
- 新增 `video_shot_group` 负责镜头组视频

### 1.2 为什么不能直接复用现有 panel 语义
当前代码里，单 panel 视频链路已经很明确：

- `POST /api/novel-promotion/[projectId]/generate-video`
- 任务类型：`TASK_TYPE.VIDEO_PANEL`
- worker：`src/lib/workers/video.worker.ts`
- provider 入口：`src/lib/model-gateway/openai-compat/video.ts`
- UI projection：`useVideoPanelsProjection.ts`

这条链路天然假设：
- 一个 task 对应一个 `NovelPromotionPanel`
- 一个 panel 只有一个 `imageUrl`
- 一次视频生成主要围绕单镜头 prompt + 单图输入组织

如果把镜头组直接塞进这套结构，会立即遇到：

1. `targetType=NovelPromotionPanel` 不再成立
2. `input_reference` 单图语义不成立
3. `VideoPanel` UI 类型无法清晰承载“一段视频对应多个镜头”
4. 单镜头状态与多镜头状态会互相污染

所以工程上最稳的做法是：

> **保留单 panel 任务链路；新增 shot group 任务链路。**

### 1.3 实现状态更新（2026-04-15）

- 已新增 `TASK_TYPE.IMAGE_SHOT_GROUP`，走独立 image queue / worker handler
- 已新增 `POST /api/novel-promotion/[projectId]/generate-shot-group-image` 提交入口
- 已支持 `templateKey + groupPrompt + referenceImageUrl` 参与真实组图生成
- 已将结果回写为 `shotGroup.compositeImageUrl`，并在 storyboard `ShotGroupSection` 直接展示
- 已支持 shot group 参考图上传（复用 `upload-asset-image`，新增 `type=shot-group`）
- 当前仍未实现：item 级切图回写、ordered items 独立生成、shot group video run

---

## 二、现有结构盘点（与本方案直接相关）

## 2.1 数据层现状
当前 Prisma 中与本方案直接相关的核心模型：

- `NovelPromotionPanel`
- `NovelPromotionStoryboard`
- `NovelPromotionClip`
- `NovelPromotionProject`
- `SupplementaryPanel`

其中：
- `NovelPromotionPanel` 以 `storyboardId + panelIndex` 唯一定位
- panel 已承载：
  - `imageUrl`
  - `videoPrompt`
  - `videoUrl`
  - `firstLastFramePrompt`
  - `dialogueOverride`
  - `linkedToNextPanel`

这说明 panel 已经明显是“单镜头工作单元”，不适合再承担“镜头组”语义。

## 2.2 storyboard 页现状
当前已有一套按 clip / storyboard group 组织的结构：

- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/*`
- `StoryboardCanvas.tsx`
- `storyboard-group` API
- `addStoryboardGroup`
- `moveStoryboardGroup`

这说明 storyboard 页原本就有“组块级”组织能力，适合作为 shot group 的落点。

## 2.3 videos 页现状
当前 videos 页已经围绕 panel 做了成熟 runtime：

- `src/lib/novel-promotion/stages/video-stage-runtime/*`
- `useVideoPanelsProjection.ts`
- `useVideoFirstLastFrameFlow.ts`
- `useVideoPromptState.ts`
- `useVideoPanelLinking.ts`
- `src/app/.../components/video/panel-card/*`

这条线已经比较重了，但它的对象模型仍然是：

> `VideoPanel[]`

因此，不建议把镜头组也混进 `VideoPanel` 本体里，而应新增 `VideoShotGroup` / `ShotGroupVideoCard` 这一层。

## 2.4 provider 接线现状
当前 `src/lib/model-gateway/openai-compat/video.ts` 的核心输入仍然是：

- `imageUrl`
- `prompt`
- 单个 `input_reference`

也就是说当前 adapter 还不是多参考图 / 多镜头 run 结构。

这也是本方案必须新增独立请求结构的直接原因。

---

## 三、推荐领域模型

## 3.1 新增对象：`NovelPromotionShotGroup`

建议新增一张新表，用于表达一个可持久化的镜头组。

### 推荐字段（MVP）
- `id`
- `projectId`
- `episodeId`
- `clipId`（可选；若来自某个现有 clip / storyboard）
- `storyboardId`（可选；若挂在某个 storyboard 分组下）
- `groupType`：`grid4 | grid6 | grid9 | ordered`
- `templateKey`
- `title`
- `groupPrompt`
- `referenceImageUrl` / `referenceImageMediaId`
- `compositeImageUrl` / `compositeImageMediaId`
- `status`
- `createdAt`
- `updatedAt`

### 职责
- 表达一个“镜头组对象”
- 存储组级配置和结果引用
- 不直接等同于任务记录

---

## 3.2 新增对象：`NovelPromotionShotGroupItem`

建议把组内每个子镜头拆成单独 item，而不是只存一整坨 JSON。

### 推荐字段（MVP）
- `id`
- `shotGroupId`
- `itemIndex`（0-based）
- `slotKey`（如 `1..9`）
- `shotTypeLabel`
- `imageUrl` / `imageMediaId`
- `imagePrompt`
- `notes`
- `sourcePanelId`（可选，若由 panel 合并而来）
- `createdAt`
- `updatedAt`

### 职责
- 明确表达“组内顺序”
- 为后续视频生成提供 ordered references
- 允许以后扩展每个子镜头的 metadata

### 为什么不只存九宫格总图
因为视频阶段真正消费的不是“一张拼图”，而是：

> **ordered references**

所以不论视觉上是：
- 四宫格
- 六宫格
- 九宫格

底层都要能投影为：
- `shotGroup.items[0..n]`

---

## 3.3 新增对象：`NovelPromotionShotGroupVideoRun`

建议单独存一张“镜头组视频任务结果表”，不要继续把结果回写到 panel 上。

### 推荐字段（MVP）
- `id`
- `shotGroupId`
- `provider`
- `model`
- `durationSeconds`
- `aspectRatio`
- `status`
- `promptSnapshot`
- `referencesSnapshotJson`
- `videoUrl` / `videoMediaId`
- `lastError`
- `createdAt`
- `updatedAt`

### 为什么必须有 snapshot
因为 shot group 在生成后仍可能被修改：
- 顺序改了
- 图改了
- 模板改了
- prompt 改了

如果不保存 snapshot，后面 videos 页会出现：
- 当前组看起来是 A-B-C-D
- 但这条视频其实是按旧版 A-C-D-E 跑的

这是必须避免的。

---

## 3.4 模板对象建议

MVP 可以先不单独建表，优先走：
- `templateKey`
- 模板注册表 / 常量文件

等模板体系成熟后，再考虑：
- `NovelPromotionShotGroupTemplate`

这样可以先降低 schema 范围。

---

## 四、数据库与 Prisma 改动建议

## 4.1 schema 新增
建议新增三张表：

1. `novel_promotion_shot_groups`
2. `novel_promotion_shot_group_items`
3. `novel_promotion_shot_group_video_runs`

### 关系建议
- `Project 1 -> many ShotGroup`
- `ShotGroup 1 -> many ShotGroupItem`
- `ShotGroup 1 -> many ShotGroupVideoRun`
- `ShotGroup optional -> Storyboard`
- `ShotGroupItem optional -> Panel`

---

## 4.2 为什么不复用 `SupplementaryPanel`
`SupplementaryPanel` 当前更像：
- storyboard 里的补充分镜 / 派生镜头

而 shot group 需要表达的是：
- 一组有顺序的镜头结构
- 组级模板
- 组级 prompt
- 组级视频输出

语义明显更高一层，所以不推荐硬复用。

---

## 五、API 层拆解建议

## 5.1 storyboard 侧 API

### A. `POST /api/novel-promotion/[projectId]/shot-group`
用于：
- 手动创建一个空镜头组
- 从模板初始化
- 从连续 panels 合并为镜头组

### B. `PATCH /api/novel-promotion/[projectId]/shot-group`
用于：
- 更新组标题
- 更新模板
- 更新组提示词
- 更新顺序信息

### C. `DELETE /api/novel-promotion/[projectId]/shot-group`
用于：
- 删除镜头组

### D. `POST /api/novel-promotion/[projectId]/shot-group/generate-image`
用于：
- 提交镜头组分镜稿生成任务
- 输出 composite image + ordered items

### E. `POST /api/novel-promotion/[projectId]/shot-group/merge-panels`
用于：
- 从连续 panels 生成一个 shot group

### F. `POST /api/novel-promotion/[projectId]/shot-group/unpack`
用于：
- 将镜头组拆回普通分镜（后续阶段再做也可）

---

## 5.2 videos 侧 API

### A. `POST /api/novel-promotion/[projectId]/generate-shot-group-video`
用于：
- 为某个 shot group 提交一条长视频生成任务

### B. `GET /api/novel-promotion/[projectId]/shot-group-video-runs`
用于：
- 拉取 shot group 视频运行结果

### C. `GET /api/novel-promotion/[projectId]/shot-groups`
用于：
- storyboard / videos 两边共用的数据加载

---

## 5.3 为什么不把长视频继续塞进 `/generate-video`
因为当前 `/generate-video` 明确是：
- `storyboardId + panelIndex`
- `TASK_TYPE.VIDEO_PANEL`
- target = `NovelPromotionPanel`

如果继续往里塞：
- `shotGroupId`
- `orderedReferences`
- `groupPrompt`

会快速把接口变成“单镜头 / 多镜头 / 首尾帧 / provider 特例”混杂的巨型入口。

推荐做法：

> **新能力走新接口，旧能力不被拖脏。**

---

## 六、任务系统与 worker 改动建议

## 6.1 新增任务类型
建议新增两个任务类型：

- `TASK_TYPE.IMAGE_SHOT_GROUP`
- `TASK_TYPE.VIDEO_SHOT_GROUP`

这样可与现有：
- `IMAGE_PANEL`
- `VIDEO_PANEL`

清晰并存。

### 需要同步更新的位置
- `src/lib/task/types.ts`
- `src/lib/task/queues.ts`
- `src/lib/task/progress-message.ts`
- `src/lib/billing/task-policy.ts`
- 相关队列与 UI task target 映射

---

## 6.2 新增 worker handler

### A. 组图生成 handler
建议新增：
- `src/lib/workers/handlers/shot-group-image-task-handler.ts`

职责：
- 读取 shot group
- 读取模板
- 读取参考图
- 组织 prompt
- 调 image generation
- 保存 composite image
- 必要时切分 / 回写 items

### B. 组视频生成 handler
建议新增：
- `src/lib/workers/handlers/shot-group-video-task-handler.ts`

职责：
- 读取 shot group 及 items
- 组织 ordered references snapshot
- 组织组级 prompt
- 调 provider 生成长视频
- 保存 `ShotGroupVideoRun`

---

## 6.3 视频 worker 的组织建议
不建议继续把镜头组逻辑直接写进 `src/lib/workers/video.worker.ts` 的单 panel 主路径。

推荐方式：
- `video.worker.ts` 继续作为视频类任务入口
- 根据 `TASK_TYPE` 分发：
  - `VIDEO_PANEL` → 现有单 panel 路径
  - `VIDEO_SHOT_GROUP` → 新 handler

这样最稳。

---

## 七、provider / generator adapter 改造建议

## 7.1 当前问题
当前 `openai-compat/video.ts` 仍是单图输入：
- 一个 `imageUrl`
- 一个 `input_reference`

这不足以表达：
- 多参考图
- 有序镜头序列
- group-level video run

## 7.2 推荐抽象
建议新增一个更高层的领域请求对象，例如：

### `ShotGroupVideoRequest`
- `userId`
- `providerId`
- `modelId`
- `prompt`
- `orderedReferences`
- `duration`
- `aspectRatio`
- `options`

### `orderedReferences`
每项可包含：
- `index`
- `imageUrl`
- `role`（如 `main_reference`，MVP 先可省）
- `shotType`（可选）

---

## 7.3 provider 层分工建议

### 领域层
负责：
- ordered references
- duration
- aspect ratio
- group prompt
- snapshot

### provider adapter 层
负责：
- Seedance 2.0 全能参考具体怎么喂多图
- 是否需要拼装 multipart / 多附件字段
- provider-specific 能力限制处理

### 为什么要分层
因为“镜头组视频”是领域能力，不应该写死成：
- 只服务 Seedance
- 只接受九宫格
- 只接受单个特殊 provider payload

后面若换模型，只需要改 adapter mapping，而不是重写 shot group 领域层。

---

## 八、前端 runtime / projection 改动建议

## 8.1 storyboard 页
建议新增：
- `ShotGroupCard`
- `ShotGroupCreateDialog`
- `ShotGroupTemplatePicker`
- `ShotGroupGridPreview`

建议路径：
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/shot-group/*`

### 原则
不要把镜头组逻辑硬塞进当前单 panel 组件里。

可以在 `StoryboardCanvas` 层增加一类 block：
- `panel block`
- `shot group block`

而不是把 `PanelCard` 改成巨大 if/else 集合。

---

## 8.2 videos 页
建议新增：
- `ShotGroupVideoSection`
- `ShotGroupVideoCard`
- `useShotGroupVideoRuns`
- `useShotGroupVideoSubmission`

建议路径：
- `src/app/.../components/video/shot-group-card/*`
- `src/lib/novel-promotion/stages/video-stage-runtime/useShotGroupVideoProjection.ts`

### 为什么不直接混入 `useVideoPanelsProjection`
因为当前投影结果是 `VideoPanel[]`。

镜头组若混入其中，会让整个 videos 页失去对象清晰性。

更合适的是：
- `VideoPanel[]`
- `VideoShotGroup[]`

两条投影共存，页面分区显示。

---

## 8.3 query / types 层
建议新增：
- `src/types/project.ts` 中补 `ShotGroup` / `ShotGroupItem` / `ShotGroupVideoRun`
- 对应 hooks / loader / projection types

这样可以避免把 group 数据临时塞进 panel 类型里。

---

## 九、MVP 分阶段实施建议

## Phase 1 最新落地状态（2026-04-15）
- 已新增 `shot group / shot group item` Prisma 模型与 migration 骨架
- 已补齐最小 CRUD API：创建、查询、更新基础字段、删除
- storyboard 页已新增镜头组独立区块，可手动创建并看到占位镜头格
- videos 页已拆出镜头组占位区块，但尚未接通组视频 run
- 现有单 panel storyboard / video 主链保持不变


## Phase 1：打通镜头组对象与 storyboard 页面

已落地状态（2026-04-15）：
- Prisma 已新增 `NovelPromotionShotGroup / NovelPromotionShotGroupItem` 与 migration
- API 已提供 `GET / POST / PATCH / DELETE /api/novel-promotion/[projectId]/shot-groups`
- episode 数据加载已返回 `shotGroups`，storyboard/videos 两侧均可消费
- storyboard 已支持手动创建镜头组并展示占位镜头格
- videos 已拆出镜头组独立占位区块，但尚未接通组视频运行链路

目标：
- 让用户能在 storyboard 中创建 / 查看镜头组

范围：
- Prisma schema 新增 shot group / items
- shot group CRUD API
- storyboard 中显示 shot group block
- 支持模板 key、组 prompt、参考图

此阶段先不做长视频。

---

## Phase 2：打通镜头组分镜稿生成
目标：
- 让 shot group 可以生成四宫格 / 六宫格 / 九宫格组图

范围：
- `IMAGE_SHOT_GROUP`
- group image task handler
- composite image 保存
- items 回写 / 顺序落库

此阶段完成后，镜头组已能作为可视化创作对象存在。

---

## Phase 3：打通镜头组长视频生成
目标：
- 让 shot group 生成一条长视频

范围：
- `VIDEO_SHOT_GROUP`
- 新 API：`/generate-shot-group-video`
- `ShotGroupVideoRun`
- videos 页 group card
- provider adapter：Seedance 2.0 全能参考

这是本轮最核心的能力闭环。

---

## Phase 4：增强能力（非 MVP）
可后续再做：
- 从连续 panels 合并为 shot group
- 拆回普通 panels
- 组内 item 级微调
- 多版本 runs 对比
- 更复杂模板系统
- 不同镜头组类型的专属规则

---

## 十、测试重点

## 10.1 数据层
- shot group / items / runs 的级联关系
- 删除 group 后 items / runs 是否正确处理
- snapshot 是否可回放当次运行输入

## 10.2 API 层
- shot group CRUD
- group image submit
- group video submit
- merge panels 输入校验
- group prompt / templateKey 校验

## 10.3 worker 层
- IMAGE_SHOT_GROUP 正确保存 composite image
- VIDEO_SHOT_GROUP 正确消费 ordered references
- provider 失败时 run 状态与错误回写正确

## 10.4 UI 层
- storyboard 中 group block 与 panel block 混排稳定
- videos 中单镜头 / 镜头组两区块不串状态
- 重跑后正确生成新 run，不污染旧 run

## 10.5 回归重点
- 现有 `VIDEO_PANEL` 不受影响
- 现有 first/last frame 不受影响
- 现有 dialogue override 不受影响
- 现有 panel image replace 不受影响

---

## 十一、MVP 明确不做

本轮先不要做：
- 重型时间线编辑器
- 每个组内镜头独立配时
- 组内镜头级视频 prompt 编辑器
- 自动把 AI storyboard 结果变成镜头组
- 把 shot group 真当普通 panel 落库
- 把 shot group 长视频结果回写到某个 panel.videoUrl

这些都会让现有对象边界变脏。

---

## 十二、最终建议

本次最稳的工程路线是：

> **新增独立的 shot group 数据模型、任务类型、API、worker 和 videos projection；保留现有 panel 单镜头链路不动；通过双轨并存的方式，把九宫格分镜稿和长视频生成接进现有短剧工作流。**

最关键的边界必须守住：

- `panel` 仍然是单镜头对象
- `shotGroup` 是新对象，不伪装成普通 panel
- `video_panel` 与 `video_shot_group` 是两条并行任务链路
- videos 页用 **分区 + 独立卡片类型** 承接，而不是硬塞进同一套 panel card

如果遵守这条边界，新增能力会比较顺；如果试图把所有能力都糊进 panel 体系里，复杂度会迅速失控。
