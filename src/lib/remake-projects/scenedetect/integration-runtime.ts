import type { SceneDetectProject, Shot, VideoMetadata } from '@/vendor/scenedetect'
import type { SceneDetectCallback, SceneDetectTaskInput } from './task-contract'

export type SceneDetectSourceRevision = { sourceRevision: number; metadata: VideoMetadata; mediaId?: string }
export type SceneDetectCanonicalSaveResult = {
  project: SceneDetectProject
  token: string
  idRemap: Record<string, string>
  revision: number
}
export type SceneDetectTaskStage = 'queued' | 'source-read' | 'executor-call' | 'import' | 'completed' | 'failed' | 'canceled'
export type SceneDetectRuntimeTaskUpdate = SceneDetectCallback & { stage?: SceneDetectTaskStage; indeterminate?: boolean }

export type SceneDetectIntegrationRuntime = {
  uploadSource: (input: { file: File; operationKey: string }) => Promise<SceneDetectSourceRevision>
  loadProject: (projectId: string) => Promise<SceneDetectProject | null>
  saveProject: (projectId: string, project: SceneDetectProject, options?: { baseRevision?: number; operationKey?: string }) => Promise<SceneDetectCanonicalSaveResult | void>
  resolveMediaRef: (mediaId: string) => Promise<string | null>
  submitAnalyze: (input: Pick<SceneDetectTaskInput, 'projectId' | 'sourceRevision' | 'operationKey'> & { threshold?: number }) => Promise<{ taskId: string }>
  submitExtractKeyframes: (input: Pick<SceneDetectTaskInput, 'projectId' | 'sourceRevision' | 'shotRevision' | 'operationKey'> & { frameTuple: { first: number; middle: number; last: number } }) => Promise<{ taskId: string }>
  onTaskUpdate: (taskId: string, listener: (callback: SceneDetectRuntimeTaskUpdate) => void) => () => void
  reloadProject: (projectId: string) => Promise<SceneDetectProject | null>
  exportProject?: (project: SceneDetectProject) => Promise<never>
  canEnterProject: (projectId: string) => boolean
  canExport: () => false
}

export type SceneDetectNativeTypes = {
  project: SceneDetectProject
  shot: Shot
  metadata: VideoMetadata
}
