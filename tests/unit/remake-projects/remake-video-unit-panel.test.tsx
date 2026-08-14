import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { RemakeVideoUnitPanel } from '@/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoUnitPanel'

function baseSnapshot(overrides: Partial<RemakeSnapshot> = {}): RemakeSnapshot {
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
        promptTracks: [
          {
            id: 'pt-1',
            targetKey: 'video',
            latestVersion: { id: 'pv-1', versionNumber: 1, reviewStatus: 'approved' },
            adoptedVersion: { id: 'pv-1', versionNumber: 1, reviewStatus: 'approved', coreText: '镜头1 prompt' },
            needsReview: false,
          },
        ],
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
        promptTracks: [
          {
            id: 'pt-2',
            targetKey: 'video',
            latestVersion: { id: 'pv-2', versionNumber: 1, reviewStatus: 'approved' },
            adoptedVersion: { id: 'pv-2', versionNumber: 1, reviewStatus: 'approved', coreText: '镜头2 prompt' },
            needsReview: false,
          },
        ],
        revisions: [
          { id: 'rev-2', revision: 1, changeReason: 'init', lifecycleState: 'active', sourceRevision: 1 },
        ],
        provenance: [],
      },
    ],
    tasks: [],
    units: [],
    ...overrides,
  } as RemakeSnapshot
}

function unitEntry(overrides: Partial<NonNullable<RemakeSnapshot['units']>[number]> = {}) {
  return {
    id: 'unit-1',
    userLabel: null,
    dissolvedAt: null,
    dissolvedReason: null,
    members: [
      { shotRevisionId: 'rev-1', ordinal: 1, shotId: 'shot-1', sequence: 1, label: '镜头1', durationSeconds: 1.5 },
      { shotRevisionId: 'rev-2', ordinal: 2, shotId: 'shot-2', sequence: 2, label: '镜头2', durationSeconds: 2.5 },
    ],
    track: {
      id: 'utrack-1',
      adoptedVersionId: null,
      hasInvalidated: false,
      batches: [],
    },
    actionSheets: [{ id: 'uas-1', mediaId: 'uas-1', mediaUrl: '/uas/1', fingerprint: 'f', status: 'completed' }],
    ...overrides,
  }
}

function unitSnapshot(unitOverrides: Partial<NonNullable<RemakeSnapshot['units']>[number]> = {}, taskOverrides: unknown = null): RemakeSnapshot {
  const base = baseSnapshot()
  return {
    ...base,
    tasks: taskOverrides ? [taskOverrides] : [],
    units: [unitEntry(unitOverrides)],
  } as RemakeSnapshot
}

function pendingUnitTask() {
  return {
    id: 'task-1',
    type: 'remake_video_unit_generate',
    targetType: 'remake_unit',
    targetId: 'unit-1',
    status: 'processing',
    createdAt: '2026-08-14T00:00:00Z',
    updatedAt: '2026-08-14T00:00:00Z',
  }
}

function committedTrack(adoptedVersionId: string | null, hasInvalidated = false) {
  return {
    id: 'utrack-1',
    adoptedVersionId,
    hasInvalidated,
    batches: [
      {
        id: 'ubatch-1',
        operationKey: 'op-1',
        modelId: 'ark::test-video-model',
        versions: [
          { id: 'uv-1', ordinal: 1, mediaUrl: '/unit-video/1', status: 'completed', invalidated: false, note: null },
        ],
      },
    ],
  }
}

function renderPanel(
  snapshot: RemakeSnapshot,
  unitId: string | null,
  onExit?: () => void,
  onOpenUnit?: (unitId: string) => void,
): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const panel = createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(RemakeVideoUnitPanel, {
      projectId: 'project-1',
      snapshot,
      unitId,
      onExit,
      onOpenUnit,
    }),
  )
  return renderToStaticMarkup(panel)
}

/** 给镜头造 keyframeGeneration tracks：middle 有已采用关键帧，start/end 无 */
function withKeyframeTracks(snapshot: RemakeSnapshot): RemakeSnapshot {
  for (const shot of snapshot.shots) {
    const middleId = `c-${shot.id}-m`
    shot.keyframeGeneration = {
      tracks: [
        {
          id: `t-${shot.id}-start`,
          slot: 'start',
          selectedForGeneration: true,
          adoptedCandidateId: null,
          eligible: true,
          batches: [],
        },
        {
          id: `t-${shot.id}-middle`,
          slot: 'middle',
          selectedForGeneration: true,
          adoptedCandidateId: middleId,
          eligible: true,
          batches: [
            {
              id: `b-${shot.id}`,
              operationKey: `op-${shot.id}`,
              requestedCandidateCount: 1,
              createdAt: '2026-08-14T00:00:00Z',
              candidates: [
                { id: middleId, ordinal: 1, mediaId: `kfm-${shot.id}`, mediaUrl: `/kfm/${shot.id}`, eligible: true },
              ],
            },
          ],
        },
        {
          id: `t-${shot.id}-end`,
          slot: 'end',
          selectedForGeneration: true,
          adoptedCandidateId: null,
          eligible: true,
          batches: [],
        },
      ],
      actionSheet: { status: 'current', id: `as-${shot.id}`, mediaId: `as-${shot.id}`, fingerprint: 'f' },
      history: [],
    }
  }
  return snapshot
}

// ─── Mocks ────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

vi.mock('@/lib/query/hooks', () => ({
  useRefreshRemakeProject: () => vi.fn(),
}))

describe('RemakeVideoUnitPanel (D-19 revised lifecycle)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the unit list with 进行中 / 已解散 sections when unitId is null', () => {
    const snapshot = unitSnapshot()
    snapshot.units = [
      unitEntry({ id: 'unit-active', userLabel: '开场追逐' }),
      unitEntry({
        id: 'unit-gone',
        userLabel: null,
        dissolvedAt: '2026-08-14T09:00:00Z',
        dissolvedReason: '镜头重排',
      }),
    ]
    const html = renderPanel(snapshot, null)
    expect(html).toContain('unit-list')
    expect(html).toContain('unit-list-active')
    expect(html).toContain('unit-list-dissolved')
    expect(html).toContain('unit-row-unit-active')
    expect(html).toContain('unit-row-unit-gone')
    expect(html).toContain('开场追逐')
    expect(html).toContain('已解散')
  })

  it('shows an empty state when no units exist', () => {
    const html = renderPanel(baseSnapshot(), null)
    expect(html).toContain('unit-list-empty')
  })

  it('renders detail: members, dissolve + generate for a fresh unit', () => {
    const html = renderPanel(unitSnapshot(), 'unit-1')
    expect(html).toContain('unit-panel')
    expect(html).toContain('镜头1')
    expect(html).toContain('镜头2')
    expect(html).toContain('edit-members-button')
    expect(html).toContain('dissolve-unit-button')
    expect(html).toContain('generate-unit-button')
    expect(html).toContain('生成 unit 视频')
  })

  it('committed batch no longer freezes members; regenerate + invalidate hint (D-19 revised)', () => {
    const html = renderPanel(unitSnapshot({ track: committedTrack('uv-1') }), 'unit-1')
    expect(html).toContain('edit-members-button')
    expect(html).toContain('members-invalidate-hint')
    expect(html).toContain('重新生成 unit 视频')
    expect(html).not.toContain('members-frozen-hint')
  })

  it('a pending generation task still freezes members (D-19)', () => {
    const html = renderPanel(unitSnapshot({ track: committedTrack('uv-1') }, pendingUnitTask()), 'unit-1')
    expect(html).toContain('members-frozen-hint')
    expect(html).not.toContain('edit-members-button')
    expect(html).not.toContain('generate-unit-button')
  })

  it('dissolved unit is read-only: banner, no edit/generate/dissolve/adopt/note', () => {
    const html = renderPanel(
      unitSnapshot({
        dissolvedAt: '2026-08-14T09:00:00Z',
        dissolvedReason: '镜头重排',
        track: committedTrack('uv-1'),
      }),
      'unit-1',
    )
    expect(html).toContain('unit-dissolved-banner')
    expect(html).toContain('镜头重排')
    expect(html).not.toContain('dissolve-unit-button')
    expect(html).not.toContain('edit-members-button')
    expect(html).not.toContain('generate-unit-button')
    // 无「采用」「重新确认」「保存备注」等写操作按钮（只读）
    expect(html).not.toMatch(/>采用</)
    expect(html).not.toContain('重新确认')
    expect(html).not.toContain('保存备注')
    // 版本与视频仍可回看
    expect(html).toContain('/unit-video/1')
  })

  it('member rows show the adopted keyframe thumbnail and the referenced slot (Phase 09.2)', () => {
    const html = renderPanel(withKeyframeTracks(unitSnapshot()), 'unit-1')
    expect(html).toContain('/kfm/shot-1')
    expect(html).toContain('/kfm/shot-2')
    expect(html).toContain('引用 middle 关键帧')
    expect(html).toContain('成员镜头与引用素材')
  })

  it('action sheet card renders the merged sheet image or a pending explanation (Phase 09.2)', () => {
    const withSheet = renderPanel(unitSnapshot(), 'unit-1')
    expect(withSheet).toContain('unit-action-sheet-card')
    expect(withSheet).toContain('/uas/1')
    expect(withSheet).toContain('fingerprint')

    const withoutSheet = renderPanel(unitSnapshot({ actionSheets: [] }), 'unit-1')
    expect(withoutSheet).toContain('尚未生成')
  })

  it('renders the unit switcher with #N chips and highlights the current unit (Phase 09.2)', () => {
    const snapshot = unitSnapshot()
    snapshot.units = [
      unitEntry({ id: 'unit-1', userLabel: null }),
      unitEntry({
        id: 'unit-2',
        userLabel: null,
        dissolvedAt: '2026-08-14T09:00:00Z',
        dissolvedReason: null,
      }),
    ]
    const html = renderPanel(snapshot, 'unit-1')
    expect(html).toContain('unit-switcher')
    expect(html).toContain('unit-switcher-unit-1')
    expect(html).toContain('unit-switcher-unit-2')
    expect(html).toContain('data-current="true"')
    expect(html).toContain('#1')
    expect(html).toContain('#2')
    expect(html).toContain('已解散')
  })
})
