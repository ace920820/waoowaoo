import { describe, expect, it } from 'vitest'
import { persistVideoPromptRunAtomically } from '@/lib/remake-projects/prompt/service'

const projectId = '11111111-1111-4111-8111-111111111111'

describe('remake prompt service transaction boundary', () => {
  it('rejects duplicate or partial stable Shot results before a video fan-out transaction opens', async () => {
    const result = {
      stableShotId: 'stable-a',
      analysis: {
        coreEvent: 'A runner crosses the street.',
        actions: ['run'],
        interactions: ['avoid traffic'],
        directions: ['left to right'],
        blocking: 'runner in foreground',
        shotScale: 'medium-wide',
        camera: 'eye level',
        movement: 'tracking',
        rhythm: 'urgent',
        environmentChange: 'rain begins',
        temporalProgression: 'cross then exit',
      },
    }

    await expect(persistVideoPromptRunAtomically({
      projectId,
      expectedStableShotIds: ['stable-a', 'stable-b'],
      results: [result, result],
      provenance: { schemaVersion: 'prompt@1' },
    })).rejects.toThrow('REMAKE_PROMPT_VIDEO_RESULT_INVALID')
  })
})
