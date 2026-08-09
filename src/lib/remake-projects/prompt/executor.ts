import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { imagePromptAnalysisSchema, videoPromptAnalysisSchema, type PromptTargetKey } from './contracts'

const MAX_STDOUT_BYTES = 512 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const GRACEFUL_KILL_MS = 2_000

export type CodexPromptAnalysisInput = {
  targetKey: PromptTargetKey
  prompt: string
  media?: Array<{ name: string; bytes: Buffer; contentType?: string }>
  timeoutMs?: number
  signal?: AbortSignal
}

export type CodexPromptAnalysisOutput = {
  sessionId: string | null
  result: unknown
  rawOutput: string
  stderr: string
}

type Spawn = typeof nodeSpawn

function boundedAppend(current: string, chunk: Buffer | string, maxBytes: number): string {
  const next = current + chunk.toString()
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) return next
  const bytes = Buffer.from(next, 'utf8')
  return bytes.subarray(0, maxBytes).toString('utf8')
}

export function redactCodexOutput(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"']+/gi, '[redacted-url]')
    .replace(/(?:\/Users|\/Volumes|\/home|\/tmp|[A-Za-z]:\\)[^\s"']+/g, '[redacted-path]')
    .replace(/(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,}]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
}

function parseJsonText(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try { return JSON.parse(trimmed) } catch { /* find an embedded object emitted by the CLI */ }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('CODEX_FINAL_JSON_INVALID')
  return JSON.parse(trimmed.slice(start, end + 1))
}

export function parseCodexJsonl(raw: string, targetKey: PromptTargetKey): { sessionId: string | null; result: unknown } {
  let sessionId: string | null = null
  let result: unknown = undefined
  let resultCount = 0
  let lastAgentMessage: unknown = undefined
  for (const line of raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    let event: Record<string, unknown>
    try { event = JSON.parse(line) as Record<string, unknown> } catch { continue }
    const candidateSession = [event.sessionId, event.session_id, event.thread_id, event.threadId]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (candidateSession) {
      if (sessionId && sessionId !== candidateSession) throw new Error('CODEX_SESSION_AMBIGUOUS')
      sessionId = candidateSession
    }
    const type = typeof event.type === 'string' ? event.type : ''
    const item = event.item && typeof event.item === 'object' ? event.item as Record<string, unknown> : null
    if (type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') {
      lastAgentMessage = parseJsonText(item.text)
    }
    const isFinal = type === 'final' || type === 'result' || type === 'completed' || type === 'turn.completed' || event.final === true
    if (!isFinal) continue
    const rawResult = event.result ?? event.output ?? event.finalResult ?? event.text ?? event.message ?? (type === 'turn.completed' ? lastAgentMessage : undefined)
    if (rawResult === undefined) continue
    const parsed = typeof rawResult === 'string' ? parseJsonText(rawResult) : rawResult
    result = parsed
    resultCount += 1
  }
  if (resultCount !== 1 || result === undefined) throw new Error('CODEX_FINAL_RESULT_MISSING')
  if (targetKey === 'video') {
    const value = result as Record<string, unknown>
    const rows = Array.isArray(value) ? value : (Array.isArray(value.shots) ? value.shots : null)
    if (!rows) throw new Error('CODEX_VIDEO_RESULT_INVALID')
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('CODEX_VIDEO_RESULT_INVALID')
      const item = row as Record<string, unknown>
      if (typeof item.stableShotId !== 'string' || !item.stableShotId.trim()) throw new Error('CODEX_VIDEO_RESULT_INVALID')
      try {
        videoPromptAnalysisSchema.parse(item.analysis ?? item.result)
      } catch {
        throw new Error('CODEX_VIDEO_RESULT_INVALID')
      }
    }
  } else {
    const value = (result as Record<string, unknown>)?.analysis ?? result
    imagePromptAnalysisSchema.parse(value)
    result = value
  }
  return { sessionId, result }
}

function promptResultSchema(targetKey: PromptTargetKey): Record<string, unknown> {
  const textList = { type: 'array', items: { type: 'string', minLength: 1 } }
  const videoAnalysis = {
    type: 'object', additionalProperties: false,
    properties: {
      coreEvent: { type: 'string', minLength: 1 }, actions: textList, interactions: textList, directions: textList,
      blocking: { type: 'string', minLength: 1 }, shotScale: { type: 'string', minLength: 1 }, camera: { type: 'string', minLength: 1 },
      movement: { type: 'string', minLength: 1 }, rhythm: { type: 'string', minLength: 1 }, environmentChange: { type: 'string', minLength: 1 }, temporalProgression: { type: 'string', minLength: 1 },
    }, required: ['coreEvent', 'actions', 'interactions', 'directions', 'blocking', 'shotScale', 'camera', 'movement', 'rhythm', 'environmentChange', 'temporalProgression'],
  }
  if (targetKey === 'video') {
    return { type: 'object', additionalProperties: false, properties: { shots: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, properties: { stableShotId: { type: 'string', minLength: 1 }, analysis: videoAnalysis }, required: ['stableShotId', 'analysis'] } } }, required: ['shots'] }
  }
  return {
    type: 'object', additionalProperties: false,
    properties: {
      analysisBasis: { type: 'object', additionalProperties: false, properties: { visibleFacts: textList, photographicInferences: textList, generationRecommendations: textList }, required: ['visibleFacts', 'photographicInferences', 'generationRecommendations'] },
      structuredPrompt: { type: 'object', additionalProperties: false, properties: { cameraAndComposition: { type: 'object' }, depthAndImaging: { type: 'object' }, subjects: { type: 'array', items: { type: 'object' } }, sceneAndSpace: { type: 'object' }, lighting: { type: 'object' }, colorAndStyle: { type: 'object' } }, required: ['cameraAndComposition', 'depthAndImaging', 'subjects', 'sceneAndSpace', 'lighting', 'colorAndStyle'] },
      integratedGenerationPrompt: { type: 'string', minLength: 1 }, negativeConstraints: textList, pendingQuestions: textList,
    }, required: ['analysisBasis', 'structuredPrompt', 'integratedGenerationPrompt', 'negativeConstraints', 'pendingQuestions'],
  }
}

function fixedArgv(schemaPath: string): string[] {
  return ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--output-schema', schemaPath, '-']
}

function killProcess(child: ChildProcessWithoutNullStreams) {
  try { child.kill('SIGTERM') } catch { return }
  const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* process already exited */ } }, GRACEFUL_KILL_MS)
  timer.unref?.()
}

export async function runCodexPromptAnalysis(input: CodexPromptAnalysisInput, deps?: { spawn?: Spawn }) {
  if (!input.prompt.trim()) throw new Error('CODEX_PROMPT_EMPTY')
  const spawn = deps?.spawn || nodeSpawn
  const directory = await mkdtemp(join(tmpdir(), 'waoowaoo-codex-prompt-'))
  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS))
  let child: ChildProcessWithoutNullStreams | null = null
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let aborted = false
  try {
    for (const [index, media] of (input.media || []).entries()) {
      const safeName = `${index}-${media.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'media.bin'}`
      await writeFile(join(directory, safeName), media.bytes, { mode: 0o600 })
    }
    const schemaPath = join(directory, 'result-schema.json')
    await writeFile(schemaPath, JSON.stringify(promptResultSchema(input.targetKey)), { mode: 0o600 })
    const mediaPaths = (input.media || []).map((media, index) => join(directory, `${index}-${media.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'media.bin'}`))
    const prompt = `${input.prompt.trim()}\n\nAnalyze only these controlled local media paths: ${JSON.stringify(mediaPaths)}. Return only JSON matching the output schema.`
    child = spawn('codex', fixedArgv(schemaPath), { shell: false, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] })
    const childRef = child
    const abort = () => { aborted = true; killProcess(childRef) }
    if (input.signal?.aborted) abort()
    else input.signal?.addEventListener('abort', abort, { once: true })
    const outputPromise = new Promise<void>((resolve, reject) => {
      childRef.stdout.on('data', (chunk: Buffer) => { stdout = boundedAppend(stdout, chunk, MAX_STDOUT_BYTES); if (Buffer.byteLength(stdout, 'utf8') >= MAX_STDOUT_BYTES) killProcess(childRef) })
      childRef.stderr.on('data', (chunk: Buffer) => { stderr = boundedAppend(stderr, chunk, MAX_STDERR_BYTES) })
      childRef.once('error', reject)
      childRef.once('close', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(`CODEX_PROCESS_FAILED:${code ?? signal ?? 'unknown'}`))
      })
      childRef.stdin.end(prompt)
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { timedOut = true; killProcess(childRef); reject(new Error('CODEX_PROCESS_TIMEOUT')) }, timeoutMs)
      timer.unref?.()
      outputPromise.then(() => { clearTimeout(timer); resolve() }, (error) => { clearTimeout(timer); reject(error) })
    })
    if (aborted) throw new Error('CODEX_PROCESS_CANCELED')
    const parsed = parseCodexJsonl(stdout, input.targetKey)
    return { ...parsed, rawOutput: stdout, stderr: redactCodexOutput(stderr) } satisfies CodexPromptAnalysisOutput
  } catch (error) {
    if (timedOut) throw new Error('CODEX_PROCESS_TIMEOUT')
    if (aborted) throw new Error('CODEX_PROCESS_CANCELED')
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(redactCodexOutput(message || 'CODEX_PROCESS_FAILED'))
  } finally {
    input.signal?.removeEventListener('abort', () => undefined)
    await rm(directory, { recursive: true, force: true })
  }
}

export const CODEX_EXECUTOR_LIMITS = { maxStdoutBytes: MAX_STDOUT_BYTES, maxStderrBytes: MAX_STDERR_BYTES, timeoutMs: DEFAULT_TIMEOUT_MS }
export const createPromptRunId = () => randomUUID()
