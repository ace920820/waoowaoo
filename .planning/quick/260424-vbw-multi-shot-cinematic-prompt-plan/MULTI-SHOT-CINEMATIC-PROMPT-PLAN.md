# Multi-Shot Cinematic Prompt Plan

## Why This Exists

The current multi-shot fast path correctly calls an LLM during `Script->Storyboard`, but it asks the model to produce one main `narrativePrompt` per 15s segment. That single text then seeds multiple downstream uses:

- `辅助参考图提示词` defaults to `referencePromptText ?? narrativePrompt`.
- `剧情内容` defaults to `compositePromptText ?? videoPrompt ?? groupPrompt ?? narrativePrompt`.
- `groupPrompt` and `videoPrompt` are both initialized from the same `narrativePrompt`.

This makes the UI simple, but it underuses the fact that each 15s multi-shot segment is actually a 4-9 shot cinematic unit. The next upgrade should make the LLM produce a real cinematic plan, then derive separate prompts for concept/reference image, storyboard board, and final video generation.

## Current Flow

### LLM Step

- The script page submits `SCRIPT_TO_STORYBOARD_RUN` through `script-to-storyboard-stream`.
- Multi-shot episodes branch into `handleMultiShotScriptToStoryboardTask(...)`.
- Each coarse script clip builds a prompt with `PROMPT_IDS.NP_MULTI_SHOT_SEGMENTATION`.
- The prompt template lives at `lib/prompts/novel-promotion/multi_shot_segmentation.zh.txt`.
- The model is called once per coarse clip with action `multi_shot_storyboard`.

### Current Output Schema

The LLM currently returns:

```json
{
  "segments": [
    {
      "segmentIndexWithinClip": 1,
      "title": "片段标题",
      "sceneLabel": "场景标签",
      "narrativePrompt": "一整段中文 cinematic 主提示词",
      "embeddedDialogue": "少量需要嵌入动作过程里的台词，没有则填空字符串",
      "shotRhythmGuidance": "简洁说明这个 15 秒子片段内部的镜头节奏推进",
      "expectedShotCount": 4
    }
  ]
}
```

### Current Persistence

`mergeClipSegments(...)` maps the LLM row into an `EpisodeMultiShotDraft`:

- `narrativePrompt` -> draft `narrativePrompt`
- `embeddedDialogue` -> draft `embeddedDialogue`
- `shotRhythmGuidance` -> draft `shotRhythmGuidance`
- `expectedShotCount` -> `grid-4` / `grid-6` / `grid-9`
- `groupPrompt = narrativePrompt`
- `videoPrompt = narrativePrompt`

`persistEpisodeMultiShotDrafts(...)` then stores:

- `groupPrompt` on `NovelPromotionShotGroup.groupPrompt`
- `videoPrompt` on `NovelPromotionShotGroup.videoPrompt`
- core draft metadata inside `videoReferencesJson`
- default shot-group items with titles only; per-slot prompt text is not populated by the multi-shot LLM today

### Current Downstream Prompt Composition

- Reference image prompt: `buildShotGroupReferencePrompt(...)` uses `draftMetadata.referencePromptText || group.groupPrompt || fallback`.
- Storyboard board prompt: `buildShotGroupCompositePrompt(...)` uses `draftMetadata.compositePromptText || group.groupPrompt || fallback`, plus template and ordered slots.
- Video prompt: `buildShotGroupVideoPrompt(...)` uses `group.videoPrompt || group.groupPrompt || fallback`, plus audio/dialogue/reference strategy and ordered slots.

## Main Design Gap

The current segmentation prompt says “be cinematic”, but it does not force the model to produce structured cinematic decisions. It produces readable prose rather than a production plan.

A better multi-shot segment should explicitly answer:

- What should the viewer feel?
- Where is the viewer positioned: observing, stalking, trapped, superior, vulnerable?
- Who has power in the scene, and does that power shift?
- What are the 4-9 internal shot beats?
- For each beat: shot size, angle, movement, composition, lighting, blocking, emotional effect, and image prompt.
- Which parts should feed concept/reference image generation vs storyboard board generation vs video generation?

## Proposed Target Schema

Add fields while keeping the existing fields valid:

```json
{
  "segments": [
    {
      "segmentIndexWithinClip": 1,
      "title": "深夜书房里的异常清单",
      "sceneLabel": "李默公寓书房",
      "narrativePrompt": "兼容旧链路的一段主剧情提示词",
      "referencePrompt": "用于生成辅助参考图/母图的概念图提示词",
      "storyboardPrompt": "用于生成分镜参考表的总剧情提示词",
      "videoPrompt": "用于最终15秒多镜头视频的连续动作提示词",
      "embeddedDialogue": "李哥: ...",
      "shotRhythmGuidance": "0-3s 建立空间；3-7s 推近；7-12s 压迫；12-15s 留钩子",
      "expectedShotCount": 6,
      "emotionalIntent": {
        "dominantMood": "压抑、窥视、失控边缘",
        "audienceFeeling": "观众像站在门缝外偷看，知道危险正在逼近",
        "powerDynamic": "角色表面掌控资料，实际被异常线索反向控制",
        "tensionCurve": "安静 -> 疑惑 -> 被注视感 -> 压迫钩子"
      },
      "visualStrategy": {
        "colorAndLight": "台灯暖光与窗外冷蓝光冲突，低调光，半边脸进入阴影",
        "compositionMotif": "门框/屏幕/文件夹形成框中框，前景遮挡制造窥视感",
        "cameraMotif": "从客观远景逐步进入主观近景，最后用特写压住呼吸"
      },
      "shots": [
        {
          "index": 1,
          "durationSec": 2,
          "title": "建立书房空间",
          "shotSize": "wide shot / 全景",
          "angle": "slightly high angle / 轻微俯视",
          "cameraMovement": "slow push-in / 缓慢推进",
          "composition": "人物被书架和桌面文件夹夹在画面中央，负空间压在头顶",
          "lighting": "台灯形成局部暖光，窗外城市冷光压暗背景",
          "blocking": "李默坐在桌前，手停在文件夹边缘，身体微微前倾",
          "emotionalBeat": "建立孤立、安静但不安全的空间",
          "imagePrompt": "深夜书房全景，人物被文件和书架包围，台灯暖光与窗外冷光对撞，轻微俯视，负空间压迫"
        }
      ]
    }
  ]
}
```

## Prompt Derivation Strategy

### Reference Prompt

Purpose: generate one concept/reference mother image, not a board.

Recommended source:

- `referencePrompt` if present
- else synthesize from `narrativePrompt + emotionalIntent + visualStrategy`
- else current fallback

Content should emphasize:

- character identity, wardrobe, location, props
- key emotional atmosphere
- lighting and color contrast
- single representative cinematic keyframe
- no storyboard grid, no captions, no UI

### Storyboard Prompt

Purpose: generate one 4/6/9-cell storyboard board.

Recommended source:

- `storyboardPrompt` if present
- plus template instruction
- plus `shots[].imagePrompt` as ordered slots
- plus `shotRhythmGuidance`, `emotionalIntent`, and asset/mood constraints

Content should emphasize:

- each grid slot is distinct
- slot order forms a 15s progression
- every shot keeps identity, wardrobe, location, prop, and lighting continuity
- each slot follows shot size / angle / camera / composition / lighting / blocking

### Video Prompt

Purpose: generate one coherent 15s multi-shot video.

Recommended source:

- `videoPrompt` if present
- plus compressed shot sequence from `shots[]`
- plus dialogue timing and reference mode strategy

Content should emphasize:

- continuous motion across shot beats
- camera movement and transitions
- performance, gaze, body rhythm, object interaction
- audio/dialogue policy
- no multiple clips; one coherent video

## Implementation Plan

### Step 1: Prompt Template Upgrade Only

Modify `lib/prompts/novel-promotion/multi_shot_segmentation.zh.txt` to request the richer schema. Keep old fields mandatory, add new fields optional-but-expected.

Compatibility rule: if the model omits new fields, current behavior remains unchanged.

### Step 2: Extend Draft Types

Extend `EpisodeMultiShotDraft` in `src/lib/novel-promotion/multi-shot/episode-draft-builder.ts` with optional fields:

- `referencePromptText?: string | null`
- `compositePromptText?: string | null`
- `cinematicPlan?: ...`
- `shotItems?: Array<{ itemIndex; title; prompt }>`

### Step 3: Parse New LLM Fields

Extend `mergeClipSegments(...)` in `src/lib/workers/handlers/script-to-storyboard-multi-shot.ts`:

- read `referencePrompt` / `reference_prompt`
- read `storyboardPrompt` / `storyboard_prompt`
- read `videoPrompt` / `video_prompt`
- read `emotionalIntent`, `visualStrategy`, `shots`
- fallback all missing text to `narrativePrompt`

### Step 4: Persist Prompt Specialization

Update `persistEpisodeMultiShotDrafts(...)`:

- write `draft.referencePromptText` into draft metadata `referencePromptText`
- write `draft.compositePromptText` into draft metadata `compositePromptText`
- use `draft.videoPrompt || draft.narrativePrompt` for `NovelPromotionShotGroup.videoPrompt`
- create shot-group items with `shots[].title` and `shots[].imagePrompt` where available

### Step 5: Strengthen Downstream Builders

Update `src/lib/shot-group/prompt.ts`:

- Reference builder: use cinematic intent and visual strategy when present, but keep it as one concept image.
- Composite builder: explicitly instruct the model to follow `Ordered slots` as shot-level commands.
- Video builder: convert ordered slots into a 15s beat sequence and preserve professional camera language.

### Step 6: Add Tests

Add or extend tests around:

- LLM row parsing with new schema and fallback behavior
- shot item prompt persistence
- review UI seed values: `referencePromptText` and `compositePromptText` no longer identical when the model provides specialized text
- final composite/video prompt includes ordered shot prompts

## Suggested Prompt Template Additions

Add a section like this to the Chinese template:

```text
【影视专业设计要求】
每个子片段不是普通剧情摘要，而是一个 15 秒、由 4-9 个镜头组成的影视镜头组。你必须先判断这个子片段要让观众产生什么感受，再反推镜头策略。

请为每个子片段明确：
- 情绪目标：紧张、窥视、失控、掌控、渺小、脆弱、强大、压迫、释放等
- 观众位置：旁观、跟随、偷看、被困、上帝视角、角色主观视角等
- 权力关系：谁掌控局面，谁被压迫，权力是否发生反转
- 镜头推进：景别如何从远到近或从近到远，是否使用俯拍、仰拍、过肩、主观镜头、遮挡视角
- 运镜：推进、拉远、横移、跟拍、手持微晃、静止压迫、快速切换
- 构图：负空间、框中框、前景遮挡、对称压迫、纵深压缩、三分法
- 打光：低调光、逆光、硬光、冷暖冲突、半边脸阴影、环境 practical light
- 场面调度：人物站位、视线方向、移动路线、道具触发点
```

Then require `shots[]`:

```text
shots 必须刚好输出 expectedShotCount 个镜头，每个镜头包含：
index, durationSec, title, shotSize, angle, cameraMovement, composition, lighting, blocking, emotionalBeat, imagePrompt。
imagePrompt 必须是可直接用于分镜格子的图像生成提示词。
```

## Rollout Strategy

Use a staged rollout to avoid breaking current projects:

1. Prompt-only experiment on a branch or quick task.
2. Add parser support while still tolerating old schema.
3. Persist shot item prompts behind fallback logic.
4. Update downstream prompt builders.
5. Add a debug/log artifact to inspect generated cinematic plans before enabling by default.

## Open Decisions

1. Should `shots[]` become part of public editable UI, or stay hidden as generation metadata first?
2. Should `referencePrompt`, `storyboardPrompt`, and `videoPrompt` be visibly separate in the review UI, or should the UI keep two fields and derive video prompt later?
3. Should cinematic vocabulary be fixed in the prompt, or should project-level presets exist, e.g. `悬疑窥视`, `强掌控`, `脆弱孤立`, `动作压迫`?
4. Should each shot get an editable duration, or should duration remain implicit by slot count?

## Recommendation

Implement this as a small inserted phase before Phase 4, e.g. `03.1 Multi-Shot Cinematic Prompting`, because it changes the product quality of the core multi-shot flow but does not belong to final hardening. The safest first implementation is:

1. Upgrade LLM prompt schema.
2. Parse and persist specialized prompt fields.
3. Populate shot-group item prompts from `shots[].imagePrompt`.
4. Leave UI mostly unchanged except that `辅助参考图提示词` and `剧情内容` now seed from distinct fields.
5. Add tests proving old-output compatibility.
