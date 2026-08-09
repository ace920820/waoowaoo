import type { PromptTrackSummary } from '@/lib/query/hooks/useRemakeProject'

export type PromptTaskState = 'idle' | 'queued' | 'running' | 'failed' | 'pending' | 'approved' | 'needsReview'

export function getPromptTaskState(taskStatus: string | undefined, track: PromptTrackSummary | null): PromptTaskState {
  if (taskStatus === 'queued') return 'queued'
  if (taskStatus === 'processing' || taskStatus === 'running') return 'running'
  if (taskStatus === 'failed') return 'failed'
  if (track?.needsReview) return 'needsReview'
  if (track?.latestVersion?.reviewStatus === 'APPROVED') return 'approved'
  if (track?.latestVersion) return 'pending'
  return 'idle'
}
