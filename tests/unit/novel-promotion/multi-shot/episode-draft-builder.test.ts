import { describe, expect, it } from 'vitest'
import { buildEpisodeMultiShotDrafts } from '@/lib/novel-promotion/multi-shot/episode-draft-builder'
import { mergeClipSegments } from '@/lib/workers/handlers/script-to-storyboard-multi-shot'
import type { NovelPromotionClip } from '@/types/project'

function buildClip(overrides?: Partial<NovelPromotionClip>): NovelPromotionClip {
  return {
    id: 'clip-1',
    start: 0,
    summary: '主角在雨夜追上失联同伴',
    location: '雨夜街口',
    characters: '林夏, 周沉',
    props: '雨伞, 手机',
    content: '林夏穿过夜色与车流，在街口拦住转身离开的周沉。',
    screenplay: null,
    shotCount: 4,
    ...(overrides || {}),
  }
}

describe('buildEpisodeMultiShotDrafts', () => {
  it('maps 3 shots to grid-4 and preserves expected shot count', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-3',
          duration: 15,
          shotCount: 3,
        }),
      ],
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      templateKey: 'grid-4',
      segmentOrder: 1,
      segmentKey: 'clip-3:1',
      sourceClipId: 'clip-3',
      segmentIndexWithinClip: 1,
      segmentStartSeconds: 0,
      segmentEndSeconds: 15,
      expectedShotCount: 3,
      sourceStatus: 'ready',
    })
  })

  it('maps higher shot counts to the right template and caps expected shots at 9', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({ id: 'clip-6', duration: 15, shotCount: 6 }),
        buildClip({ id: 'clip-11', duration: 15, shotCount: 11 }),
      ],
    })

    expect(drafts[0]).toMatchObject({
      templateKey: 'grid-6',
      expectedShotCount: 6,
    })
    expect(drafts[1]).toMatchObject({
      templateKey: 'grid-9',
      expectedShotCount: 9,
    })
  })

  it('builds eight drafts from 2 coarse clips and keeps segmentOrder in sequence', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-1',
          start: 0,
          end: 60,
          duration: 60,
        }),
        buildClip({
          id: 'clip-2',
          start: 60,
          end: 120,
          duration: 60,
          summary: '第二段在天桥继续推进真相冲突',
          location: '夜色天桥',
          content: '两人走上空旷天桥，周沉终于开口承认隐瞒的原因。',
        }),
      ],
    })

    expect(drafts).toHaveLength(8)
    expect(drafts.map((draft) => draft.segmentOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(drafts.filter((draft) => draft.sourceClipId === 'clip-1')).toHaveLength(4)
    expect(drafts.filter((draft) => draft.sourceClipId === 'clip-2')).toHaveLength(4)
  })

  it('includes stable segment identity and 15-second windows for derived segments', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-window',
          start: 0,
          end: 60,
          duration: 60,
        }),
      ],
    })

    expect(drafts).toHaveLength(4)
    expect(drafts[0]).toMatchObject({
      segmentKey: 'clip-window:1',
      sourceClipId: 'clip-window',
      segmentIndexWithinClip: 1,
      segmentStartSeconds: 0,
      segmentEndSeconds: 15,
    })
    expect(drafts[3]).toMatchObject({
      segmentKey: 'clip-window:4',
      sourceClipId: 'clip-window',
      segmentIndexWithinClip: 4,
      segmentStartSeconds: 45,
      segmentEndSeconds: 60,
    })
  })

  it('embeds screenplay dialogue as speaker lines and keeps model-ready prompt text', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-dialogue',
          start: 0,
          end: 15,
          duration: 15,
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 7,
                content: [
                  { type: 'dialogue', character: '林夏', lines: '别再躲我了。' },
                  { type: 'dialogue', character: '周沉', lines: '我怕你知道真相。' },
                  { type: 'dialogue', character: '林夏', lines: '今晚你必须说清楚。' },
                  { type: 'dialogue', character: '周沉', lines: '再往前一步你就回不了头。' },
                ],
              },
            ],
          }),
        }),
      ],
    })

    expect(drafts[0].includeDialogue).toBe(true)
    expect(drafts[0].embeddedDialogue).toContain('林夏: 别再躲我了。')
    expect(drafts[0].embeddedDialogue).toContain('周沉: 我怕你知道真相。')
    expect(drafts[0].narrativePrompt).toContain('当前是这个大片段的第 1/1 个 15 秒多镜头子片段')
    expect(drafts[0].narrativePrompt).toContain('镜头')
    expect(drafts[0].groupPrompt).toContain('当动作推进到关键节点时')
    expect(drafts[0].shotRhythmGuidance).toContain('第 1/1 个 15 秒片段')
  })

  it('splits one coarse clip into four distinct cinematic subsegment prompts', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-arc',
          start: 0,
          end: 60,
          duration: 60,
          summary: '托尼在机场追查黑色汽车与可疑公文包',
          location: '机场内部-白天',
          characters: '托尼, 司机, 副驾驶',
          props: '公文包, 黑色汽车',
          content: '镜头从候机大厅外推进到停机坪通道，托尼发现一辆黑色汽车异常靠近。'
            + ' 他快步追过去，目光始终锁定副驾驶手中的公文包。'
            + ' 双方在登机口边缘爆发短暂对峙，托尼试图抢下公文包并拦住司机。'
            + ' 混乱之后，镜头收在托尼压住车门、死盯对方反应的瞬间。',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 3,
                content: [
                  { type: 'dialogue', character: '托尼', lines: '把包放下。' },
                  { type: 'dialogue', character: '司机', lines: '你拦不住我们。' },
                  { type: 'dialogue', character: '托尼', lines: '飞机不能起飞。' },
                  { type: 'dialogue', character: '副驾驶', lines: '再晚就来不及了。' },
                ],
              },
            ],
          }),
        }),
      ],
    })

    expect(drafts).toHaveLength(4)
    expect(new Set(drafts.map((draft) => draft.narrativePrompt)).size).toBe(4)
    expect(drafts[0].narrativePrompt).toContain('第 1/4 个 15 秒多镜头子片段')
    expect(drafts[1].narrativePrompt).toContain('第 2/4 个 15 秒多镜头子片段')
    expect(drafts[2].narrativePrompt).toContain('第 3/4 个 15 秒多镜头子片段')
    expect(drafts[3].narrativePrompt).toContain('第 4/4 个 15 秒多镜头子片段')
    expect(drafts[0].narrativePrompt).toContain('机场内部-白天')
    expect(drafts[0].groupPrompt).toContain('黑色汽车')
    expect(drafts.some((draft) => (draft.embeddedDialogue || '').includes('托尼: 把包放下。'))).toBe(true)
    expect(drafts.some((draft) => (draft.embeddedDialogue || '').includes('副驾驶: 再晚就来不及了。'))).toBe(true)
  })

  it('creates placeholder segments for each 15-second slot when a coarse clip has no content', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-missing',
          start: 0,
          end: 60,
          duration: 60,
          content: '   ',
          location: null,
          screenplay: JSON.stringify({
            scenes: [{ scene_number: 5, content: [] }],
          }),
        }),
      ],
    })

    expect(drafts).toHaveLength(4)
    expect(drafts.every((draft) => draft.sourceStatus === 'placeholder')).toBe(true)
    expect(drafts.every((draft) => draft.placeholderReason === 'missing_clip_content')).toBe(true)
    expect(drafts.map((draft) => draft.segmentKey)).toEqual([
      'clip-missing:1',
      'clip-missing:2',
      'clip-missing:3',
      'clip-missing:4',
    ])
    expect(drafts[0]).toMatchObject({
      sourceClipId: 'clip-missing',
      groupPrompt: null,
      videoPrompt: null,
      sceneLabel: '场景 5',
    })
  })
  it('merges rich cinematic LLM rows while preserving legacy prompt compatibility', () => {
    const [defaultDraft] = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [buildClip({ id: 'clip-rich', duration: 15, shotCount: 4 })],
    })

    const merged = mergeClipSegments({
      segmentDefaults: [defaultDraft],
      generatedRows: [
        {
          segmentIndexWithinClip: 1,
          title: '书房里的异常清单',
          sceneLabel: '深夜书房',
          narrativePrompt: '李默在深夜书房发现异常清单，情绪从冷静转为被窥视般紧张。',
          referencePrompt: '单张深夜书房概念图，台灯暖光与窗外冷光冲突，人物被文件夹包围。',
          storyboardPrompt: '四格分镜参考表，展示从空间建立到异常清单特写的压迫递进。',
          videoPrompt: '15秒连续视频，镜头从书房全景缓慢推进到李默眼神与清单特写。',
          embeddedDialogue: '李默: 这不是普通档案。',
          shotRhythmGuidance: '0-3s 建立空间；3-7s 推近；7-12s 特写；12-15s 留钩子。',
          expectedShotCount: 4,
          emotionalIntent: {
            dominantMood: '压抑、窥视',
            audienceFeeling: '观众像站在门缝外偷看',
          },
          visualStrategy: {
            colorAndLight: '台灯暖光与窗外冷光冲突',
            compositionMotif: '框中框与负空间',
          },
          shots: [
            {
              index: 1,
              durationSec: 3,
              title: '建立书房',
              shotSize: '全景',
              angle: '轻微俯视',
              cameraMovement: '缓慢推进',
              composition: '门框形成前景遮挡',
              lighting: '低调光',
              blocking: '李默坐在桌前',
              emotionalBeat: '孤立感',
              imagePrompt: '深夜书房全景，门框遮挡，李默被文件包围，低调光。',
            },
          ],
        },
      ],
    })

    expect(merged[0]).toMatchObject({
      sourceStatus: 'ready',
      title: '书房里的异常清单',
      sceneLabel: '深夜书房',
      referencePromptText: '单张深夜书房概念图，台灯暖光与窗外冷光冲突，人物被文件夹包围。',
      compositePromptText: '四格分镜参考表，展示从空间建立到异常清单特写的压迫递进。',
      groupPrompt: '四格分镜参考表，展示从空间建立到异常清单特写的压迫递进。',
      videoPrompt: '15秒连续视频，镜头从书房全景缓慢推进到李默眼神与清单特写。',
    })
    expect(merged[0].cinematicPlan?.emotionalIntent).toMatchObject({ dominantMood: '压抑、窥视' })
    expect(merged[0].shotItems).toHaveLength(1)
    expect(merged[0].shotItems?.[0]).toMatchObject({
      itemIndex: 0,
      title: '建立书房',
      prompt: '深夜书房全景，门框遮挡，李默被文件包围，低调光。',
      shotSize: '全景',
      cameraMovement: '缓慢推进',
    })
  })

})
