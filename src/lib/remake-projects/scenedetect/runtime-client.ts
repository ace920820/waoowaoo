import { apiFetch } from '@/lib/api-fetch'
import type { SceneDetectProject } from '@/vendor/scenedetect'
import type { SceneDetectIntegrationRuntime, SceneDetectRuntimeTaskUpdate, SceneDetectTaskStage } from './integration-runtime'

type TaskRow = { taskId: string; displayStatus: string; status?: string; progress?: number; stage?: string | null; resultIds?: Record<string, string>; error?: { message?: string } | null; attempt?: number }
const base = (projectId: string) => `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect`
async function json<T>(response: Response): Promise<T> { if (!response.ok) throw new Error(`SceneDetect request failed (${response.status})`); return response.json() as Promise<T> }

export function createSceneDetectRuntime(projectId: string): SceneDetectIntegrationRuntime {
  const listeners = new Map<string, Set<(update: SceneDetectRuntimeTaskUpdate) => void>>()
  const pollers = new Map<string, ReturnType<typeof setInterval>>()
  const notify = (taskId: string, update: SceneDetectRuntimeTaskUpdate) => listeners.get(taskId)?.forEach((listener) => listener(update))
  const stop = (taskId: string) => { const timer = pollers.get(taskId); if (timer) clearInterval(timer); pollers.delete(taskId) }
  const poll = async (taskId: string) => {
    try {
      const payload = await json<{ tasks: TaskRow[] }>(await apiFetch(`/api/remake-projects/${encodeURIComponent(projectId)}/tasks?targetId=${encodeURIComponent(projectId)}`))
      const task = payload.tasks.find((row) => row.taskId === taskId)
      if (!task) return
      const status = task.displayStatus
      const terminal = status === 'completed' || status === 'failed' || status === 'canceled'
      const stage: SceneDetectTaskStage | undefined = (task.stage as SceneDetectTaskStage | undefined) || (status === 'queued' ? 'queued' : status === 'running' ? 'executor-call' : undefined)
      if (status === 'completed') notify(taskId, { kind: 'completed', result: task.resultIds || null, stage: 'completed' })
      else if (status === 'failed') notify(taskId, { kind: 'failed', error: task.error?.message || 'SceneDetect task failed', stage: 'failed' })
      else if (status === 'canceled') notify(taskId, { kind: 'canceled', stage: 'canceled' })
      else notify(taskId, { kind: 'progress', progress: Math.max(0, Math.min(100, task.progress || 0)), stage, indeterminate: stage === 'executor-call' })
      if (terminal) stop(taskId)
    } catch (error) { notify(taskId, { kind: 'failed', error: error instanceof Error ? error.message : 'Task polling failed', stage: 'failed' }); stop(taskId) }
  }
  return {
    uploadSource: async ({ file, operationKey }) => json<Awaited<ReturnType<SceneDetectIntegrationRuntime['uploadSource']>>>(await apiFetch(`/api/remake-projects/${encodeURIComponent(projectId)}/source`, { method: 'POST', body: (() => { const form = new FormData(); form.set('file', file); form.set('operationKey', operationKey); return form })() })),
    loadProject: async (id) => { const result = await json<{ project: SceneDetectProject; empty?: boolean }>(await apiFetch(`${base(id)}/project`)); return result.empty ? null : result.project },
    reloadProject: async (id) => { const result = await json<{ project: SceneDetectProject; empty?: boolean }>(await apiFetch(`${base(id)}/project`)); return result.empty ? null : result.project },
    saveProject: async (id, project, options = {}) => json(await apiFetch(`${base(id)}/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'commit', operationKey: options.operationKey || `native-save:${Date.now()}`, payload: project, baseRevision: options.baseRevision }) })),
    resolveMediaRef: async (mediaId) => `${base(projectId)}/media/${encodeURIComponent(mediaId)}`,
    submitAnalyze: async (input) => json(await apiFetch(`${base(input.projectId)}/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationKey: input.operationKey, threshold: input.threshold }) })),
    submitExtractKeyframes: async () => { throw new Error('SceneDetect keyframe extraction endpoint is not available') },
    onTaskUpdate: (taskId, listener) => { const set = listeners.get(taskId) || new Set(); set.add(listener); listeners.set(taskId, set); if (!pollers.has(taskId)) { void poll(taskId); pollers.set(taskId, setInterval(() => void poll(taskId), 1000)) } return () => { set.delete(listener); if (!set.size) { listeners.delete(taskId); stop(taskId) } } },
    canEnterProject: () => true,
    canExport: () => false,
  }
}
