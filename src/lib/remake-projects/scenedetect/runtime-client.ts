import { apiFetch } from '@/lib/api-fetch'
import type { SceneDetectProject } from '@/vendor/scenedetect'
import type { SceneDetectIntegrationRuntime, SceneDetectRuntimeTaskUpdate, SceneDetectTaskStage } from './integration-runtime'

type TaskRow = { taskId: string; displayStatus: string; status?: string; progress?: number; stage?: string | null; resultIds?: Record<string, string>; error?: { message?: string } | null; attempt?: number }
const base = (projectId: string) => `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect`
class SceneDetectHttpError extends Error { constructor(public status: number, public body: unknown) { super(`SceneDetect request failed (${status})`) } }
async function json<T>(response: Response): Promise<T> { const body = await response.json().catch(() => null); if (!response.ok) throw new SceneDetectHttpError(response.status, body); return body as T }

export function createSceneDetectRuntime(projectId: string): SceneDetectIntegrationRuntime {
  const listeners = new Map<string, Set<(update: SceneDetectRuntimeTaskUpdate) => void>>()
  const pollers = new Map<string, ReturnType<typeof setInterval>>()
  let token: string | undefined
  let inFlight: Promise<unknown> | null = null
  let pending: { id: string; project: SceneDetectProject; options: { baseRevision?: number; operationKey?: string }; resolve: (value: unknown) => void; reject: (error: unknown) => void } | null = null
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
    loadProject: async (id) => { const result = await json<{ project: SceneDetectProject; empty?: boolean; token?: string }>(await apiFetch(`${base(id)}/project`)); token = result.token; return result.empty ? null : result.project },
    reloadProject: async (id) => { const result = await json<{ project: SceneDetectProject; empty?: boolean; token?: string }>(await apiFetch(`${base(id)}/project`)); token = result.token; return result.empty ? null : result.project },
    saveProject: async (id, project, options = {}) => {
      const request = (nextId: string, nextProject: SceneDetectProject, nextOptions: { baseRevision?: number; operationKey?: string }) => {
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (token) headers['if-match'] = token
        return apiFetch(`${base(nextId)}/project`, { method: 'PUT', headers, body: JSON.stringify({ project: nextProject, operationKey: nextOptions.operationKey || `native-save:${Date.now()}` }) }).then((response) => json<Awaited<ReturnType<SceneDetectIntegrationRuntime['saveProject']>>>(response))
      }
      if (inFlight) {
        return new Promise<Awaited<ReturnType<SceneDetectIntegrationRuntime['saveProject']>>>((resolve, reject) => { pending = { id, project, options, resolve: resolve as (value: unknown) => void, reject } })
      }
      const run = async () => {
        try {
          const result = await request(id, project, options)
          if (result && typeof result === 'object' && 'token' in result) token = (result as { token?: string }).token || token
          return result
        } catch (error) {
          if (error instanceof SceneDetectHttpError && error.status === 409) {
            const body = error.body as { current?: SceneDetectProject; token?: string } | null
            if (body?.token) token = body.token
            throw Object.assign(error, { currentProject: body?.current, currentToken: body?.token })
          }
          throw error
        } finally {
          inFlight = null
          const next = pending
          pending = null
          if (next) {
            const nextPromise = request(next.id, next.project, next.options).then((nextResult) => {
              if (nextResult && typeof nextResult === 'object' && 'token' in nextResult) token = (nextResult as { token?: string }).token || token
              next.resolve(nextResult)
              return nextResult
            }, (nextError) => {
              next.reject(nextError)
              throw nextError
            })
            inFlight = nextPromise.finally(() => { inFlight = null })
          }
        }
      }
      inFlight = run()
      return inFlight as Promise<Awaited<ReturnType<SceneDetectIntegrationRuntime['saveProject']>>>
    },
    resolveMediaRef: async (mediaId) => `${base(projectId)}/media/${encodeURIComponent(mediaId)}`,
    submitAnalyze: async (input) => json(await apiFetch(`${base(input.projectId)}/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationKey: input.operationKey, threshold: input.threshold }) })),
    submitExtractKeyframes: async () => { throw new Error('SceneDetect keyframe extraction endpoint is not available') },
    onTaskUpdate: (taskId, listener) => { const set = listeners.get(taskId) || new Set(); set.add(listener); listeners.set(taskId, set); if (!pollers.has(taskId)) { void poll(taskId); pollers.set(taskId, setInterval(() => void poll(taskId), 1000)) } return () => { set.delete(listener); if (!set.size) { listeners.delete(taskId); stop(taskId) } } },
    canEnterProject: () => true,
    canExport: () => false,
  }
}
