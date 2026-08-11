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
    semantics?: {
      shotType: string | null
      cameraMove: string | null
      description: string | null
      moodPresetId: string | null
      customMood: string | null
      sceneTag: string | null
      characterTags: string[]
      sceneAssetId: string | null
      characterAssetIds: string[]
      propAssetIds: string[]
    }
    review?: { promptEligible: boolean; reason?: string | null }
    timeRange?: { start: string | number | null; end: string | number | null }
    keyframes?: Record<'start' | 'middle' | 'end', { mediaId: string | null; mediaUrl: string | null }>
    keyframeGeneration?: {
      tracks: Array<{
        id: string
        slot: 'start' | 'middle' | 'end'
        selectedForGeneration: boolean
        adoptedCandidateId: string | null
        eligible: boolean
        batches: Array<{
          id: string
          taskId?: string | null
          operationKey: string
          inputFingerprint?: string
          modelId?: string | null
          options?: Record<string, unknown>
          referenceMediaIds?: string[]
          requestedCandidateCount: number
          createdAt: string
          candidates: Array<{
            id: string
            ordinal: number
            outputVersionId?: string
            mediaId?: string | null
            mediaUrl?: string | null
            status?: string
            eligible: boolean
            invalidated?: boolean
          }>
        }>
      }>
      actionSheet: { status: 'current' | 'missing' | 'waiting'; id: string | null; mediaId: string | null; fingerprint: string | null }
      history: Array<{ id: string; revisionId: string; mediaId: string | null; fingerprint: string | null; invalidated: boolean }>
    }
    promptTracks?: PromptTrackSummary[]
    revisions: Array<{ id: string; revision: number; changeReason: string; sourceRevision?: number | null; lifecycleState?: string; payload?: unknown; keyframeMediaRefs?: unknown }>
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
    promptSlot?: 'start' | 'middle' | 'end' | null
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
  adoptedVersion: { id: string; versionNumber: number; reviewStatus: string; coreText?: string | null } | null
  needsReview: boolean
}

export type PromptTrackDetail = {
  track: Omit<PromptTrackSummary, 'latestVersion' | 'adoptedVersion'> & { shotId: string; latestVersion: number | null; adoptedVersion: number | null }
  history: PromptVersionSummary[]
  selected: Array<PromptVersionSummary & { parsedOutput: unknown; rawOutput: string | null }>
}

const keyframeSlots = ['start', 'middle', 'end'] as const

// SceneDetect stores the shot list before its asynchronous frame transfer completes.
// Keep this snapshot current until every displayed frame can be rendered by Prompt.
export function remakeSnapshotRefreshInterval(snapshot: RemakeSnapshot | undefined): number | false {
  if (snapshot?.source.status !== 'analyzed') return false
  const hasPendingKeyframes = snapshot.shots.some((shot) =>
    keyframeSlots.some((slot) => !shot.keyframes?.[slot]?.mediaUrl),
  )
  const hasActivePromptTask = snapshot.tasks.some((task) =>
    task.type.includes('prompt') && ['queued', 'processing', 'running'].includes(task.status),
  )
  return hasPendingKeyframes || hasActivePromptTask ? 1000 : false
}

export function useRemakeProject(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.remake.snapshot(projectId || ''),
    enabled: Boolean(projectId),
    staleTime: 5000,
    refetchInterval: (query) => remakeSnapshotRefreshInterval(query.state.data),
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
