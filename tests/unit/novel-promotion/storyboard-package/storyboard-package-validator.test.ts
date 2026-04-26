import { describe, expect, it } from 'vitest'
import { validateStoryboardPackage } from '@/lib/novel-promotion/storyboard-package'
import { buildValidStoryboardPackage } from './storyboard-package-fixtures'

describe('storyboard package validator', () => {
  it('accepts a minimal valid v1 package', () => {
    const result = validateStoryboardPackage(buildValidStoryboardPackage())

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schema).toBe('waoo.storyboard_package')
      expect(result.data.scenes[0].segments[0].reviewConfig.templateKey).toBe('grid-6')
    }
  })

  it('rejects unsupported schema and version', () => {
    const result = validateStoryboardPackage({
      ...buildValidStoryboardPackage(),
      schema: 'other.schema',
      schemaVersion: '2.0',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['schema', 'schemaVersion']))
    }
  })

  it('rejects invalid template keys and reference modes', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          reviewConfig: { ...segment.reviewConfig, templateKey: 'grid-5' },
          videoConfig: { ...segment.videoConfig, referenceMode: 'timeline-reference' },
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        'scenes.0.segments.0.reviewConfig.templateKey',
        'scenes.0.segments.0.videoConfig.referenceMode',
      ]))
    }
  })

  it('rejects segments longer than fifteen seconds', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [{ ...segment, targetDurationSec: 16 }],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'scenes.0.segments.0.targetDurationSec' }),
      ]))
    }
  })

  it('rejects shot counts beyond the selected template slot count', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const shots = Array.from({ length: 5 }, (_, index) => ({
      ...segment.cinematicPlan.shots[0],
      index: index + 1,
      shotId: `shot-${index + 1}`,
      title: `镜头 ${index + 1}`,
    }))

    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          reviewConfig: { ...segment.reviewConfig, templateKey: 'grid-4' },
          cinematicPlan: { ...segment.cinematicPlan, shots },
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'scenes.0.segments.0.cinematicPlan.shots' }),
      ]))
    }
  })

  it('rejects duplicate segment ids within a package', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [
          segment,
          { ...segment, order: 2, timecode: '00:15-00:30', title: '重复片段' },
        ],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'scenes.0.segments.1.segmentId' }),
      ]))
    }
  })

  it('rejects duplicate shot indexes within a segment', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const shot = segment.cinematicPlan.shots[0]
    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          cinematicPlan: {
            ...segment.cinematicPlan,
            shots: [shot, { ...shot, shotId: 'duplicate-shot', title: '重复镜头' }],
          },
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'scenes.0.segments.0.cinematicPlan.shots.1.index' }),
      ]))
    }
  })

  it('reports missing required prompt fields with paths', () => {
    const pkg = buildValidStoryboardPackage()
    const segment = pkg.scenes[0].segments[0]
    const result = validateStoryboardPackage({
      ...pkg,
      scenes: [{
        ...pkg.scenes[0],
        segments: [{
          ...segment,
          reviewConfig: { ...segment.reviewConfig, referencePromptText: '' },
          videoConfig: { ...segment.videoConfig, videoPrompt: '' },
          cinematicPlan: {
            ...segment.cinematicPlan,
            shots: [{ ...segment.cinematicPlan.shots[0], imagePrompt: '' }],
          },
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        'scenes.0.segments.0.reviewConfig.referencePromptText',
        'scenes.0.segments.0.videoConfig.videoPrompt',
        'scenes.0.segments.0.cinematicPlan.shots.0.imagePrompt',
      ]))
    }
  })
})
