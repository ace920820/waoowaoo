import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCodexJsonl, redactCodexOutput, runCodexPromptAnalysis } from '@/lib/remake-projects/prompt/executor'

const imageAnalysis = {
  analysisBasis: { visibleFacts: ['one subject'], photographicInferences: ['eye level'], generationRecommendations: ['keep framing'] },
  structuredPrompt: { cameraAndComposition: {}, depthAndImaging: {}, subjects: [], sceneAndSpace: {}, lighting: {}, colorAndStyle: {} },
  integratedGenerationPrompt: 'A single subject at eye level.',
  negativeConstraints: ['no extra subject'],
  pendingQuestions: ['exact lens is unknown'],
}

function fakeChild(lines: string[]) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  queueMicrotask(() => {
    child.stdout.end(lines.join('\n'))
    child.emit('close', 0, null)
  })
  return child
}

describe('remake prompt Codex executor', () => {
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

  it('redacts URLs, absolute paths, and secret-looking values before errors project outward', () => {
    const redacted = redactCodexOutput('https://bucket.example/file?X-Amz-Signature=abc /Users/name/private api_key=super-secret')
    expect(redacted).not.toContain('bucket.example')
    expect(redacted).not.toContain('/Users/name')
    expect(redacted).not.toContain('super-secret')
  })
})
