import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateImportedSceneDetectProject } from '@/vendor/scenedetect/utils/importValidation'
import type { SceneDetectProject } from '@/vendor/scenedetect'

const appPath = 'src/vendor/scenedetect/App.tsx'
const headerPath = 'src/vendor/scenedetect/components/Header.tsx'
const runtimePath = 'src/lib/remake-projects/scenedetect/runtime-client.ts'

function sampleProject(overrides: Partial<SceneDetectProject> = {}): SceneDetectProject {
  return {
    schemaVersion: 2,
    type: 'scenedetect-project',
    project: { id: 'imported-1', name: 'Imported', createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z' },
    source: { fileName: 'clip.mp4', size: 1, duration: 10, fps: 30, width: 1920, height: 1080, totalFrames: 300 },
    analysis: { detector: 'pySceneDetect', detectorType: 'content', threshold: 27, analyzedAt: '2026-08-14T00:00:00Z', status: 'analyzed_review' },
    view: { currentFrame: 0, activeShotId: null },
    shots: [
      {
        id: 's1', shotNumber: 1, rawStartFrame: 0, rawEndFrame: 90, startFrame: 0, endFrame: 90,
        startTimecode: '00:00:00.000', endTimecode: '00:00:03.000', duration: 3, durationFrames: 90,
        firstFrameUrl: '', middleFrameUrl: '', lastFrameUrl: '', status: 'keep', modifiedSource: 'AI',
        tags: [], notes: '', keyframeFrames: { first: 0, middle: 45, last: 90 },
      },
    ],
    ...overrides,
  }
}

describe('scenedetect embedded export/import contract (Phase 镜头分析页导出/加载)', () => {
  it('Header renders the export button for embedded when canExport is on, plus the import button', () => {
    const source = readFileSync(headerPath, 'utf8')
    expect(source).toContain('canExport?: boolean')
    // export button condition covers embedded + canExport
    expect(source).toMatch(/\(\!embedded \|\| canExport\)/)
    expect(source).toContain('scenedetect-export-button')
    // embedded-only import button wiring
    expect(source).toContain('scenedetect-import-button')
    expect(source).toContain('onImportClick')
    expect(source).toContain('导入切分点')
  })

  it('App wires the import handler, hidden file input and ExportModal gate', () => {
    const source = readFileSync(appPath, 'utf8')
    expect(source).toContain('readSceneDetectProject')
    expect(source).toContain('validateImportedSceneDetectProject')
    expect(source).toContain('handleImportProjectFile')
    expect(source).toContain('scenedetect-import')
    expect(source).toContain('operationKey: `import:')
    // ExportModal available in embedded when runtime allows export
    expect(source).toMatch(/\(\!embedded \|\| Boolean\(runtime\?\.canExport\(\)\)\)/)
  })

  it('runtime-client enables export for the embedded host', async () => {
    const { createSceneDetectRuntime } = await import('@/lib/remake-projects/scenedetect/runtime-client')
    const runtime = createSceneDetectRuntime('11111111-1111-4111-8111-111111111111')
    expect(runtime.canExport()).toBe(true)
  })
})

describe('validateImportedSceneDetectProject', () => {
  it('accepts a well-formed imported project', () => {
    const result = validateImportedSceneDetectProject(sampleProject(), { totalFrames: 300 })
    expect(result).toEqual({ ok: true })
  })

  it('rejects empty shot lists', () => {
    const result = validateImportedSceneDetectProject(sampleProject({ shots: [] }), { totalFrames: 300 })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('不包含任何镜头') })
  })

  it('rejects frames beyond the current video range', () => {
    const project = sampleProject()
    project.shots[0]!.endFrame = 9999
    const result = validateImportedSceneDetectProject(project, { totalFrames: 300 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('超出当前视频范围')
  })

  it('rejects inverted / non-numeric boundaries', () => {
    const inverted = sampleProject()
    inverted.shots[0] = { ...inverted.shots[0]!, startFrame: 90, endFrame: 10 }
    expect(validateImportedSceneDetectProject(inverted, { totalFrames: 300 }).ok).toBe(false)

    const missing = sampleProject()
    missing.shots[0] = { ...missing.shots[0]!, endFrame: Number.NaN }
    expect(validateImportedSceneDetectProject(missing, { totalFrames: 300 }).ok).toBe(false)
  })

  it('rejects non-ascending shot numbers', () => {
    const project = sampleProject()
    project.shots = [
      { ...project.shots[0]!, id: 's1', shotNumber: 2 },
      { ...project.shots[0]!, id: 's2', shotNumber: 2 },
    ]
    const result = validateImportedSceneDetectProject(project, { totalFrames: 300 })
    expect(result.ok).toBe(false)
  })

  it('skips the frame-range check when the current frame count is unknown', () => {
    const project = sampleProject()
    project.shots[0]!.endFrame = 9999
    expect(validateImportedSceneDetectProject(project).ok).toBe(true)
  })
})
