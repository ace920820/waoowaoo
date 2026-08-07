'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { queryKeys } from '../keys'

export type RemakeSnapshot = {
  project: { id: string; name: string; description?: string | null; type: string }
  source: { status: string; mediaId: string | null }
  shots: Array<{
    id: string
    stableKey: string
    sequence: number | null
    reviewStatus: string
    needsReview: boolean
    revisions: Array<{ id: string; revision: number; changeReason: string }>
    provenance: Array<{ id: string; schema: string; executor: string; capability: string }>
  }>
  tasks: Array<{
    id: string
    type: string
    targetType: string
    targetId: string
    status: string
    errorCode?: string | null
    errorMessage?: string | null
    createdAt: string
    updatedAt: string
  }>
}

export function useRemakeProject(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.remake.snapshot(projectId || ''),
    enabled: Boolean(projectId),
    staleTime: 5000,
    queryFn: async (): Promise<RemakeSnapshot> => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/data`)
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(resolveTaskErrorMessage(error, 'Failed to load remake project'))
      }
      const payload = await response.json() as { remake?: RemakeSnapshot }
      if (!payload.remake) throw new Error('Remake project snapshot is unavailable')
      return payload.remake
    },
  })
}

export function useRefreshRemakeProject(projectId: string | null) {
  const queryClient = useQueryClient()
  return () => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.remake.snapshot(projectId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.project.data(projectId) })
    }
  }
}
