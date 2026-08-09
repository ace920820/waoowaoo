import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { imagePromptAnalysisSchema, videoPromptAnalysisSchema, type PromptTargetKey } from './contracts'

const MAX_STDOUT_BYTES = 512 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const VIDEO_TIMEOUT_MS = 30 * 60 * 1000
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

function codexFailureDiagnostic(stderr: string, stdout: string): string | null {
  const lines = redactCodexOutput(`${stderr}\n${stdout}`).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const preferred = lines.find((line) => /error|invalid|unauthorized|not authenticated|rate limit|quota|failed|denied/i.test(line))
  const fallback = lines.find((line) => !/^\d{4}-\d{2}-\d{2}T.*\bWARN\b/i.test(line))
  const diagnostic = preferred || fallback
  return diagnostic ? diagnostic.slice(0, 500) : null
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

type JsonSchema = Record<string, unknown>

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) }
}

function strictTextFields(fields: string[]): JsonSchema {
  return strictObject(Object.fromEntries(fields.map((field) => [field, { type: 'string', minLength: 1 }])))
}

export function promptResultSchema(targetKey: PromptTargetKey): Record<string, unknown> {
  const textList = { type: 'array', items: { type: 'string', minLength: 1 } }
  const videoAnalysis = strictObject({
    coreEvent: { type: 'string', minLength: 1 }, actions: textList, interactions: textList, directions: textList,
    blocking: { type: 'string', minLength: 1 }, shotScale: { type: 'string', minLength: 1 }, camera: { type: 'string', minLength: 1 },
    movement: { type: 'string', minLength: 1 }, rhythm: { type: 'string', minLength: 1 }, environmentChange: { type: 'string', minLength: 1 }, temporalProgression: { type: 'string', minLength: 1 },
  })
  if (targetKey === 'video') {
    return strictObject({ shots: { type: 'array', minItems: 1, items: strictObject({ stableShotId: { type: 'string', minLength: 1 }, analysis: videoAnalysis }) } })
  }
  return strictObject({
    analysisBasis: strictObject({ visibleFacts: textList, photographicInferences: textList, generationRecommendations: textList }),
    structuredPrompt: strictObject({
      cameraAndComposition: strictTextFields(['aspectRatio', 'cameraPositionAndAngle', 'lensAndFieldOfView', 'focalLengthRange', 'shotScale', 'subjectLayout', 'subjectOccupancy', 'spatialRelations', 'perspectiveAndVisualFlow']),
      depthAndImaging: strictTextFields(['depthOfField', 'focusPlane', 'sharpnessDistribution', 'motionAndLensEffects', 'exposureRecommendations']),
      subjects: { type: 'array', items: strictTextFields(['label', 'category', 'positionAndScale', 'appearance', 'materials', 'wardrobeAndEquipment', 'actionAndPose', 'orientationAndGaze', 'occlusionAndCrop', 'relations', 'lighting']) },
      sceneAndSpace: strictTextFields(['setting', 'atmosphereMedium', 'foreground', 'midground', 'background', 'visibilityAndDepth', 'narrativePressure']),
      lighting: strictTextFields(['keyLight', 'qualityAndFalloff', 'fillLight', 'rimAndReflectedLight', 'emissiveEffects', 'volumetricsAndOcclusion', 'highlightsAndShadows']),
      colorAndStyle: strictTextFields(['temperatureAndTone', 'paletteRelationships', 'saturationBrightnessContrast', 'whiteBalanceAndExposure', 'mediumAndTexture', 'postProcessing']),
    }),
    integratedGenerationPrompt: { type: 'string', minLength: 1 }, negativeConstraints: textList, pendingQuestions: textList,
  })
}

function mediaExtension(media: NonNullable<CodexPromptAnalysisInput['media']>[number]): string {
  const contentType = media.contentType?.toLowerCase() || ''
  if (contentType === 'image/jpeg' || media.bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg'
  if (contentType === 'image/png' || media.bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (contentType === 'image/webp' || (media.bytes.subarray(0, 4).toString() === 'RIFF' && media.bytes.subarray(8, 12).toString() === 'WEBP')) return 'webp'
  if (contentType === 'video/mp4' || media.bytes.subarray(4, 8).toString() === 'ftyp') return 'mp4'
  return 'bin'
}

function fixedArgv(schemaPath: string, imagePaths: string[], sandbox: 'read-only' | 'workspace-write' = 'read-only'): string[] {
  return ['exec', '--json', '--sandbox', sandbox, '--skip-git-repo-check', '--output-schema', schemaPath, ...imagePaths.flatMap((path) => ['--image', path]), '-']
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
    const preparedMedia = await Promise.all((input.media || []).map(async (media, index) => {
      const stem = media.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(-120) || 'media'
      const extension = mediaExtension(media)
      const path = join(directory, `${index}-${stem}.${extension}`)
      await writeFile(path, media.bytes, { mode: 0o600 })
      return { path, isImage: ['jpg', 'png', 'webp'].includes(extension) }
    }))
    const schemaPath = join(directory, 'result-schema.json')
    await writeFile(schemaPath, JSON.stringify(promptResultSchema(input.targetKey)), { mode: 0o600 })
    const mediaPaths = preparedMedia.map((media) => media.path)
    const prompt = `${input.prompt.trim()}\n\nAnalyze only these controlled local media paths: ${JSON.stringify(mediaPaths)}. Return only JSON matching the output schema.`
    child = spawn('codex', fixedArgv(schemaPath, preparedMedia.filter((media) => media.isImage).map((media) => media.path)), { shell: false, cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] })
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
        else {
          const diagnostic = codexFailureDiagnostic(stderr, stdout)
          reject(new Error(`CODEX_PROCESS_FAILED:${code ?? signal ?? 'unknown'}${diagnostic ? `: ${diagnostic.trim()}` : ''}`))
        }
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

export async function runCodexVideoWorkspaceAnalysis(input: {
  targetKey: 'video'
  prompt: string
  workspaceDirectory: string
  timeoutMs?: number
  signal?: AbortSignal
}, deps?: { spawn?: Spawn }): Promise<CodexPromptAnalysisOutput> {
  if (!input.prompt.trim()) throw new Error('CODEX_PROMPT_EMPTY')
  const spawn = deps?.spawn || nodeSpawn
  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs ?? VIDEO_TIMEOUT_MS, VIDEO_TIMEOUT_MS))
  const schemaPath = join(input.workspaceDirectory, 'result-schema.json')
  let child: ChildProcessWithoutNullStreams | null = null
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let aborted = false
  try {
    await writeFile(schemaPath, JSON.stringify(promptResultSchema('video')), { mode: 0o600 })
    child = spawn('codex', fixedArgv(schemaPath, [], 'workspace-write'), { shell: false, cwd: input.workspaceDirectory, stdio: ['pipe', 'pipe', 'pipe'] })
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
        else {
          const diagnostic = codexFailureDiagnostic(stderr, stdout)
          reject(new Error(`CODEX_PROCESS_FAILED:${code ?? signal ?? 'unknown'}${diagnostic ? `: ${diagnostic.trim()}` : ''}`))
        }
      })
      childRef.stdin.end(input.prompt.trim())
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { timedOut = true; killProcess(childRef); reject(new Error('CODEX_PROCESS_TIMEOUT')) }, timeoutMs)
      timer.unref?.()
      outputPromise.then(() => { clearTimeout(timer); resolve() }, (error) => { clearTimeout(timer); reject(error) })
    })
    if (aborted) throw new Error('CODEX_PROCESS_CANCELED')
    const parsed = parseCodexJsonl(stdout, 'video')
    return { ...parsed, rawOutput: stdout, stderr: redactCodexOutput(stderr) }
  } catch (error) {
    if (timedOut) throw new Error('CODEX_PROCESS_TIMEOUT')
    if (aborted) throw new Error('CODEX_PROCESS_CANCELED')
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(redactCodexOutput(message || 'CODEX_PROCESS_FAILED'))
  }
}

export const CODEX_EXECUTOR_LIMITS = { maxStdoutBytes: MAX_STDOUT_BYTES, maxStderrBytes: MAX_STDERR_BYTES, timeoutMs: DEFAULT_TIMEOUT_MS, videoTimeoutMs: VIDEO_TIMEOUT_MS }
export const createPromptRunId = () => randomUUID()
