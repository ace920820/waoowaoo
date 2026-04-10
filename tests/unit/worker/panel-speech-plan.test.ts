import { describe, expect, it } from 'vitest'
import {
  attachSpeechPlanToStoryboards,
  buildPanelSpeechPlanPrompt,
  derivePanelSpeechPlan,
} from '@/lib/novel-promotion/panel-speech-plan'

describe('panel speech plan helpers', () => {
  it('derives dialogue mode from screenplay-linked voice lines', () => {
    const speechPlan = derivePanelSpeechPlan({
      panel: {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        srtSegment: '主角说第一句台词',
      },
      clip: {
        id: 'clip-1',
        screenplay: JSON.stringify({
          scenes: [
            {
              scene_number: 1,
              content: [
                { type: 'dialogue', character: 'Hero', lines: '第一句台词' },
              ],
            },
          ],
        }),
      },
      voiceLines: [
        {
          lineIndex: 1,
          speaker: 'Wrong Speaker',
          content: 'wrong content',
          matchedPanelId: 'panel-1',
          matchedStoryboardId: 'storyboard-1',
          matchedPanelIndex: 0,
        },
      ],
    })

    expect(speechPlan).toMatchObject({
      mode: 'dialogue',
      source: 'screenplay_voice_lines',
      primaryText: '第一句台词',
      speakers: ['Hero'],
    })
  })

  it('derives voiceover mode from screenplay text when panel mapping exists without voice lines', () => {
    const speechPlan = derivePanelSpeechPlan({
      panel: {
        storyboardId: 'storyboard-1',
        panelIndex: 1,
        srtSegment: '旁白一句',
      },
      clip: {
        id: 'clip-1',
        screenplay: JSON.stringify({
          scenes: [
            {
              scene_number: 1,
              content: [
                { type: 'voiceover', text: '旁白一句' },
              ],
            },
          ],
        }),
      },
      voiceLines: [],
    })

    expect(speechPlan.mode).toBe('voiceover')
    expect(speechPlan.source).toBe('screenplay_panel_match')
  })

  it('falls back to silent when screenplay provides no speech for a panel', () => {
    const speechPlan = derivePanelSpeechPlan({
      panel: {
        storyboardId: 'storyboard-1',
        panelIndex: 2,
        srtSegment: '人物沉默地看向窗外',
      },
      clip: {
        id: 'clip-1',
        screenplay: JSON.stringify({
          scenes: [
            {
              scene_number: 1,
              content: [
                { type: 'action', text: '人物沉默地看向窗外' },
              ],
            },
          ],
        }),
      },
      voiceLines: [],
    })

    expect(speechPlan).toEqual({
      mode: 'silent',
      source: 'none',
      generatedAudioRequired: true,
      primaryText: null,
      speakers: [],
      lines: [],
    })
  })

  it('attaches speech plans to storyboard panels and builds structured prompt text', () => {
    const [storyboard] = attachSpeechPlanToStoryboards({
      storyboards: [
        {
          id: 'storyboard-1',
          clip: {
            id: 'clip-1',
            screenplay: JSON.stringify({
              scenes: [
                {
                  scene_number: 1,
                  content: [
                    { type: 'dialogue', character: 'Hero', lines: '你终于来了。' },
                  ],
                },
              ],
            }),
          },
          panels: [
            {
              id: 'panel-1',
              storyboardId: 'storyboard-1',
              panelIndex: 0,
              srtSegment: '你终于来了。',
            },
          ],
        },
      ],
    })

    expect(storyboard.panels[0].speechPlan.mode).toBe('dialogue')

    const prompt = buildPanelSpeechPlanPrompt({
      basePrompt: 'Cinematic close-up of the hero.',
      speechPlan: storyboard.panels[0].speechPlan,
    })

    expect(prompt).toContain('[Structured Speech Plan]')
    expect(prompt).toContain('mode=dialogue')
    expect(prompt).toContain('Hero')
    expect(prompt).toContain('你终于来了。')
  })
})
