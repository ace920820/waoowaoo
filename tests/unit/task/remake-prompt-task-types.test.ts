import { describe, expect, it } from 'vitest'
import { resolveTaskIntent } from '@/lib/task/intent'
import { TASK_TYPE } from '@/lib/task/types'

describe('remake prompt task types', () => {
  it('classifies image and video prompt analysis as analysis tasks', () => {
    expect(resolveTaskIntent(TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE)).toBe('analyze')
    expect(resolveTaskIntent(TASK_TYPE.REMAKE_VIDEO_PROMPT_ANALYZE)).toBe('analyze')
  })
})
