import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import {
  UnitDragWorkbench,
  autoFillCells,
  buildUnitDragAssets,
  type UnitGridDraft,
} from '@/app/[locale]/workspace/[projectId]/modes/remake/video/UnitDragWorkbench'
import type { UnitMemberView } from '@/lib/remake-projects/unit/adapter'

// ─── Mocks ────────────────────────────────────────────

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

// ─── Fixtures ─────────────────────────────────────────

function member(overrides: Partial<UnitMemberView> = {}): UnitMemberView {
  return {
    shotRevisionId: 'rev-1',
    ordinal: 1,
    shotId: 'shot-1',
    sequence: 3,
    label: '镜头3',
    durationSeconds: 2,
    keyframeSlot: null,
    keyframeOptions: [
      { slot: 'start', mediaId: null, mediaUrl: null },
      { slot: 'middle', mediaId: 'kfm-1', mediaUrl: '/kfm/1' },
      { slot: 'end', mediaId: null, mediaUrl: null },
    ],
    ...overrides,
  }
}

function snapshotWithShot(): RemakeSnapshot {
  return {
    project: { id: 'project-1', name: 'Test', type: 'remake' },
    source: { status: 'analyzed', mediaId: 'media-1', mediaUrl: '/media/1' },
    shots: [
      {
        id: 'shot-1',
        stableKey: 'sk-1',
        sequence: 3,
        reviewStatus: 'keep',
        needsReview: false,
        currentRevision: 1,
        timeRange: { start: '00:00:00.000', end: '00:00:02.000' },
        keyframes: {
          start: { mediaId: 'kf-1s', mediaUrl: '/kf/1s' },
          middle: { mediaId: 'kf-1m', mediaUrl: '/kf/1m' },
          end: { mediaId: 'kf-1e', mediaUrl: '/kf/1e' },
        },
        keyframeGeneration: {
          tracks: [
            {
              id: 't-m',
              slot: 'middle',
              selectedForGeneration: true,
              adoptedCandidateId: 'c-1',
              eligible: true,
              batches: [
                {
                  id: 'b-1',
                  operationKey: 'op-1',
                  requestedCandidateCount: 1,
                  createdAt: '2026-08-14T00:00:00Z',
                  candidates: [{ id: 'c-1', ordinal: 1, mediaId: 'kfm-1', mediaUrl: '/kfm/1', eligible: true }],
                },
              ],
            },
          ],
          actionSheet: { status: 'current', id: 'as-1', mediaId: 'as-1', fingerprint: 'f' },
          history: [],
        },
        videoGeneration: { track: null },
        promptTracks: [],
        revisions: [
          { id: 'rev-1', revision: 1, changeReason: 'init', lifecycleState: 'active', sourceRevision: 1 },
        ],
        provenance: [],
      },
    ],
    tasks: [],
    units: [],
  } as RemakeSnapshot
}

function renderWorkbench(
  grid: UnitGridDraft,
  previewUrl?: string | null,
  dockSlots: Parameters<typeof UnitDragWorkbench>[0]['dockSlots'] = [],
): string {
  const node = createElement(UnitDragWorkbench, {
    assets: [],
    dockSlots,
    grid,
    onGridChange: () => {},
    onReorderDock: () => {},
    onSlotAssetDrop: () => {},
    previewUrl,
  })
  return renderToStaticMarkup(node)
}

// ─── Tests ────────────────────────────────────────────

describe('buildUnitDragAssets (Phase 09.3)', () => {
  it('collects original frames + adopted keyframes per member shot', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [member()])
    const originals = assets.filter((asset) => asset.kind === 'original')
    const adopted = assets.filter((asset) => asset.kind === 'adopted')
    expect(originals).toHaveLength(3)
    expect(adopted).toHaveLength(1)
    expect(originals.map((asset) => asset.slot)).toEqual(['start', 'middle', 'end'])
    expect(originals[0]).toMatchObject({ shotNumber: 3, mediaUrl: '/kf/1s', label: '镜头3·首帧' })
    expect(adopted[0]).toMatchObject({ shotNumber: 3, slot: 'middle', mediaUrl: '/kfm/1' })
  })
})

describe('autoFillCells (Phase 09.3)', () => {
  it('fills cells with originals first, then adopted (member order)', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [
      member(),
      member({ shotRevisionId: 'rev-2', ordinal: 2, sequence: 5 }),
    ])
    const cells = autoFillCells(assets)
    // 2 members × (3 originals + 1 adopted) = 8 assets → 8 cells
    expect(cells).toHaveLength(8)
    expect(cells[0]).toMatchObject({ shotNumber: 3, slot: 'start' })
    expect(cells[5]).toMatchObject({ shotNumber: 5, slot: 'end' })
    expect(cells[7]).toMatchObject({ shotNumber: 5, slot: 'middle' })
    expect(cells.every((cell) => cell.mediaUrl)).toBe(true)
  })

  it('fills ALL four members (12 frames) instead of truncating at 9 (debug: 4-shot unit only got 3)', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [
      member(),
      member({ shotRevisionId: 'rev-2', ordinal: 2, sequence: 5 }),
      member({ shotRevisionId: 'rev-3', ordinal: 3, sequence: 7 }),
      member({ shotRevisionId: 'rev-4', ordinal: 4, sequence: 9 }),
    ])
    const cells = autoFillCells(assets)
    // 4 members × (3 originals + 1 adopted) = 16 assets → all 16 cells kept
    // (previously truncated at 9, dropping the 4th member entirely)
    expect(cells).toHaveLength(16)
    expect(cells.slice(0, 12).map((cell) => cell.shotNumber)).toEqual([3, 3, 3, 5, 5, 5, 7, 7, 7, 9, 9, 9])
    expect(cells[15]).toMatchObject({ shotNumber: 9, slot: 'middle' })
  })

  it('skips assets without media', () => {
    const snapshot = snapshotWithShot()
    const assets = buildUnitDragAssets(snapshot, [member({ keyframeOptions: [{ slot: 'start', mediaId: null, mediaUrl: null }, { slot: 'middle', mediaId: null, mediaUrl: null }, { slot: 'end', mediaId: null, mediaUrl: null }] })])
    expect(assets).toHaveLength(3) // originals only
  })
})

describe('UnitDragWorkbench static render', () => {
  it('renders the grid editor with filled and empty cells', () => {
    const html = renderWorkbench({
      columns: 3,
      cells: [
        { id: 'a', shotNumber: 3, slot: 'start', mediaId: 'm', mediaUrl: '/a.jpg' },
        { id: 'b', shotNumber: 5, slot: 'middle', mediaId: 'm2', mediaUrl: '/b.jpg' },
      ],
    })
    expect(html).toContain('unit-drag-workbench')
    expect(html).toContain('action-sheet-grid-editor')
    expect(html).toContain('grid-cell-0')
    expect(html).toContain('grid-cell-2')
    expect(html).toContain('data-filled="true"')
    expect(html).toContain('data-filled="false"')
    expect(html).toContain('镜头3·首')
    expect(html).toContain('空格')
    expect(html).toContain('grid-auto-fill')
    expect(html).toContain('grid-clear')
  })

  it('panel integration: workbench embed + save-layout channel + drag entry (source contract)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const panel = readFileSync(
      'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoUnitPanel.tsx',
      'utf8',
    )
    expect(panel).toContain('UnitDragWorkbench')
    expect(panel).toContain('save-member-layout-button')
    expect(panel).toContain("action: 'save-layout'")
    expect(panel).toContain('调整成员/关键帧（拖拽）')
  })

  it('renders the live composed preview with a download link when previewUrl is set (Phase 09.3)', () => {
    const html = renderWorkbench(
      { columns: 3, cells: [{ id: 'a', shotNumber: 3, slot: 'start', mediaId: 'm', mediaUrl: '/a.jpg' }] },
      '/api/remake-projects/p1/units/preview?unitId=u1&grid=%7B%22columns%22%3A3%7D',
    )
    expect(html).toContain('action-sheet-live-preview')
    expect(html).toContain('动作参考表实时预览')
    expect(html).toContain('action-sheet-preview-download')
    expect(html).toContain('download="动作参考表.jpg"')
    expect(html).toContain('href="/api/remake-projects/p1/units/preview')
  })

  it('hides the preview zone when previewUrl is null', () => {
    const html = renderWorkbench({ columns: 3, cells: [] }, null)
    expect(html).not.toContain('action-sheet-live-preview')
  })

  it('renders the shot-order list with order badges, thumbnails, ref image and slot label (Phase 09.3)', () => {
    const dockSlots: Parameters<typeof UnitDragWorkbench>[0]['dockSlots'] = [
      {
        shotRevisionId: 'rev-1', shotNumber: 1, durationSeconds: 2, activeSlot: 'start',
        thumbMediaUrl: '/thumb/1', refMediaUrl: '/ref/1', options: [],
      },
      {
        shotRevisionId: 'rev-2', shotNumber: 3, durationSeconds: 1.5, activeSlot: 'middle',
        thumbMediaUrl: '/thumb/3', refMediaUrl: null, options: [],
      },
      {
        shotRevisionId: 'rev-3', shotNumber: 2, durationSeconds: 3, activeSlot: 'end',
        thumbMediaUrl: null, refMediaUrl: '/ref/2', options: [],
      },
    ]
    const html = renderWorkbench({ columns: 3, cells: [] }, null, dockSlots)
    expect(html).toContain('shot-order-list')
    expect(html).toContain('shot-order-row-rev-1')
    expect(html).toContain('shot-order-row-rev-2')
    expect(html).toContain('shot-order-row-rev-3')
    // order badges ①②③ with data-order matching the list position
    expect(html).toContain('shot-order-badge-1')
    expect(html).toContain('shot-order-badge-3')
    expect(html).toContain('data-order="1"')
    expect(html).toContain('data-order="3"')
    expect(html).toContain('①')
    expect(html).toContain('/thumb/1')
    expect(html).toContain('/ref/1')
    expect(html).toContain('>start<')
    expect(html).toContain('镜头3')
    // member shots with no thumbnail show the placeholder
    expect(html).toContain('无帧')
    expect(html).toContain('无引用')
    expect(html).toContain('shot-order-hint')
  })

  it('panel integration: shot-order hint in readonly view + workbench embed (source contract)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const panel = readFileSync(
      'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoUnitPanel.tsx',
      'utf8',
    )
    expect(panel).toContain('shot-order-readonly-hint')
    expect(panel).toContain('thumbMediaUrl')
  })
})
