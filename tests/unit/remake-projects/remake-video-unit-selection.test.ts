import { describe, expect, it } from 'vitest'
import { canSelectShotForUnit, filterSelectableUnitShots } from '@/lib/remake-projects/unit/selection'

describe('canSelectShotForUnit — 已在 unit 的镜头不可选（D-04/D-18）', () => {
  it('镜头不在任何 unit 时可选', () => {
    expect(canSelectShotForUnit({ inUnit: false })).toBe(true)
  })

  it('镜头已在 unit 时不可选', () => {
    expect(canSelectShotForUnit({ inUnit: true })).toBe(false)
  })
})

describe('filterSelectableUnitShots — 创建 unit 前过滤不可选镜头', () => {
  it('过滤掉已在 unit 的镜头，保留可选镜头', () => {
    const result = filterSelectableUnitShots({
      selectedShotIds: ['shot-1', 'shot-2', 'shot-3'],
      shotToUnit: new Map([
        ['shot-1', 'unit-a'],
        ['shot-3', 'unit-b'],
      ]),
    })
    expect(result.selectable).toEqual(['shot-2'])
    expect(result.blocked).toEqual(['shot-1', 'shot-3'])
  })

  it('全部不可选时 selectable 为空且 blocked 完整返回', () => {
    const result = filterSelectableUnitShots({
      selectedShotIds: ['shot-1', 'shot-2'],
      shotToUnit: new Map([
        ['shot-1', 'unit-a'],
        ['shot-2', 'unit-a'],
      ]),
    })
    expect(result.selectable).toEqual([])
    expect(result.blocked).toEqual(['shot-1', 'shot-2'])
  })

  it('没有 unit 映射时全部可选', () => {
    const result = filterSelectableUnitShots({
      selectedShotIds: ['shot-1'],
      shotToUnit: new Map(),
    })
    expect(result.selectable).toEqual(['shot-1'])
    expect(result.blocked).toEqual([])
  })
})
