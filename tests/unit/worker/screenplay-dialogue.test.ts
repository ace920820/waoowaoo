import { describe, expect, it } from 'vitest'
import {
  buildVoiceAnalysisDialogueSource,
  extractScreenplayDialogueItems,
  mergeVoiceAnalysisWithScreenplay,
} from '@/lib/novel-promotion/screenplay-dialogue'

describe('screenplay dialogue helpers', () => {
  it('extracts dialogue and voiceover items in screenplay order', () => {
    const items = extractScreenplayDialogueItems([
      {
        id: 'clip-1',
        screenplay: JSON.stringify({
          scenes: [
            {
              scene_number: 1,
              content: [
                { type: 'action', text: 'walks in' },
                { type: 'dialogue', character: 'Hero', lines: '第一句台词' },
                { type: 'voiceover', text: '旁白一句' },
              ],
            },
          ],
        }),
      },
    ])

    expect(items).toEqual([
      expect.objectContaining({ lineIndex: 1, clipId: 'clip-1', type: 'dialogue', speaker: 'Hero', content: '第一句台词' }),
      expect.objectContaining({ lineIndex: 2, clipId: 'clip-1', type: 'voiceover', speaker: '旁白', content: '旁白一句' }),
    ])
  })

  it('prefers screenplay dialogue over novel text when available', () => {
    const source = buildVoiceAnalysisDialogueSource({
      novelText: '这是小说原文里的不同台词',
      clips: [
        {
          id: 'clip-1',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 2,
                content: [
                  { type: 'dialogue', character: 'Hero', lines: '按剧本说这句' },
                ],
              },
            ],
          }),
        },
      ],
    })

    expect(source.source).toBe('screenplay')
    expect(source.input).toContain('按剧本说这句')
    expect(source.input).not.toContain('这是小说原文里的不同台词')
  })

  it('falls back to novel text when screenplay coverage is partial', () => {
    const source = buildVoiceAnalysisDialogueSource({
      novelText: '这里的小说正文应该兜底',
      clips: [
        {
          id: 'clip-1',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 1,
                content: [
                  { type: 'dialogue', character: 'Hero', lines: '只有一部分片段有合格剧本' },
                ],
              },
            ],
          }),
        },
        {
          id: 'clip-2',
          screenplay: null,
        },
      ],
    })

    expect(source.source).toBe('novelText')
    expect(source.input).toBe('这里的小说正文应该兜底')
    expect(source.dialogueItems).toEqual([])
  })

  it('falls back to novel text when any screenplay payload is malformed', () => {
    const source = buildVoiceAnalysisDialogueSource({
      novelText: '小说正文作为安全兜底',
      clips: [
        {
          id: 'clip-1',
          screenplay: JSON.stringify({
            scenes: [
              {
                scene_number: 1,
                content: [
                  { type: 'dialogue', character: 'Hero', lines: '这句不能单独决定数据源' },
                ],
              },
            ],
          }),
        },
        {
          id: 'clip-2',
          screenplay: '{bad json',
        },
      ],
    })

    expect(source.source).toBe('novelText')
    expect(source.input).toBe('小说正文作为安全兜底')
    expect(source.dialogueItems).toEqual([])
  })

  it('reconciles AI rows back to structured screenplay dialogue', () => {
    const merged = mergeVoiceAnalysisWithScreenplay(
      [
        {
          lineIndex: 1,
          speaker: 'Wrong Speaker',
          content: 'wrong content',
          emotionStrength: 0.4,
          matchedPanel: { storyboardId: 'storyboard-1', panelIndex: 0 },
        },
      ],
      [
        {
          clipId: 'clip-1',
          lineIndex: 1,
          sceneNumber: 1,
          sceneIndex: 0,
          contentIndex: 0,
          type: 'dialogue',
          speaker: 'Hero',
          content: '剧本里的正确台词',
          parenthetical: null,
        },
        {
          clipId: 'clip-1',
          lineIndex: 2,
          sceneNumber: 1,
          sceneIndex: 0,
          contentIndex: 1,
          type: 'dialogue',
          speaker: 'Sidekick',
          content: '第二句也要保留',
          parenthetical: null,
        },
      ],
    )

    expect(merged).toEqual([
      {
        lineIndex: 1,
        speaker: 'Hero',
        content: '剧本里的正确台词',
        emotionStrength: 0.4,
        matchedPanel: { storyboardId: 'storyboard-1', panelIndex: 0 },
      },
      {
        lineIndex: 2,
        speaker: 'Sidekick',
        content: '第二句也要保留',
        emotionStrength: 0.1,
        matchedPanel: null,
      },
    ])
  })
})
