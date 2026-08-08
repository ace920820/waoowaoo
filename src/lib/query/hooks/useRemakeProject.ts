'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { queryKeys } from '../keys'

export type RemakeSnapshot = {
  project: { id: string; name: string; description?: string | null; type: string }
  source: { status: string; mediaId: string | null; mediaUrl: string | null; sourceRevision?: number | null; metadata?: Record<string, unknown> | null }
  shots: Array<{
    id: string
    stableKey: string
    sequence: number | null
    reviewStatus: string
    needsReview: boolean
    currentRevision?: number | null
    review?: { promptEligible: boolean; reason?: string | null }
    timeRange?: { start: string | number | null; end: string | number | null }
    keyframes?: Record<'start' | 'middle' | 'end', { mediaId: string | null; mediaUrl: string | null }>
    promptTracks?: PromptTrackSummary[]
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

export type PromptVersionSummary = {
  id: string
  versionNumber: number
  source: 'automated' | 'human'
  reviewStatus: string
  isAdopted: boolean
  coreText: string
  negativeConstraints: string[]
  createdAt: string
  provenance: { taskId: string | null; skillVersion: string | null; schemaVersion: string | null; modelVersion: string | null; executorVersion: string | null }
}

export type PromptTrackSummary = {
  id: string
  targetKey: 'image:start' | 'image:middle' | 'image:end' | 'video'
  latestVersion: { id: string; versionNumber: number; reviewStatus: string } | null
  adoptedVersion: { id: string; versionNumber: number; reviewStatus: string } | null
  needsReview: boolean
}

export type PromptTrackDetail = {
  track: Omit<PromptTrackSummary, 'latestVersion' | 'adoptedVersion'> & { shotId: string; latestVersion: number | null; adoptedVersion: number | null }
  history: PromptVersionSummary[]
  selected: Array<PromptVersionSummary & { parsedOutput: unknown; rawOutput: string | null }>
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

export function useRemakePromptTrack(projectId: string | null, trackId: string | null, versionIds: string[] = []) {
  return useQuery({
    queryKey: queryKeys.remake.track(projectId || '', trackId || '', versionIds),
    enabled: Boolean(projectId && trackId),
    queryFn: async (): Promise<PromptTrackDetail> => {
      if (!projectId || !trackId) throw new Error('Prompt track is required')
      const query = versionIds.length === 2
        ? `?compare=${encodeURIComponent(versionIds.join(','))}`
        : versionIds.length === 1 ? `?versionId=${encodeURIComponent(versionIds[0])}` : ''
      const response = await apiFetch(`/api/remake-projects/${projectId}/prompts/tracks/${trackId}${query}`)
      if (!response.ok) throw new Error(resolveTaskErrorMessage(await response.json().catch(() => null), 'Failed to load prompt history'))
      return await response.json() as PromptTrackDetail
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
