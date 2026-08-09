import { describe, expect, it } from 'vitest'
import { remakeSnapshotRefreshInterval, type RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

function snapshot(overrides: Partial<RemakeSnapshot> = {}): RemakeSnapshot {
  return {
    project: { id: 'project-1', name: 'Demo', type: 'remake' },
    source: { status: 'analyzed', mediaId: 'source-1', mediaUrl: '/source-1' },
    shots: [{
      id: 'shot-1', stableKey: 'scene-1', sequence: 1, reviewStatus: 'pending', needsReview: false,
      revisions: [],
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
})
