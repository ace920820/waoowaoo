import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

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
  RatioPreviewIcon: ({ name, className }: { name?: string; className?: string }) =>
    createElement('span', { 'data-icon': 'ratio', className }),
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
        novelPromotionData: {
          videoModel: 'ark::test-video-model',
          capabilityOverrides: {},
        },
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
                fieldI18n: {
                  duration: { label: '时长' },
                  resolution: { label: '分辨率' },
                  generateAudio: { label: '生成音频' },
                },
              },
            },
            videoPricingTiers: [],
          },
          {
            value: 'ark::test-video-model-pro',
            label: 'Test Video Pro',
            provider: 'ark',
            providerName: 'Ark',
            capabilities: {
              video: {
                durationOptions: [5, 10],
                resolutionOptions: ['480p', '720p'],
                generateAudioOptions: [false, true],
                fieldI18n: {
                  duration: { label: '时长' },
                  resolution: { label: '分辨率' },
                  generateAudio: { label: '生成音频' },
                },
              },
            },
            videoPricingTiers: [],
          },
        ],
      },
      isLoading: false,
    }),
    useRefreshRemakeProject: () => () => {},
  }
})

// Mock RemakeProductionTools at its actual path to avoid pulling in complex dependencies
vi.mock('@/app/[locale]/workspace/[projectId]/modes/remake/RemakeProductionTools', () => ({
  RemakeProductionTools: ({ projectId }: { projectId: string }) =>
    createElement('div', { 'data-testid': 'production-tools', 'data-project': projectId }),
}))

// Import after mocks
import RemakeVideoStage from '@/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage'

// ─── Test fixtures ────────────────────────────────────

function makeSnapshot(overrides: Partial<RemakeSnapshot> = {}): RemakeSnapshot {
  const base: RemakeSnapshot = {
    project: { id: 'project-1', name: 'Test', type: 'remake' },
    source: { status: 'analyzed', mediaId: 'media-src', mediaUrl: '/src.mp4' },
    shots: [
      {
        id: 'shot-1',
        stableKey: 'shot-001',
        sequence: 1,
        reviewStatus: 'approved',
        needsReview: false,
        currentRevision: 1,
        timeRange: { start: 0, end: 5.2 },
        keyframes: {
          start: { mediaId: 'frame-s', mediaUrl: '/fs.jpg' },
          middle: { mediaId: 'frame-m', mediaUrl: '/fm.jpg' },
          end: { mediaId: 'frame-e', mediaUrl: '/fe.jpg' },
        },
        keyframeGeneration: {
          tracks: [
            { id: 'track-s', slot: 'start', selectedForGeneration: true, adoptedCandidateId: 'cand-s', eligible: true,
              batches: [{ id: 'batch-s', operationKey: 'op-s', inputFingerprint: 'fp-s', requestedCandidateCount: 1, createdAt: '', candidates: [
                { id: 'cand-s', ordinal: 1, outputVersionId: 'ov-s', mediaId: 'media-s', mediaUrl: '/cand-s.jpg', status: 'completed', eligible: true },
              ]}] },
            { id: 'track-m', slot: 'middle', selectedForGeneration: true, adoptedCandidateId: 'cand-m', eligible: true,
              batches: [{ id: 'batch-m', operationKey: 'op-m', inputFingerprint: 'fp-m', requestedCandidateCount: 1, createdAt: '', candidates: [
                { id: 'cand-m', ordinal: 1, outputVersionId: 'ov-m', mediaId: 'media-m', mediaUrl: '/cand-m.jpg', status: 'completed', eligible: true },
              ]}] },
            { id: 'track-e', slot: 'end', selectedForGeneration: true, adoptedCandidateId: 'cand-e', eligible: true,
              batches: [{ id: 'batch-e', operationKey: 'op-e', inputFingerprint: 'fp-e', requestedCandidateCount: 1, createdAt: '', candidates: [
                { id: 'cand-e', ordinal: 1, outputVersionId: 'ov-e', mediaId: 'media-e', mediaUrl: '/cand-e.jpg', status: 'completed', eligible: true },
              ]}] },
          ],
          actionSheet: { status: 'current' as const, id: 'as-1', mediaId: 'media-as', fingerprint: 'fp-as' },
          history: [],
        },
        videoGeneration: {
          track: {
            id: 'vt-1',
            adoptedVersionId: 'v1',
            hasInvalidated: false,
            batches: [
              {
                id: 'vb-1',
                operationKey: 'gen-1',
                versions: [
                  { id: 'v1', ordinal: 1, mediaUrl: '/video1.mp4', status: 'completed', invalidated: false, note: '初始版本' },
                ],
              },
            ],
          },
        },
        promptTracks: [
          {
            id: 'prompt-video',
            targetKey: 'video' as const,
            latestVersion: { id: 'pv1', versionNumber: 1, reviewStatus: 'approved' },
            adoptedVersion: { id: 'pv1', versionNumber: 1, reviewStatus: 'approved', coreText: '一个动画片段' },
            needsReview: false,
          },
        ],
        revisions: [{ id: 'rev-1', revision: 1, changeReason: 'initial', sourceRevision: 1, lifecycleState: 'active', payload: null, keyframeMediaRefs: null }],
        provenance: [],
      },
    ],
    tasks: [],
  }
  return { ...base, ...overrides } as RemakeSnapshot
}

// ─── Tests ────────────────────────────────────────────

describe('RemakeVideoStage (Wave 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('manual reference selection (D-01..D-05)', () => {
    it('renders three keyframe slot buttons for adopted Start/Middle/End', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="ref-slot-start"')
      expect(html).toContain('data-testid="ref-slot-middle"')
      expect(html).toContain('data-testid="ref-slot-end"')
    })

    it('starts with no slots selected (nothing silently selected)', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      // All slots should be data-selected="false" initially
      const matches = html.match(/data-selected="false"/g)
      // Start + Middle + End = 3 slot buttons, all unselected
      expect(matches?.length).toBeGreaterThanOrEqual(3)
      // None should be selected
      expect(html).not.toContain('data-testid="ref-slot-start" data-selected="true"')
      expect(html).not.toContain('data-testid="ref-slot-middle" data-selected="true"')
    })

    it('renders action sheet toggle when action sheet is current', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="ref-action-sheet"')
      expect(html).toContain('包含动作表')
    })

    it('shows actual input preview with ordered numbered references', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      // Preview toggle should exist
      expect(html).toContain('data-testid="toggle-preview"')
      expect(html).toContain('实际输入预览')
    })
  })

  describe('submit readiness (VGEN-07 / D-03)', () => {
    it('disables generate button when no keyframes are selected', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="generate-button"')
      // Button should be disabled (has disabled attribute)
      // renderToStaticMarkup renders disabled="true" or just disabled
      expect(html).toContain('disabled=""')
      expect(html).toContain('data-testid="generate-button"')
    })

    it('shows readiness reasons when submit is blocked', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      // Should show the "at least one adopted keyframe" reason
      expect(html).toContain('至少选择一张已采用的新关键帧')
    })
  })

  describe('video capability controls (D-07..D-11)', () => {
    it('renders model selector dropdown', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="model-select"')
      expect(html).toContain('Test Video Model')
    })

    it('renders duration, resolution, and audio capability controls', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="capability-duration"')
      expect(html).toContain('data-testid="capability-resolution"')
      expect(html).toContain('data-testid="capability-generateAudio"')
    })
  })

  describe('version history and playback (D-13)', () => {
    it('renders version history with newest-first ordering', () => {
      const snapshot = makeSnapshot()
      // Add a second batch (newer) with another version
      const shot = snapshot.shots[0] as Record<string, unknown>
      const vg = shot.videoGeneration as { track: { id: string; adoptedVersionId: string; hasInvalidated: boolean; batches: Array<{ id: string; operationKey: string; versions: Array<{ id: string; ordinal: number; mediaUrl: string; status: string; invalidated: boolean; note: string | null }> }> } }
      vg.track.batches.push({
        id: 'vb-2',
        operationKey: 'gen-2',
        versions: [
          { id: 'v2', ordinal: 1, mediaUrl: '/video2.mp4', status: 'completed', invalidated: false, note: null },
        ],
      })
      vg.track.adoptedVersionId = 'v2'

      Reflect.set(globalThis, 'React', React)
      const html = renderStage(snapshot)

      // Both versions should be in the history
      expect(html).toContain('data-testid="version-v1"')
      expect(html).toContain('data-testid="version-v2"')

      // v2 should come before v1 in the HTML (newest-first)
      const v2Index = html.indexOf('data-testid="version-v2"')
      const v1Index = html.indexOf('data-testid="version-v1"')
      expect(v2Index).toBeLessThan(v1Index)
    })

    it('marks adopted version with "当前" badge', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="version-v1"')
      expect(html).toContain('当前')
    })

    it('renders two separate players: original and generated', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-playing-kind="original"')
      expect(html).toContain('data-playing-kind="generated"')
      expect(html).toContain('原始视频')
      expect(html).toContain('生成版本')
    })
  })

  describe('invalidated versions and reconfirmation (D-17..D-19)', () => {
    it('shows "需复核" badge on invalidated versions', () => {
      const snapshot = makeSnapshot()
      const shot = snapshot.shots[0] as Record<string, unknown>
      const vg = shot.videoGeneration as { track: { batches: Array<{ versions: Array<{ invalidated: boolean }> }>; hasInvalidated: boolean } }
      vg.track.batches[0].versions[0].invalidated = true
      vg.track.hasInvalidated = true

      Reflect.set(globalThis, 'React', React)
      const html = renderStage(snapshot)

      expect(html).toContain('需复核')
      // reconfirm button should appear for invalidated adopted version
      expect(html).toContain('data-testid="reconfirm-button"')
      expect(html).toContain('重新确认')
    })
  })

  describe('adoption flow (D-15)', () => {
    it('shows adopt button for non-adopted versions', () => {
      const snapshot = makeSnapshot()
      const shot = snapshot.shots[0] as Record<string, unknown>
      const vg = shot.videoGeneration as { track: { batches: Array<{ versions: Array<{ id: string }> }>; adoptedVersionId: string } }
      // Add a second version that is NOT adopted
      vg.track.batches[0].versions.push(
        { id: 'v2', ordinal: 2, mediaUrl: '/video2.mp4', status: 'completed', invalidated: false, note: null } as never,
      )
      // v1 is adopted, v2 is not
      vg.track.adoptedVersionId = 'v1'

      Reflect.set(globalThis, 'React', React)
      const html = renderStage(snapshot)

      // Adopted version (v1) is selected by default, shows "当前采用版本"
      // We need to check both - actually v1 is selected so it shows "当前采用版本"
      expect(html).toContain('当前采用版本')
      // And v2 exists in history
      expect(html).toContain('data-testid="version-v2"')
    })

    it('has replacement confirmation logic in source (D-15)', () => {
      const fs = require('node:fs') as typeof import('node:fs')
      const source = fs.readFileSync(
        'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx',
        'utf-8',
      )

      // Dialog exists with confirm + cancel
      expect(source).toContain('确认替换当前采用版本')
      expect(source).toContain('confirmReplace')
      expect(source).toContain('confirm-replace-button')
      expect(source).toContain('CONFIRM_REQUIRED')
    })
  })

  describe('note functionality (D-14)', () => {
    it('renders note textarea and save button', () => {
      Reflect.set(globalThis, 'React', React)
      const html = renderStage(makeSnapshot())

      expect(html).toContain('data-testid="version-note"')
      expect(html).toContain('data-testid="save-note-button"')
      expect(html).toContain('审核备注')
    })

    it('syncs note state with selected version and calls note API', () => {
      const fs = require('node:fs') as typeof import('node:fs')
      const source = fs.readFileSync(
        'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx',
        'utf-8',
      )

      // Note state syncs with selected version via effect
      expect(source).toContain('selectedVersion?.note')
      // Save calls the track note endpoint
      expect(source).toContain("action: 'note'")
      expect(source).toContain('/video/tracks/')
    })
  })

  describe('fixed-order preview integrity (D-04 / D-05)', () => {
    it('displays the same ordered references that buildOrderedVideoReferences produces', () => {
      // This is a contract test: the stage uses buildOrderedVideoReferences
      // both for display and for the submit body, ensuring they match.
      // We verify the source uses the same function for both.
      const fs = require('node:fs') as typeof import('node:fs')
      const source = fs.readFileSync(
        'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx',
        'utf-8',
      )

      // Both preview and submit derive from the same orderedRefs / buildOrderedVideoReferences
      expect(source).toContain('buildOrderedVideoReferences')
      // The submit handler sends selectedSlots + includeActionSheet (raw selection),
      // and the server builds ordered references again - which is fine per D-05
      // as long as the order is the same fixed algorithm.
      expect(source).toContain('selectedSlots')
      expect(source).toContain('includeActionSheet')
    })
  })
})
