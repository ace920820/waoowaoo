import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCodexJsonl, redactCodexOutput, runCodexPromptAnalysis } from '@/lib/remake-projects/prompt/executor'

const resolveStorageKeyMock = vi.hoisted(() => vi.fn())
const getMediaObjectByIdMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/media/service', () => ({ getMediaObjectById: getMediaObjectByIdMock, resolveStorageKeyFromMediaValue: resolveStorageKeyMock }))

const imageAnalysis = {
  analysisBasis: { visibleFacts: ['one subject'], photographicInferences: ['eye level'], generationRecommendations: ['keep framing'] },
  structuredPrompt: { cameraAndComposition: {}, depthAndImaging: {}, subjects: [], sceneAndSpace: {}, lighting: {}, colorAndStyle: {} },
  integratedGenerationPrompt: 'A single subject at eye level.',
  negativeConstraints: ['no extra subject'],
  pendingQuestions: ['exact lens is unknown'],
}

const videoAnalysis = {
  coreEvent: 'A runner crosses the street and looks back.',
  actions: ['run', 'look back'],
  interactions: ['avoids traffic'],
  directions: ['left to right'],
  blocking: 'runner remains foreground',
  shotScale: 'medium-wide',
  camera: 'eye level',
  movement: 'tracking left',
  rhythm: 'urgent',
  environmentChange: 'rain begins',
  temporalProgression: 'cross, glance back, exit frame',
}

function fakeChild(lines: string[]) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  child.stdin.once('finish', () => {
    child.stdout.end(lines.join('\n'))
    child.emit('close', 0, null)
  })
  return child
}

describe('remake prompt Codex executor', () => {
  it('resolves persisted MediaObject IDs to storage keys before reading prompt media', async () => {
    getMediaObjectByIdMock.mockResolvedValueOnce({ storageKey: 'images/scenedetect/frame-1.jpg' })
    const { resolvePromptMediaKey } = await import('@/lib/workers/handlers/remake-prompt')

    await expect(resolvePromptMediaKey('media-object-1')).resolves.toBe('images/scenedetect/frame-1.jpg')
    expect(getMediaObjectByIdMock).toHaveBeenCalledWith('media-object-1')
  })

  it('starts one fresh shell-free codex exec process and parses one final JSONL result', async () => {
    const child = fakeChild([
      JSON.stringify({ type: 'thread.started', thread_id: 'session-new' }),
      JSON.stringify({ type: 'final', result: imageAnalysis }),
    ])
    const spawn = vi.fn(() => child)

    const output = await runCodexPromptAnalysis({ targetKey: 'image:start', prompt: 'analyze this image', media: [{ name: 'start.jpg', bytes: Buffer.from('image') }] }, { spawn: spawn as never })

    expect(spawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
    expect(command).toBe('codex')
    expect(args).toContain('exec')
    expect(args).not.toContain('resume')
    expect(options).toMatchObject({ shell: false })
    expect(output.sessionId).toBe('session-new')
    expect(output.result).toEqual(imageAnalysis)
  })

  it('fails closed for ambiguous sessions or invalid final schemas', () => {
    expect(() => parseCodexJsonl('{"type":"thread.started","thread_id":"a"}\n{"type":"thread.started","thread_id":"b"}\n{"type":"final","result":{}}', 'image:start')).toThrow('CODEX_SESSION_AMBIGUOUS')
    expect(() => parseCodexJsonl('{"type":"final","result":{}}', 'image:start')).toThrow()
    expect(() => parseCodexJsonl(`{"type":"final","result":${JSON.stringify(imageAnalysis)}}\n{"type":"final","result":${JSON.stringify(imageAnalysis)}}`, 'image:start')).toThrow('CODEX_FINAL_RESULT_MISSING')
  })

  it('keeps the image result contract independent from frame-slot labels', () => {
    expect(parseCodexJsonl(JSON.stringify({ type: 'final', result: imageAnalysis }), 'image:end').result).toEqual(imageAnalysis)
  })

  it('preserves one whole-video result envelope for the worker to map by stable Shot id', () => {
    const result = parseCodexJsonl(JSON.stringify({
      type: 'final',
      result: { shots: [{ stableShotId: 'shot-01', analysis: videoAnalysis }, { stableShotId: 'shot-02', analysis: videoAnalysis }] },
    }), 'video')

    expect(result.result).toEqual({ shots: [{ stableShotId: 'shot-01', analysis: videoAnalysis }, { stableShotId: 'shot-02', analysis: videoAnalysis }] })
  })

  it('fails closed when a whole-video result includes a malformed Shot analysis', () => {
    expect(() => parseCodexJsonl(JSON.stringify({
      type: 'final',
      result: { shots: [{ stableShotId: 'shot-01', analysis: { ...videoAnalysis, coreEvent: '' } }] },
    }), 'video')).toThrow('CODEX_VIDEO_RESULT_INVALID')
  })

  it('redacts URLs, absolute paths, and secret-looking values before errors project outward', () => {
    const redacted = redactCodexOutput('https://bucket.example/file?X-Amz-Signature=abc /Users/name/private api_key=super-secret')
    expect(redacted).not.toContain('bucket.example')
    expect(redacted).not.toContain('/Users/name')
    expect(redacted).not.toContain('super-secret')
  })
})
