import { describe, expect, it, vi, afterEach } from 'vitest'
import { createSceneDetectExecutorClient, SceneDetectExecutorError } from '@/lib/remake-projects/scenedetect/executor-client'
import { executorAnalyzeResponse, executorHealth } from '../../fixtures/scenedetect/executor-fixture'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('SceneDetect executor client', () => {
  it('uses only fixed local paths and does not forward a service token', async () => {
    vi.stubEnv('SCENEDETECT_EXECUTOR_BASE_URL', 'http://127.0.0.1:8000')
    vi.stubEnv('SCENEDETECT_EXECUTOR_TOKEN', 'secret-token')
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(url.endsWith('/health') ? executorHealth() : executorAnalyzeResponse()), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await createSceneDetectExecutorClient({ timeoutMs: 500 }).execute({ operation: 'analyze', source: Buffer.from('video'), fileName: 'clip.mp4' })
    expect(calls.map((call) => call.url)).toEqual(['http://127.0.0.1:8000/api/health', 'http://127.0.0.1:8000/api/analyze'])
    expect(calls[1].init?.headers).toBeUndefined()
  })

  it('normalizes timeout, HTTP, non-JSON, schema, and size failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    await expect(createSceneDetectExecutorClient().health()).rejects.toMatchObject({ code: 'SCENEDETECT_EXECUTOR_HTTP_503' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{', { status: 200 })))
    await expect(createSceneDetectExecutorClient().health()).rejects.toBeInstanceOf(SceneDetectExecutorError)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/health') ? executorHealth() : { nope: true }), { status: 200 })))
    await expect(createSceneDetectExecutorClient().execute({ operation: 'analyze', source: Buffer.from('x'), fileName: 'x.mp4' })).rejects.toMatchObject({ code: 'SCENEDETECT_EXECUTOR_SCHEMA_INVALID' })
    await expect(createSceneDetectExecutorClient({ maxSourceBytes: 1 }).execute({ operation: 'analyze', source: Buffer.from('xx'), fileName: 'x.mp4' })).rejects.toMatchObject({ code: 'SCENEDETECT_SOURCE_TOO_LARGE' })
  })
})
