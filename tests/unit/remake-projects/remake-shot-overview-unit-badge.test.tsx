import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { RemakeShotOverview } from '@/app/[locale]/workspace/[projectId]/modes/remake/ShotOverview'

function snapshotWithTwoShots(): RemakeSnapshot {
  return {
    project: { id: 'project-1', name: 'Test', type: 'remake' },
    source: { status: 'analyzed', mediaId: 'media-1', mediaUrl: '/media/1' },
    shots: [
      {
        id: 'shot-1',
        stableKey: 'sk-1',
        sequence: 1,
        reviewStatus: 'keep',
        needsReview: false,
        currentRevision: 1,
        timeRange: { start: '00:00:00.000', end: '00:00:01.500' },
        keyframes: {
          start: { mediaId: 'kf-1s', mediaUrl: '/kf/1s' },
          middle: { mediaId: 'kf-1m', mediaUrl: '/kf/1m' },
          end: { mediaId: 'kf-1e', mediaUrl: '/kf/1e' },
        },
        keyframeGeneration: {
          tracks: [],
          actionSheet: { status: 'current', id: 'as-1', mediaId: 'as-1', fingerprint: 'f1' },
          history: [],
        },
        videoGeneration: { track: null },
        promptTracks: [],
        revisions: [
          { id: 'rev-1', revision: 1, changeReason: 'init', lifecycleState: 'active', sourceRevision: 1 },
        ],
        provenance: [],
      },
      {
        id: 'shot-2',
        stableKey: 'sk-2',
        sequence: 2,
        reviewStatus: 'keep',
        needsReview: false,
        currentRevision: 1,
        timeRange: { start: '00:00:01.500', end: '00:00:04.000' },
        keyframes: {
          start: { mediaId: 'kf-2s', mediaUrl: '/kf/2s' },
          middle: { mediaId: 'kf-2m', mediaUrl: '/kf/2m' },
          end: { mediaId: 'kf-2e', mediaUrl: '/kf/2e' },
        },
        keyframeGeneration: {
          tracks: [],
          actionSheet: { status: 'current', id: 'as-2', mediaId: 'as-2', fingerprint: 'f2' },
          history: [],
        },
        videoGeneration: { track: null },
        promptTracks: [],
        revisions: [
          { id: 'rev-2', revision: 1, changeReason: 'init', lifecycleState: 'active', sourceRevision: 1 },
        ],
        provenance: [],
      },
    ],
    tasks: [],
    units: [],
  } as RemakeSnapshot
}

function renderOverview(snapshot: RemakeSnapshot, shotToUnit?: ReadonlyMap<string, string> | null): string {
  const overview = createElement(RemakeShotOverview, {
    shots: snapshot.shots,
    selectedShotId: 'shot-1',
    onSelectShot: () => {},
    shotToUnit,
  })
  return renderToStaticMarkup(overview)
}

// ─── Mocks ────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

describe('RemakeShotOverview unit-membership badge (D-18)', () => {
  it('shows 由 unit 交付 badge only for member shots', () => {
    const html = renderOverview(snapshotWithTwoShots(), new Map([['shot-1', 'unit-1']]))
    expect(html).toContain('unit-badge-shot-1')
    expect(html).toContain('由 unit 交付')
    expect(html).not.toContain('unit-badge-shot-2')
  })

  it('renders no badge when shotToUnit is not provided', () => {
    const html = renderOverview(snapshotWithTwoShots(), null)
    expect(html).not.toContain('由 unit 交付')
  })

  it('dissolved units release members: map without the shot shows no badge', () => {
    const html = renderOverview(snapshotWithTwoShots(), new Map())
    expect(html).not.toContain('unit-badge-shot-1')
  })
})
