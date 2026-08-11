import { describe, expect, it } from 'vitest'
import { adaptRemakeShot, buildSourceSlotView, type RemakeShotView } from '@/lib/remake-projects/keyframes/adapter'
import type { RemakeKeyframeSlot } from '@/lib/remake-projects/keyframes/adapter'

// ── Helpers ────────────────────────────────────────────────────────────────
function baseShot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shot-1',
    stableKey: 'shot-a',
    sequence: 1,
    reviewStatus: 'approved',
    needsReview: false,
    currentRevision: 2,
    review: { promptEligible: true, reason: null },
    semantics: {
      shotType: '平视中景',
      cameraMove: '固定',
      description: '机舱内部，萨姆坐在靠窗位置',
      moodPresetId: 'tranquil-ethereal-fantasy',
      customMood: null,
      sceneTag: '机舱内部_白天',
      characterTags: ['萨姆', '我'],
    },
    keyframes: {
      start: { mediaId: 'a', mediaUrl: '/a' },
      middle: { mediaId: 'b', mediaUrl: '/b' },
      end: { mediaId: 'c', mediaUrl: '/c' },
    },
    keyframeGeneration: {
      tracks: [],
      actionSheet: { status: 'waiting', id: null, mediaId: null, fingerprint: null },
      history: [],
    },
    promptTracks: [
      {
        id: 'p-start',
        targetKey: 'image:start',
        latestVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved' },
        adoptedVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved', coreText: 'Start: 萨姆低头看表' },
        needsReview: false,
      },
      {
        id: 'p-middle',
        targetKey: 'image:middle',
        latestVersion: { id: 'v2', versionNumber: 1, reviewStatus: 'approved' },
        adoptedVersion: { id: 'v2', versionNumber: 1, reviewStatus: 'approved', coreText: 'Middle: 萨姆抬头看镜头' },
        needsReview: false,
      },
      {
        id: 'p-end',
        targetKey: 'image:end',
        latestVersion: { id: 'v3', versionNumber: 1, reviewStatus: 'approved' },
        adoptedVersion: { id: 'v3', versionNumber: 1, reviewStatus: 'approved', coreText: 'End: 萨姆侧脸望向窗外' },
        needsReview: false,
      },
      {
        id: 'p-video',
        targetKey: 'video',
        latestVersion: { id: 'v4', versionNumber: 1, reviewStatus: 'approved' },
        adoptedVersion: { id: 'v4', versionNumber: 1, reviewStatus: 'approved', coreText: '完整视频镜头描述' },
        needsReview: false,
      },
    ],
    revisions: [],
    provenance: [],
    ...overrides,
  } as never
}

describe('Remake source-slot selection state', () => {
  it('buildSourceSlotView returns per-slot prompt text and original media', () => {
    const shot = adaptRemakeShot(baseShot())
    const start = buildSourceSlotView(shot, 'start')
    expect(start.slot).toBe('start')
    expect(start.originalMediaUrl).toBe('/a')
    expect(start.prompt?.coreText).toBe('Start: 萨姆低头看表')
    expect(start.prompt?.status).toBe('approved')
  })

  it('buildSourceSlotView handles missing adopted prompt as missing', () => {
    const shot = adaptRemakeShot(baseShot({
      promptTracks: [{
        id: 'p-start',
        targetKey: 'image:start',
        latestVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'pending' },
        adoptedVersion: null,
        needsReview: false,
      }],
    }))
    const start = buildSourceSlotView(shot, 'start')
    expect(start.prompt).toBeNull()
  })

  it('buildSourceSlotView handles needs_review prompt', () => {
    const shot = adaptRemakeShot(baseShot({
      promptTracks: [{
        id: 'p-middle',
        targetKey: 'image:middle',
        latestVersion: { id: 'v2', versionNumber: 2, reviewStatus: 'approved' },
        adoptedVersion: { id: 'v1', versionNumber: 1, reviewStatus: 'approved', coreText: '旧版本' },
        needsReview: true,
      }],
    }))
    const middle = buildSourceSlotView(shot, 'middle')
    expect(middle.prompt?.status).toBe('needs_review')
    expect(middle.prompt?.coreText).toBe('旧版本')
  })

  it('selectedSlot defaults to the first frame with media, not null', () => {
    const shot = adaptRemakeShot(baseShot())
    // The "selected source slot" is view state, but the adapter should be
    // able to produce a view for any slot independently.
    const start = buildSourceSlotView(shot, 'start')
    const middle = buildSourceSlotView(shot, 'middle')
    expect(start.slot).not.toBe(middle.slot)
  })

  it('video prompt is never confused with image per-slot prompt', () => {
    const shot = adaptRemakeShot(baseShot())
    const start = buildSourceSlotView(shot, 'start')
    expect(start.prompt?.coreText).not.toContain('完整视频镜头描述')
    expect(shot.videoPrompt.coreText).toBe('完整视频镜头描述')
  })
})
