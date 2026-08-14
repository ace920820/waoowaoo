import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import RemakeVideoStage from '@/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage'
import { buildShotToUnitMap } from '@/lib/remake-projects/unit/adapter'

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

function unitSnapshot(): RemakeSnapshot {
  const base = baseSnapshot()
  return {
    ...base,
    units: [
      {
        id: 'unit-1',
        userLabel: null,
        members: [
          { shotRevisionId: 'rev-1', ordinal: 1, shotId: 'shot-1', sequence: 1, label: '镜头1', durationSeconds: 1.5 },
          { shotRevisionId: 'rev-2', ordinal: 2, shotId: 'shot-2', sequence: 2, label: '镜头2', durationSeconds: 2.5 },
        ],
        track: {
          id: 'utrack-1',
          adoptedVersionId: 'uv-1',
          hasInvalidated: false,
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
        },
        actionSheets: [{ id: 'uas-1', mediaId: 'uas-1', mediaUrl: '/uas/1', fingerprint: 'f', status: 'completed' }],
      },
    ],
  }
}

function renderStage(snapshot: RemakeSnapshot, projectId = 'project-1'): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const stage = createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(RemakeVideoStage, { projectId, snapshot }),
  )
  return renderToStaticMarkup(stage)
}

// ─── Mocks ────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

vi.mock('@/lib/query/hooks', async () => {
  const actual = await vi.importActual('@/lib/query/hooks')
  return {
    ...actual,
    useProjectData: () => ({
      data: {
        id: 'project-1',
        name: 'Test Project',
        type: 'remake',
        novelPromotionData: { videoModel: 'ark::test-video-model', capabilityOverrides: {} },
      },
      isLoading: false,
    }),
    useUserModels: () => ({
      data: {
        video: [
          {
            value: 'ark::test-video-model',
            label: 'Test Video Model',
            provider: 'ark',
            providerName: 'Ark',
            capabilities: {
              video: {
                durationOptions: [5, 10, 15],
                resolutionOptions: ['720p', '1080p'],
                generateAudioOptions: [false, true],
                fieldI18n: { duration: { label: '时长' }, resolution: { label: '分辨率' }, generateAudio: { label: '生成音频' } },
              },
            },
            videoPricingTiers: [],
          },
        ],
      },
      isLoading: false,
    }),
    useProjectAssets: () => ({ data: null, isLoading: false }),
  }
})

// Mock heavy sibling components to keep the test focused on unit-mode wiring.
vi.mock('@/app/[locale]/workspace/[projectId]/modes/remake/RemakeProductionTools', () => ({
  RemakeProductionTools: () => createElement('div', { 'data-testid': 'production-tools' }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/remake/ShotOverview', () => ({
  RemakeShotOverview: () => createElement('div', { 'data-testid': 'shot-overview' }),
}))

describe('remake video unit stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the unit-mode toggle entry (D-14)', () => {
    const html = renderStage(baseSnapshot())
    expect(html).toContain('unit-mode-toggle')
    expect(html).toContain('合并 unit 模式')
  })

  it('renders short-shot hint without auto-merge suggestion (D-20)', () => {
    const html = renderStage(baseSnapshot())
    // shot-1 duration 1.5s < 4s
    expect(html).toContain('镜头过短')
  })

  it('renders 由 unit 交付 status and jump-back for a member shot (D-18)', () => {
    const html = renderStage(unitSnapshot())
    // shot-1 belongs to unit-1: the selected card shows the delivered-by-unit chip
    expect(html).toContain('delivered-by-unit')
    expect(html).toContain('由 unit 交付')
    expect(html).toContain('jump-to-unit')
    // the generate button is replaced by the jump button
    expect(html).not.toContain('generate-button')
  })

  it('buildShotToUnitMap maps member shots to their unit (D-18)', () => {
    const map = buildShotToUnitMap(unitSnapshot())
    expect(map.get('shot-1')).toBe('unit-1')
    expect(map.get('shot-2')).toBe('unit-1')
  })

  it('renders stretched badge when a short shot has an adopted version (D-12)', () => {
    const snapshot = baseSnapshot()
    snapshot.shots = [
      {
        ...snapshot.shots[0]!,
        videoGeneration: {
          track: {
            id: 'vt-1',
            adoptedVersionId: 'vv-1',
            hasInvalidated: false,
            batches: [
              {
                id: 'vb-1',
                operationKey: 'op-1',
                versions: [
                  { id: 'vv-1', ordinal: 1, mediaUrl: '/v/1', status: 'completed', invalidated: false, note: null },
                ],
              },
            ],
          },
        },
      },
    ]
    const html = renderStage(snapshot)
    expect(html).toContain('stretched-badge')
    expect(html).toContain('拉长到最短档')
  })
})
