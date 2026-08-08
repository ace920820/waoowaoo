import { z } from 'zod'

const responseShape = z.object({ analysisId: z.string().min(1), metadata: z.record(z.unknown()), shots: z.array(z.record(z.unknown())) }).passthrough()
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024

export class SceneDetectExecutorError extends Error {
  constructor(public readonly code: string, message = code) { super(message); this.name = 'SceneDetectExecutorError' }
}

export type SceneDetectExecutorClient = ReturnType<typeof createSceneDetectExecutorClient>

function config() {
  const baseUrl = process.env.SCENEDETECT_EXECUTOR_BASE_URL || DEFAULT_BASE_URL
  let parsed: URL
  try { parsed = new URL(baseUrl) } catch { throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_BASE_URL_INVALID') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname.replace(/\/$/, '') !== '') throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_BASE_URL_INVALID')
  return { baseUrl: parsed.toString().replace(/\/$/, '') }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number, maxBytes = MAX_RESPONSE_BYTES) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const length = Number(response.headers.get('content-length') || 0)
    if (length > maxBytes) throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_RESPONSE_TOO_LARGE')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_RESPONSE_TOO_LARGE')
    if (!response.ok) throw new SceneDetectExecutorError(`SCENEDETECT_EXECUTOR_HTTP_${response.status}`)
    try { return JSON.parse(bytes.toString('utf8')) as unknown } catch { throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_NON_JSON') }
  } catch (error) {
    if (error instanceof SceneDetectExecutorError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_TIMEOUT')
    throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_NETWORK')
  } finally { clearTimeout(timer) }
}

export function createSceneDetectExecutorClient(options: { timeoutMs?: number; maxSourceBytes?: number; maxResponseBytes?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const maxSourceBytes = options.maxSourceBytes ?? MAX_SOURCE_BYTES
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES
  const endpoint = (path: '/api/health' | '/api/analyze' | '/api/keyframes') => `${config().baseUrl}${path}`
  return {
    async health() {
      const payload = await fetchJson(endpoint('/api/health'), {}, timeoutMs, 1024)
      if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).status !== 'ok') throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_NOT_READY')
      return { status: 'ok' as const }
    },
    async execute(input: { operation: 'analyze' | 'extract_keyframes'; source: Buffer; fileName: string; threshold?: number; shots?: unknown[] }) {
      if (input.source.byteLength > maxSourceBytes) throw new SceneDetectExecutorError('SCENEDETECT_SOURCE_TOO_LARGE')
      await this.health()
      const form = new FormData(); form.append('video', new Blob([new Uint8Array(input.source)]), input.fileName)
      if (input.operation === 'analyze') { form.append('detector', 'content'); form.append('threshold', String(input.threshold ?? 27)) }
      else form.append('shots', JSON.stringify(input.shots || []))
      const payload = await fetchJson(endpoint(input.operation === 'analyze' ? '/api/analyze' : '/api/keyframes'), { method: 'POST', body: form }, timeoutMs, maxResponseBytes)
      const parsed = responseShape.safeParse(payload)
      if (!parsed.success) throw new SceneDetectExecutorError('SCENEDETECT_EXECUTOR_SCHEMA_INVALID')
      return parsed.data
    },
  }
}

export const sceneDetectExecutor = createSceneDetectExecutorClient()
