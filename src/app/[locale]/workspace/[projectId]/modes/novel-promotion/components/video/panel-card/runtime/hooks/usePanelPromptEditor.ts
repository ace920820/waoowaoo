import { useCallback, useState } from 'react'

interface UsePanelPromptEditorParams {
  localPrompt: string
  onUpdateLocalPrompt: (value: string) => void
  onSavePrompt: (value: string) => Promise<void>
}

interface PersistPanelPromptEditParams {
  editingPrompt: string
  onUpdateLocalPrompt: (value: string) => void
  onSavePrompt: (value: string) => Promise<void>
  onSaveError?: (error: unknown) => void
}

export const PANEL_PROMPT_SAVE_ERROR_MESSAGE = '保存失败，请重试。'

export async function persistPanelPromptEdit({
  editingPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
  onSaveError,
}: PersistPanelPromptEditParams): Promise<boolean> {
  try {
    await onSavePrompt(editingPrompt)
    onUpdateLocalPrompt(editingPrompt)
    return true
  } catch (error) {
    onSaveError?.(error)
    return false
  }
}

export function usePanelPromptEditor({
  localPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
}: UsePanelPromptEditorParams) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(localPrompt)

  const handleSaveError = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(PANEL_PROMPT_SAVE_ERROR_MESSAGE)
    }
  }, [])

  const handleStartEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(true)
  }, [localPrompt])

  const handleSave = useCallback(async () => {
    const didSave = await persistPanelPromptEdit({
      editingPrompt,
      onUpdateLocalPrompt,
      onSavePrompt,
      onSaveError: handleSaveError,
    })
    if (didSave) {
      setIsEditing(false)
    }
  }, [editingPrompt, handleSaveError, onSavePrompt, onUpdateLocalPrompt])

  const handleCancelEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(false)
  }, [localPrompt])

  return {
    isEditing,
    editingPrompt,
    setEditingPrompt,
    handleStartEdit,
    handleSave,
    handleCancelEdit,
  }
}
