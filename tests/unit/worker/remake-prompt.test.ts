import { EventEmitter } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCodexJsonl, promptResultSchema, redactCodexOutput, runCodexPromptAnalysis, runCodexVideoWorkspaceAnalysis } from '@/lib/remake-projects/prompt/executor'

const resolveStorageKeyMock = vi.hoisted(() => vi.fn())
const getMediaObjectByIdMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/media/service', () => ({ getMediaObjectById: getMediaObjectByIdMock, resolveStorageKeyFromMediaValue: resolveStorageKeyMock }))

const imageAnalysis = {
  analysisBasis: { visibleFacts: ['one subject'], photographicInferences: ['eye level'], generationRecommendations: ['keep framing'] },
  structuredPrompt: {
    cameraAndComposition: { aspectRatio: '16:9', cameraPositionAndAngle: 'eye level', lensAndFieldOfView: 'standard', focalLengthRange: '35mm equivalent', shotScale: 'medium', subjectLayout: 'centered', subjectOccupancy: '50% frame height', spatialRelations: 'single subject', perspectiveAndVisualFlow: 'neutral perspective' },
    depthAndImaging: { depthOfField: 'medium', focusPlane: 'face', sharpnessDistribution: 'subject sharp', motionAndLensEffects: 'none', exposureRecommendations: 'balanced exposure' },
    subjects: [{ label: 'subject 1', category: 'person', positionAndScale: 'center', appearance: 'visible figure', materials: 'fabric', wardrobeAndEquipment: 'simple clothing', actionAndPose: 'standing', orientationAndGaze: 'faces camera', occlusionAndCrop: 'uncropped', relations: 'no other subject', lighting: 'soft frontal light' }],
    sceneAndSpace: { setting: 'street', atmosphereMedium: 'clear air', foreground: 'none', midground: 'subject', background: 'street', visibilityAndDepth: 'medium depth', narrativePressure: 'calm' },
    lighting: { keyLight: 'soft front', qualityAndFalloff: 'soft', fillLight: 'ambient', rimAndReflectedLight: 'none', emissiveEffects: 'none', volumetricsAndOcclusion: 'none', highlightsAndShadows: 'soft shadows' },
    colorAndStyle: { temperatureAndTone: 'neutral', paletteRelationships: 'muted blue', saturationBrightnessContrast: 'medium', whiteBalanceAndExposure: 'balanced', mediumAndTexture: 'cinematic image', postProcessing: 'subtle grain' },
  },
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

function fakeChild(lines: string[], exitCode = 0, stderr = '') {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  child.stdin.once('finish', () => {
    child.stdout.end(lines.join('\n'))
    child.stderr.end(stderr)
    child.emit('close', exitCode, null)
  })
  return child
}

describe('remake prompt Codex executor', () => {
  it('builds a strict image schema for every nested object accepted by Codex', () => {
    const schema = promptResultSchema('image:start')
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      const row = value as Record<string, unknown>
      if (row.type === 'object') {
        expect(row.additionalProperties).toBe(false)
        expect(Object.keys(row.properties as Record<string, unknown>)).toEqual(row.required)
      }
      visit(row.properties)
      visit(row.items)
    }

    visit(schema)
  })

  it('instructs the image skill to exclude character appearance descriptors from the generated prompt', async () => {
    const { imagePrompt } = await import('@/lib/workers/handlers/remake-prompt')
    const prompt = imagePrompt(
      {
        projectId: '11111111-1111-4111-8111-111111111111',
        remakeProjectId: '22222222-2222-4222-8222-222222222222',
        shotId: '33333333-3333-4333-8333-333333333333',
        stableKey: 'shot-01',
        sourceRevision: 1,
        shotRevision: 1,
        shotRevisionId: '44444444-4444-4444-8444-444444444444',
        keyframeMediaRefs: { first: 'frames/start.jpg' },
      },
      'start',
    )

    expect(prompt).toContain('$image-to-structured-prompt')
    expect(prompt).toContain('integratedGenerationPrompt 中禁止输出任何与人物外貌形象有关的描述词')
    expect(prompt).toContain('人物外观一律由参考图提供')
  })

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

    const output = await runCodexPromptAnalysis({ targetKey: 'image:start', prompt: 'analyze this image', media: [{ name: 'start.jpg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }] }, { spawn: spawn as never })

    expect(spawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
    expect(command).toBe('codex')
    expect(args).toContain('exec')
    expect(args).toContain('--image')
    expect(args[args.indexOf('--image') + 1]).toMatch(/\.jpg$/)
    expect(args).not.toContain('resume')
    expect(options).toMatchObject({ shell: false })
    expect(output.sessionId).toBe('session-new')
    expect(output.result).toEqual(imageAnalysis)
  })

  it('attaches PNG and WebP media but never attaches a source video as an image', async () => {
    const child = fakeChild([JSON.stringify({ type: 'final', result: imageAnalysis })])
    const spawn = vi.fn(() => child)
    await runCodexPromptAnalysis({
      targetKey: 'image:middle', prompt: 'analyze image',
      media: [
        { name: 'frame', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
        { name: 'frame', bytes: Buffer.from('RIFFxxxxWEBP') },
        { name: 'source', bytes: Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]) },
      ],
    }, { spawn: spawn as never })

    const args = (spawn.mock.calls[0] as unknown as [string, string[], unknown])[1]
    const imagePaths = args.filter((value, index) => args[index - 1] === '--image')
    expect(imagePaths).toHaveLength(2)
    expect(imagePaths).toEqual(expect.arrayContaining([expect.stringMatching(/\.png$/), expect.stringMatching(/\.webp$/)]))
    expect(imagePaths.some((path) => path.endsWith('.mp4'))).toBe(false)
  })

  it('runs one whole-video Codex process inside its workspace without attaching keyframes', async () => {
    const child = fakeChild([JSON.stringify({ type: 'final', result: { shots: [{ stableShotId: 'shot-01', analysis: videoAnalysis }] } })])
    const spawn = vi.fn(() => child)
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'waoowaoo-video-executor-test-'))

    try {
      await runCodexVideoWorkspaceAnalysis({ targetKey: 'video', prompt: 'Read manifest.csv and source.mp4.', workspaceDirectory }, { spawn: spawn as never })

      expect(spawn).toHaveBeenCalledTimes(1)
      const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
      expect(command).toBe('codex')
      expect(args).toEqual(expect.arrayContaining(['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--output-schema']))
      expect(args).not.toContain('--image')
      expect(options).toMatchObject({ shell: false, cwd: workspaceDirectory })
      await expect(stat(join(workspaceDirectory, 'result-schema.json'))).resolves.toBeDefined()
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true })
    }
  })

  it('keeps actionable but redacted Codex stderr when the CLI exits nonzero', async () => {
    const child = fakeChild([], 1, 'Invalid schema at /tmp/private/result-schema.json api_key=very-secret https://example.test/path')
    await expect(runCodexPromptAnalysis({ targetKey: 'image:start', prompt: 'analyze image' }, { spawn: vi.fn(() => child) as never }))
      .rejects.toThrow('Invalid schema')
    await expect(runCodexPromptAnalysis({ targetKey: 'image:start', prompt: 'analyze image' }, { spawn: vi.fn(() => fakeChild([], 1, 'Invalid schema at /tmp/private api_key=very-secret')) as never }))
      .rejects.not.toThrow(/private|very-secret/)
  })

  it('retains a non-keyword CLI error after redaction instead of collapsing it to an exit code', async () => {
    await expect(runCodexPromptAnalysis({ targetKey: 'image:start', prompt: 'analyze image' }, {
      spawn: vi.fn(() => fakeChild([], 1, 'Could not read /tmp/private/source.jpg token=very-secret')) as never,
    })).rejects.toThrow('Could not read [redacted-path]')
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
