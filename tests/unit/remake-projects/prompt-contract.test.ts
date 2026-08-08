import { describe, expect, it } from 'vitest'
import {
  IMAGE_PROMPT_TARGET_KEYS,
  imagePromptAnalysisSchema,
  promptTargetKeySchema,
  videoPromptAnalysisSchema,
} from '@/lib/remake-projects/prompt/contracts'

describe('remake prompt contracts', () => {
  it('preserves every image Skill section and stable generation fields', () => {
    const parsed = imagePromptAnalysisSchema.parse({
      analysisBasis: {
        visibleFacts: ['one person at frame center'],
        photographicInferences: ['medium depth of field'],
        generationRecommendations: ['35mm equivalent'],
      },
      structuredPrompt: {
        cameraAndComposition: { framing: 'medium shot' },
        depthAndImaging: { depthOfField: 'medium' },
        subjects: [{ identity: 'person', action: 'walking' }],
        sceneAndSpace: { setting: 'street' },
        lighting: { keyLight: 'soft side light' },
        colorAndStyle: { palette: 'muted blue' },
      },
      integratedGenerationPrompt: 'Medium shot of a person walking down a muted blue street.',
      negativeConstraints: ['no extra limbs', 'do not reverse walking direction'],
      pendingQuestions: ['Exact focal length is not visible.'],
    })

    expect(parsed.integratedGenerationPrompt).toContain('Medium shot')
    expect(parsed.negativeConstraints).toContain('no extra limbs')
    expect(parsed.structuredPrompt.subjects[0]?.action).toBe('walking')
    expect(Object.keys(parsed.structuredPrompt)).toEqual([
      'cameraAndComposition',
      'depthAndImaging',
      'subjects',
      'sceneAndSpace',
      'lighting',
      'colorAndStyle',
    ])
  })

  it('accepts only stable image-slot and video track keys', () => {
    expect(IMAGE_PROMPT_TARGET_KEYS).toEqual(['image:start', 'image:middle', 'image:end'])
    expect(promptTargetKeySchema.parse('video')).toBe('video')
    expect(() => promptTargetKeySchema.parse('image:unknown')).toThrow()
  })

  it('requires an editable video core event and structured shot direction', () => {
    const parsed = videoPromptAnalysisSchema.parse({
      coreEvent: 'The runner crosses the street and looks back.',
      actions: ['run', 'look back'],
      interactions: ['runner avoids a car'],
      directions: ['move left to right'],
      blocking: 'runner remains in foreground',
      shotScale: 'medium-wide',
      camera: 'eye level',
      movement: 'tracking left',
      rhythm: 'urgent',
      environmentChange: 'rain begins',
      temporalProgression: 'cross -> glance back -> exit frame',
    })

    expect(parsed.coreEvent).toContain('runner')
    expect(parsed.temporalProgression).toContain('exit frame')
  })
})
