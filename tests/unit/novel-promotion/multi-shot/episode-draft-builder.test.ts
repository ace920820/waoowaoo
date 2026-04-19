import { describe, expect, it } from 'vitest'
import { buildEpisodeMultiShotDrafts } from '@/lib/novel-promotion/multi-shot/episode-draft-builder'
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
          shotCount: 3,
        }),
      ],
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      templateKey: 'grid-4',
      segmentOrder: 1,
      expectedShotCount: 3,
      sourceStatus: 'ready',
    })
  })

  it('maps higher shot counts to the right template and caps expected shots at 9', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({ id: 'clip-6', shotCount: 6 }),
        buildClip({ id: 'clip-11', shotCount: 11 }),
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

  it('embeds screenplay dialogue as speaker lines and marks includeDialogue true', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 7,
                content: [
                  { type: 'dialogue', character: '林夏', lines: '别再躲我了。' },
                  { type: 'dialogue', character: '周沉', lines: '我怕你知道真相。' },
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
    expect(drafts[0].groupPrompt).toContain('对白嵌入：')
  })

  it('creates placeholders for clips without content instead of throwing', () => {
    const drafts = buildEpisodeMultiShotDrafts({
      episodeId: 'episode-1',
      clips: [
        buildClip({
          id: 'clip-missing',
          content: '   ',
          location: null,
          screenplay: JSON.stringify({
            scenes: [{ scene_number: 5, content: [] }],
          }),
        }),
      ],
    })

    expect(drafts[0]).toMatchObject({
      clipId: 'clip-missing',
      sourceStatus: 'placeholder',
      placeholderReason: 'missing_clip_content',
      groupPrompt: null,
      videoPrompt: null,
      sceneLabel: '场景 5',
    })
  })
})
