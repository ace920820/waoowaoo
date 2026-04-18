import { describe, expect, it, vi } from 'vitest'
import {
  persistVideoPromptUpdate,
} from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPromptState'
import {
  PANEL_PROMPT_SAVE_ERROR_MESSAGE,
  persistPanelPromptEdit,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelPromptEditor'

describe('video prompt save failure handling', () => {
  it('rethrows video prompt save failures after logging them', async () => {
    const error = new Error('save failed')
    const onUpdateVideoPrompt = vi.fn().mockRejectedValue(error)
    const logError = vi.fn()

    await expect(persistVideoPromptUpdate({
      onUpdateVideoPrompt,
      storyboardId: 'sb-1',
      panelIndex: 0,
      value: 'new prompt',
      field: 'dialogueOverride',
      logError,
    })).rejects.toThrow('save failed')

    expect(logError).toHaveBeenCalledWith('保存视频提示词失败:', error)
  })

  it('keeps the edit local state unchanged and surfaces a save failure', async () => {
    const onSavePrompt = vi.fn().mockRejectedValue(new Error('save failed'))
    const onUpdateLocalPrompt = vi.fn()
    const onSaveError = vi.fn((error: unknown) => {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('save failed')
    })

    await expect(persistPanelPromptEdit({
      editingPrompt: 'new prompt',
      onUpdateLocalPrompt,
      onSavePrompt,
      onSaveError,
    })).resolves.toBe(false)

    expect(onUpdateLocalPrompt).not.toHaveBeenCalled()
    expect(onSaveError).toHaveBeenCalledTimes(1)
    expect(PANEL_PROMPT_SAVE_ERROR_MESSAGE).toBe('保存失败，请重试。')
  })
})
