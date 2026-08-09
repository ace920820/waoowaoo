import { describe, expect, it } from 'vitest'
import { normalizeVideoPromptStableShotIds } from '@/lib/remake-projects/prompt/service'

describe('video Prompt stableShotId normalization', () => {
  it('maps a unique external scene ID from Codex back to the manifest stableShotId', () => {
    const stableShotId = 'project-id:analysis-id:scene-15'
    const analysis = { coreEvent: 'A burst of flame fills the frame.' }
    expect(normalizeVideoPromptStableShotIds([stableShotId], [{ stableShotId: 'scene-15', analysis }]))
      .toEqual([{ stableShotId, analysis }])
  })

  it('does not map an ambiguous external scene ID', () => {
    const analysis = { coreEvent: 'Ambiguous.' }
    expect(normalizeVideoPromptStableShotIds(['one:scene-15', 'two:scene-15'], [{ stableShotId: 'scene-15', analysis }]))
      .toEqual([{ stableShotId: 'scene-15', analysis }])
  })
})
