import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistEpisodeMultiShotDraftsMock = vi.hoisted(() => vi.fn())
const createArtifactMock = vi.hoisted(() => vi.fn(async () => undefined))
const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/novel-promotion/multi-shot/persist-drafts', () => ({
  persistEpisodeMultiShotDrafts: persistEpisodeMultiShotDraftsMock,
}))

vi.mock('@/lib/run-runtime/service', () => ({
  createArtifact: createArtifactMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/constants', () => ({
  buildCharactersIntroduction: vi.fn(() => '角色介绍'),
}))

import { handleMultiShotScriptToStoryboardTask } from '@/lib/workers/handlers/script-to-storyboard-multi-shot'

describe('script-to-storyboard multi-shot handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistEpisodeMultiShotDraftsMock.mockResolvedValue({
      shotGroups: Array.from({ length: 8 }, (_, index) => ({ id: `shot-group-${index + 1}` })),
      summary: {
        totalSegments: 8,
        createdCount: 8,
        reusedCount: 0,
        placeholderCount: 0,
      },
    })
  })

  it('splits each coarse clip independently into four generated multi-shot segments', async () => {
    const prompts: string[] = []
    const persistedDraftBatches: Array<Array<{ sourceClipId: string; segmentIndexWithinClip: number; narrativePrompt: string | null }>> = []

    persistEpisodeMultiShotDraftsMock.mockImplementation(async ({ drafts }) => {
      persistedDraftBatches.push(drafts)
      return {
        shotGroups: Array.from({ length: drafts.length }, (_, index) => ({ id: `shot-group-${index + 1}` })),
        summary: {
          totalSegments: drafts.length,
          createdCount: drafts.length,
          reusedCount: 0,
          placeholderCount: drafts.filter((item: { sourceStatus: string }) => item.sourceStatus === 'placeholder').length,
        },
      }
    })

    const result = await handleMultiShotScriptToStoryboardTask({
      job: { data: { taskId: 'task-1' } } as never,
      runId: 'run-1',
      episodeId: 'episode-1',
      locale: 'zh',
      clips: [
        {
          id: 'clip-1',
          content: '片段一正文：女主在雨夜街头独自行走，随后停下脚步回望。',
          summary: '片段一摘要',
          characters: '女主',
          location: '都市街道',
          props: null,
          screenplay: null,
          duration: 60,
          shotCount: 4,
          start: 0,
          end: 60,
        },
        {
          id: 'clip-2',
          content: '片段二正文：男人在囚室中压抑呼吸，最终抬头看向铁窗。',
          summary: '片段二摘要',
          characters: '男人',
          location: '水泥囚室',
          props: null,
          screenplay: null,
          duration: 60,
          shotCount: 4,
          start: 60,
          end: 120,
        },
      ],
      novelData: {
        characters: [{ name: '女主' }, { name: '男人' }],
        locations: [{ name: '都市街道', assetKind: 'location' }, { name: '水泥囚室', assetKind: 'location' }],
      },
      runStep: vi.fn(async (meta, prompt) => {
        prompts.push(prompt)
        const isClipOne = prompt.includes('片段一正文')
        const base = isClipOne ? '片段一' : '片段二'
        const scene = isClipOne ? '都市街道' : '水泥囚室'
        return {
          text: JSON.stringify({
            segments: Array.from({ length: 4 }, (_, index) => ({
              segmentIndexWithinClip: index + 1,
              title: `${base}-子片段${index + 1}`,
              sceneLabel: scene,
              narrativePrompt: `${base}专属主提示词-${index + 1}`,
              embeddedDialogue: index === 1 ? `${base}台词` : '',
              shotRhythmGuidance: `${base}节奏-${index + 1}`,
              expectedShotCount: 4,
            })),
          }),
          reasoning: '',
        }
      }),
      assertRunActive: vi.fn(async () => undefined),
    })

    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('片段一正文')
    expect(prompts[0]).not.toContain('片段二正文')
    expect(prompts[1]).toContain('片段二正文')
    expect(prompts[1]).not.toContain('片段一正文')

    const persistedDrafts = persistedDraftBatches[0]
    expect(persistedDrafts).toHaveLength(8)
    expect(persistedDrafts.slice(0, 4).every((item) => item.sourceClipId === 'clip-1')).toBe(true)
    expect(persistedDrafts.slice(4, 8).every((item) => item.sourceClipId === 'clip-2')).toBe(true)
    expect(persistedDrafts.slice(0, 4).map((item) => item.narrativePrompt)).toEqual([
      '片段一专属主提示词-1',
      '片段一专属主提示词-2',
      '片段一专属主提示词-3',
      '片段一专属主提示词-4',
    ])
    expect(persistedDrafts.slice(4, 8).map((item) => item.narrativePrompt)).toEqual([
      '片段二专属主提示词-1',
      '片段二专属主提示词-2',
      '片段二专属主提示词-3',
      '片段二专属主提示词-4',
    ])
    expect(result).toEqual({
      episodeId: 'episode-1',
      shotGroupCount: 8,
      panelCount: 8,
      placeholderCount: 0,
    })
  })
})
