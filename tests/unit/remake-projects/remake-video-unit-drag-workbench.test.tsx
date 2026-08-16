import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import {
  UnitDragWorkbench,
  autoFillCells,
  buildUnitDragAssets,
  resolveShotOrderDrag,
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
    onSlotSelect: () => {},
    previewUrl,
  })
  return renderToStaticMarkup(node)
}

// ─── Tests ────────────────────────────────────────────

describe('resolveShotOrderDrag (debug: drag reorder was a no-op)', () => {
  const dockSlots: Parameters<typeof UnitDragWorkbench>[0]['dockSlots'] = [
    { shotRevisionId: 'rev-1', shotNumber: 1, durationSeconds: 1, activeSlot: 'start', thumbMediaUrl: null, refMediaUrl: null, options: [] },
    { shotRevisionId: 'rev-2', shotNumber: 3, durationSeconds: 1, activeSlot: 'start', thumbMediaUrl: null, refMediaUrl: null, options: [] },
    { shotRevisionId: 'rev-3', shotNumber: 2, durationSeconds: 1, activeSlot: 'start', thumbMediaUrl: null, refMediaUrl: null, options: [] },
  ]

  it('reorders the shot list when dragging a row onto another row', () => {
    const ordered = resolveShotOrderDrag(dockSlots, 'dock:rev-1', 'dock:rev-3')
    expect(ordered).toEqual(['rev-2', 'rev-3', 'rev-1'])
  })

  it('returns null for same-position or invalid targets', () => {
    expect(resolveShotOrderDrag(dockSlots, 'dock:rev-1', 'dock:rev-1')).toBeNull()
    expect(resolveShotOrderDrag(dockSlots, 'dock:rev-1', 'cell:xyz')).toBeNull()
    expect(resolveShotOrderDrag(dockSlots, 'dock:unknown', 'dock:rev-2')).toBeNull()
  })

  it('sortable rows and cells carry their kind in drag data (source contract)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const source = readFileSync(
      'src/app/[locale]/workspace/[projectId]/modes/remake/video/UnitDragWorkbench.tsx',
      'utf8',
    )
    expect(source).toContain("useSortable({ id, disabled, data })")
    expect(source).toContain("{ kind: 'dock-slot' }")
    expect(source).toContain("{ kind: 'grid-cell' }")
  })
})

describe('buildUnitDragAssets (Phase 09.3)', () => {
  it('collects ONLY original frames — AI-generated/adopted keyframes are excluded (debug fix)', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [member()])
    const originals = assets.filter((asset) => asset.kind === 'original')
    const adopted = assets.filter((asset) => asset.kind === 'adopted')
    expect(originals).toHaveLength(3)
    expect(adopted).toHaveLength(0)
    expect(originals.map((asset) => asset.slot)).toEqual(['start', 'middle', 'end'])
    expect(originals[0]).toMatchObject({ shotNumber: 3, mediaUrl: '/kf/1s', label: '镜头3·首帧' })
  })

  it('keeps asset order = member order so the drawer follows the shot-order list (debug fix)', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [
      member({ shotRevisionId: 'rev-1', ordinal: 1, sequence: 3 }),
      member({ shotRevisionId: 'rev-2', ordinal: 2, sequence: 5 }),
    ])
    // drawer groups by shotNumber in first-appearance order → 3 before 5,
    // matching the order bar, NOT sorted by shot number
    const seen: number[] = []
    for (const asset of assets) {
      if (seen[seen.length - 1] !== asset.shotNumber) seen.push(asset.shotNumber)
    }
    expect(seen).toEqual([3, 5])

    // reorder the members → the drawer order must follow
    const reordered = buildUnitDragAssets(snapshotWithShot(), [
      member({ shotRevisionId: 'rev-2', ordinal: 1, sequence: 5 }),
      member({ shotRevisionId: 'rev-1', ordinal: 2, sequence: 3 }),
    ])
    const seenReordered: number[] = []
    for (const asset of reordered) {
      if (seenReordered[seenReordered.length - 1] !== asset.shotNumber) seenReordered.push(asset.shotNumber)
    }
    expect(seenReordered).toEqual([5, 3])
  })

  it('drawer grouping no longer sorts by shot number (source contract)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const source = readFileSync(
      'src/app/[locale]/workspace/[projectId]/modes/remake/video/UnitDragWorkbench.tsx',
      'utf8',
    )
    expect(source).toContain('[...groups.entries()]')
    expect(source).not.toContain('[...groups.entries()].sort')
  })
})

describe('autoFillCells (Phase 09.3)', () => {
  it('fills cells with member original frames in member order', () => {
    const assets = buildUnitDragAssets(snapshotWithShot(), [
      member(),
      member({ shotRevisionId: 'rev-2', ordinal: 2, sequence: 5 }),
    ])
    const cells = autoFillCells(assets)
    // 2 members × 3 originals = 6 assets → 6 cells
    expect(cells).toHaveLength(6)
    expect(cells[0]).toMatchObject({ shotNumber: 3, slot: 'start' })
    expect(cells[5]).toMatchObject({ shotNumber: 5, slot: 'end' })
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
    // 4 members × 3 originals = 12 assets → all 12 cells kept
    // (previously truncated at 9, dropping the 4th member entirely)
    expect(cells).toHaveLength(12)
    expect(cells.map((cell) => cell.shotNumber)).toEqual([3, 3, 3, 5, 5, 5, 7, 7, 7, 9, 9, 9])
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

  it('renders the shot-order list with order badges, thumbnails and inline slot pickers (Phase 09.3)', () => {
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
    expect(html).toContain('镜头3')
    // member shots with no thumbnail show the placeholder
    expect(html).toContain('无帧')
    expect(html).toContain('shot-order-hint')
    // inline slot pickers (3 per row), current slot highlighted — no ref img anymore
    expect(html).toContain('shot-order-slot-rev-1-start')
    expect(html).toContain('shot-order-slot-rev-1-middle')
    expect(html).toContain('shot-order-slot-rev-1-end')
    expect(html).toContain('data-selected="true"')
    expect(html).toContain('未采用')
    expect(html).not.toContain('/ref/1')
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
