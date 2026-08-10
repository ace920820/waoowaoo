import { describe, expect, it } from 'vitest'
import { REMAKE_WORKBENCH_STAGES, isRemakeWorkbenchStage } from '@/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench'
import { eligibleKeyframeShotCount } from '@/lib/remake-projects/keyframes/adapter'

describe('Remake keyframe navigation', () => {
  it('keeps every production stage directly addressable', () => {
    expect(REMAKE_WORKBENCH_STAGES).toEqual(['overview', 'scenedetect', 'prompt', 'storyboard', 'video'])
    expect(isRemakeWorkbenchStage('storyboard')).toBe(true)
    expect(isRemakeWorkbenchStage('video')).toBe(true)
  })

  it('counts eligible image slots without selecting or generating them', () => {
    expect(eligibleKeyframeShotCount([
      { slots: { start: { eligible: true }, middle: { eligible: false }, end: { eligible: false } } },
      { slots: { start: { eligible: false }, middle: { eligible: false }, end: { eligible: false } } },
    ] as never)).toEqual({ eligible: 1, total: 2 })
  })
})
