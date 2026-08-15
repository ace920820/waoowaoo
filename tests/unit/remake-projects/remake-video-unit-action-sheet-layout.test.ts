import { describe, expect, it } from 'vitest'
import {
  buildDefaultActionSheetGrid,
  validateActionSheetGridShape,
  type ActionSheetGridMemberAsset,
} from '@/lib/remake-projects/unit/action-sheet-layout'

function member(overrides: Partial<ActionSheetGridMemberAsset> = {}): ActionSheetGridMemberAsset {
  return {
    shotNumber: 1,
    originals: { start: 'o1s', middle: 'o1m', end: 'o1e' },
    adopted: { start: null, middle: null, end: null },
    ...overrides,
  }
}

describe('buildDefaultActionSheetGrid (Phase 09.3 auto layout)', () => {
  it('fills a 3x3 grid with member original keyframes in member order', () => {
    const grid = buildDefaultActionSheetGrid([
      member({ shotNumber: 3 }),
      member({ shotNumber: 5 }),
      member({ shotNumber: 8 }),
    ])
    expect(grid).toEqual({
      columns: 3,
      cells: [
        { shotNumber: 3, slot: 'start', mediaId: 'o1s' },
        { shotNumber: 3, slot: 'middle', mediaId: 'o1m' },
        { shotNumber: 3, slot: 'end', mediaId: 'o1e' },
        { shotNumber: 5, slot: 'start', mediaId: 'o1s' },
        { shotNumber: 5, slot: 'middle', mediaId: 'o1m' },
        { shotNumber: 5, slot: 'end', mediaId: 'o1e' },
        { shotNumber: 8, slot: 'start', mediaId: 'o1s' },
        { shotNumber: 8, slot: 'middle', mediaId: 'o1m' },
        { shotNumber: 8, slot: 'end', mediaId: 'o1e' },
      ],
    })
  })

  it('falls back to adopted keyframes when original frames are missing', () => {
    const grid = buildDefaultActionSheetGrid([
      member({ originals: { start: null, middle: null, end: null }, adopted: { middle: 'adopted-m', start: null, end: null } }),
    ])
    expect(grid.cells).toEqual([
      { shotNumber: 1, slot: 'middle', mediaId: 'adopted-m' },
    ])
  })

  it('caps cells at the requested cell limit (default 9)', () => {
    const grid = buildDefaultActionSheetGrid(
      [member({ shotNumber: 1 }), member({ shotNumber: 2 }), member({ shotNumber: 3 }), member({ shotNumber: 4 })],
      { columns: 3, cells: 9 },
    )
    expect(grid.cells).toHaveLength(9)
  })
})

describe('validateActionSheetGridShape', () => {
  it('accepts a well-formed grid', () => {
    const grid = buildDefaultActionSheetGrid([member()])
    expect(validateActionSheetGridShape(grid)).toEqual({ ok: true })
  })

  it('rejects missing / oversized grids', () => {
    expect(validateActionSheetGridShape(null)).toEqual({ ok: false, reason: expect.stringContaining('缺少动作表布局') })
    expect(validateActionSheetGridShape({ columns: 5, cells: [] })).toEqual({
      ok: false,
      reason: expect.stringContaining('列数'),
    })
    expect(validateActionSheetGridShape({ columns: 3, cells: [] })).toEqual({
      ok: false,
      reason: expect.stringContaining('格子数'),
    })
  })

  it('rejects cells with illegal slot or missing media', () => {
    expect(
      validateActionSheetGridShape({ columns: 3, cells: [{ shotNumber: 1, slot: 'side', mediaId: 'm' }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('slot') })
    expect(
      validateActionSheetGridShape({ columns: 3, cells: [{ shotNumber: 1, slot: 'start', mediaId: '' }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('缺少镜头编号或素材') })
  })
})
