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
    expect(html).not.toContain('采用')
    expect(html).not.toContain('保存备注')
    // 版本与视频仍可回看
    expect(html).toContain('/unit-video/1')
  })
})
