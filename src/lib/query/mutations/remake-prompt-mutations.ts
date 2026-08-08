'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { requestJsonWithError } from './mutation-shared'

type PromptAnalyzeInput =
  | { kind: 'image'; shotId: string; slot: 'start' | 'middle' | 'end'; operationKey: string }
  | { kind: 'video'; operationKey: string }

function usePromptRefresh(projectId: string, trackId?: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.remake.snapshot(projectId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.project.data(projectId) })
    if (trackId) void queryClient.invalidateQueries({ queryKey: queryKeys.remake.track(projectId, trackId), exact: false })
  }
}

export function useAnalyzeRemakePrompt(projectId: string) {
  const refresh = usePromptRefresh(projectId)
  return useMutation({
    mutationFn: async (payload: PromptAnalyzeInput) => await requestJsonWithError<{ taskId: string; status: string }>(
      `/api/remake-projects/${projectId}/prompts/analyze`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      'Failed to submit prompt analysis',
    ),
    onSuccess: refresh,
  })
}

export function useSaveRemakePromptVersion(projectId: string, trackId: string) {
  const refresh = usePromptRefresh(projectId, trackId)
  return useMutation({
    mutationFn: async (payload: { sourceVersionId?: string; coreText: string; negativeConstraints?: string[] }) => await requestJsonWithError<{ version: { id: string; versionNumber: number; reviewStatus: string } }>(
      `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      'Failed to save prompt version',
    ),
    onSuccess: refresh,
  })
}

export function useApproveAndAdoptRemakePrompt(projectId: string, trackId: string) {
  const refresh = usePromptRefresh(projectId, trackId)
  return useMutation({
    mutationFn: async (versionId: string) => await requestJsonWithError<{ track: { id: string; adoptedVersionId: string } }>(
      `/api/remake-projects/${projectId}/prompts/tracks/${trackId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }) },
      'Failed to approve prompt version',
    ),
    onSuccess: refresh,
  })
}
