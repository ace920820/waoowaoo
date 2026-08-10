'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '../keys'

async function request<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'Remake keyframe request failed')
  return payload as T
}

function useSnapshotRefetch(projectId: string) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.remake.snapshot(projectId) })
    await queryClient.refetchQueries({ queryKey: queryKeys.remake.snapshot(projectId), type: 'active' })
  }
}

export function useSetRemakeKeyframeSelection(projectId: string) {
  const refetch = useSnapshotRefetch(projectId)
  return useMutation({
    mutationFn: (input: { shotId: string; slot: 'start' | 'middle' | 'end'; selectedForGeneration: boolean }) =>
      request(`/api/remake-projects/${projectId}/keyframes`, { action: 'select', ...input }),
    onSuccess: refetch,
  })
}

export function useGenerateRemakeKeyframe(projectId: string) {
  const refetch = useSnapshotRefetch(projectId)
  return useMutation({
    mutationFn: (input: { shotId: string; slot: 'start' | 'middle' | 'end'; operationKey: string; count: number; model: string; options?: Record<string, unknown>; referenceMediaIds?: string[] }) =>
      request(`/api/remake-projects/${projectId}/keyframes`, { action: 'generate', options: {}, referenceMediaIds: [], ...input }),
    onSuccess: refetch,
  })
}

export function useAdoptRemakeKeyframeCandidate(projectId: string) {
  const refetch = useSnapshotRefetch(projectId)
  return useMutation({
    mutationFn: ({ trackId, candidateId }: { trackId: string; candidateId: string }) =>
      request(`/api/remake-projects/${projectId}/keyframes/tracks/${trackId}`, { action: 'adopt', candidateId }),
    onSuccess: refetch,
  })
}

// Concise aliases used by the Remake page adapters.
export const useSelectRemakeKeyframe = useSetRemakeKeyframeSelection
export const useAdoptRemakeKeyframe = useAdoptRemakeKeyframeCandidate
