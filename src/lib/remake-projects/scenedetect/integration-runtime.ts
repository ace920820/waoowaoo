import type { SceneDetectProject, Shot, VideoMetadata } from '@/vendor/scenedetect'
import type { SceneDetectCallback } from './task-contract'

export type SceneDetectIntegrationRuntime = {
  loadProject: (projectId: string) => Promise<SceneDetectProject | null>
  saveProject: (projectId: string, project: SceneDetectProject) => Promise<void>
  resolveMediaRef: (mediaId: string) => Promise<string | null>
  submitAnalyze: (input: { projectId: string; sourceRevision: number; operationKey: string }) => Promise<{ taskId: string }>
  submitExtractKeyframes: (input: { projectId: string; sourceRevision: number; shotRevision: number; operationKey: string }) => Promise<{ taskId: string }>
  onTaskUpdate: (taskId: string, listener: (callback: SceneDetectCallback) => void) => () => void
  canEnterProject: (projectId: string) => boolean
  canExport: () => false
}

export type SceneDetectNativeTypes = {
  project: SceneDetectProject
  shot: Shot
  metadata: VideoMetadata
}
