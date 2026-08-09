import { describe, expect, it } from 'vitest'
import { remakeSnapshotRefreshInterval, type RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

function snapshot(overrides: Partial<RemakeSnapshot> = {}): RemakeSnapshot {
  return {
    project: { id: 'project-1', name: 'Demo', type: 'remake' },
    source: { status: 'analyzed', mediaId: 'source-1', mediaUrl: '/source-1' },
    shots: [{
      id: 'shot-1', stableKey: 'scene-1', sequence: 1, reviewStatus: 'pending', needsReview: false,
      revisions: [],
      provenance: [],
      keyframes: {
        start: { mediaId: 'frame-1', mediaUrl: '/frame-1' },
        middle: { mediaId: 'frame-2', mediaUrl: '/frame-2' },
        end: { mediaId: 'frame-3', mediaUrl: '/frame-3' },
      },
    }],
    tasks: [],
    ...overrides,
  }
}

describe('remake snapshot refresh interval', () => {
  it('keeps fetching after SceneDetect exposes a shot before its keyframes are persisted', () => {
    const pendingKeyframes = snapshot({
      shots: [{ ...snapshot().shots[0], keyframes: {
        start: { mediaId: null, mediaUrl: null },
        middle: { mediaId: null, mediaUrl: null },
        end: { mediaId: null, mediaUrl: null },
      } }],
    })

    expect(remakeSnapshotRefreshInterval(pendingKeyframes)).toBe(1000)
  })

  it('stops fetching once all current-scene keyframes are available', () => {
    expect(remakeSnapshotRefreshInterval(snapshot())).toBe(false)
  })

  it('keeps fetching while an image or video Prompt task is queued or processing', () => {
    expect(remakeSnapshotRefreshInterval(snapshot({ tasks: [{ id: 'task-1', type: 'REMAKE_IMAGE_PROMPT_ANALYZE', targetType: 'remake_shot', targetId: 'shot-1', status: 'queued', createdAt: '', updatedAt: '' }] }))).toBe(1000)
    expect(remakeSnapshotRefreshInterval(snapshot({ tasks: [{ id: 'task-2', type: 'REMAKE_VIDEO_PROMPT_ANALYZE', targetType: 'remake_project', targetId: 'project-1', status: 'processing', createdAt: '', updatedAt: '' }] }))).toBe(1000)
  })
})
