import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'

describe('SceneDetect worker task wiring', () => {
  it('keeps both operations in the text task catalog', () => {
    expect(TASK_TYPE.SCENEDETECT_ANALYZE).toBe('scenedetect_analyze')
    expect(TASK_TYPE.SCENEDETECT_EXTRACT_KEYFRAMES).toBe('scenedetect_extract_keyframes')
  })
})
