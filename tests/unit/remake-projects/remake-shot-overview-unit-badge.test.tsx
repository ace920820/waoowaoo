import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { RemakeShotOverview } from '@/app/[locale]/workspace/[projectId]/modes/remake/ShotOverview'
import { buildShotUnitBadgeMap, type ShotUnitBadge } from '@/lib/remake-projects/unit/adapter'

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

function renderOverview(
  snapshot: RemakeSnapshot,
  unitBadges?: ReadonlyMap<string, ShotUnitBadge> | null,
  onJumpToUnit?: (unitId: string) => void,
): string {
  const overview = createElement(RemakeShotOverview, {
    shots: snapshot.shots,
    selectedShotId: 'shot-1',
    onSelectShot: () => {},
    unitBadges,
    onJumpToUnit,
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

describe('RemakeShotOverview unit-membership badge (D-18 / Phase 09.2)', () => {
  function badgeSnapshot() {
    const snapshot = snapshotWithTwoShots()
    snapshot.units = [
      {
        id: 'unit-1',
        userLabel: null,
        dissolvedAt: null,
        dissolvedReason: null,
        members: [
          { shotRevisionId: 'rev-1', ordinal: 1, shotId: 'shot-1', sequence: 1, label: '镜头1', durationSeconds: 1.5 },
        ],
        track: null,
        actionSheets: [],
      },
      {
        id: 'unit-2',
        userLabel: null,
        dissolvedAt: null,
        dissolvedReason: null,
        members: [
          { shotRevisionId: 'rev-2', ordinal: 1, shotId: 'shot-2', sequence: 2, label: '镜头2', durationSeconds: 2.5 },
        ],
        track: null,
        actionSheets: [],
      },
    ]
    return snapshot
  }

  it('shows #N 由 unit 交付 badge with the unit tone, one per member shot', () => {
    const html = renderOverview(badgeSnapshot(), buildShotUnitBadgeMap(badgeSnapshot()))
    expect(html).toContain('unit-badge-shot-1')
    expect(html).toContain('unit-badge-shot-2')
    expect(html).toContain('#1 由 unit 交付')
    expect(html).toContain('#2 由 unit 交付')
    // data-unit-number + tone attributes drive the per-unit color
    expect(html).toContain('data-unit-number="1"')
    expect(html).toContain('data-unit-tone="sky"')
    expect(html).toContain('data-unit-tone="amber"')
  })

  it('adjacent units get different tones (sky / amber / emerald rotation)', () => {
    const map = buildShotUnitBadgeMap(badgeSnapshot())
    expect(map.get('shot-1')!.toneKey).not.toBe(map.get('shot-2')!.toneKey)
    expect(map.get('shot-1')!.unitNumber).toBe(1)
    expect(map.get('shot-2')!.unitNumber).toBe(2)
  })

  it('renders no badge when unitBadges is not provided', () => {
    const html = renderOverview(snapshotWithTwoShots(), null)
    expect(html).not.toContain('由 unit 交付')
  })

  it('dissolved units release members: map without the shot shows no badge', () => {
    const html = renderOverview(snapshotWithTwoShots(), new Map())
    expect(html).not.toContain('unit-badge-shot-1')
  })
})
