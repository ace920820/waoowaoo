/**
 * Phase 09.3: unit action-sheet x-grid layout — client-safe pure helpers
 * shared by the server (submission freeze / layout validation) and the
 * frontend (grid editor auto-fill). No node: / prisma / storage imports.
 *
 * Layout shape stored on RemakeVideoUnit.actionSheetGrid:
 *   { columns: number; cells: Array<{ shotNumber: number; slot: 'start'|'middle'|'end'; mediaId: string }> }
 * `timestamp` is server-filled at freeze time (not trusted from the client).
 */

export const ACTION_SHEET_GRID_MAX_COLUMNS = 4
export const ACTION_SHEET_GRID_MAX_CELLS = 16
export const ACTION_SHEET_GRID_DEFAULT_COLUMNS = 3
export const ACTION_SHEET_GRID_DEFAULT_CELLS = 9

export type ActionSheetGridSlot = 'start' | 'middle' | 'end'

export type ActionSheetGridCell = {
  shotNumber: number
  slot: ActionSheetGridSlot
  mediaId: string
  /** 服务端冻结时补充（帧时间）；前端不填 */
  timestamp?: number
}

export type ActionSheetGrid = {
  columns: number
  cells: ActionSheetGridCell[]
}

/** 每镜头可用的素材（原始帧与已采用关键帧，mediaId 可能缺失） */
export type ActionSheetGridMemberAsset = {
  shotNumber: number
  originals: Partial<Record<ActionSheetGridSlot, string | null>>
  adopted: Partial<Record<ActionSheetGridSlot, string | null>>
}

/**
 * 默认自动布局：按成员序取每镜头 3 张原始帧（start/middle/end），填满
 * 9 格；某镜头原始帧缺失时用其已采用关键帧补位；素材不足时余下为空格。
 */
export function buildDefaultActionSheetGrid(
  members: ActionSheetGridMemberAsset[],
  options: { columns?: number; cells?: number } = {},
): ActionSheetGrid {
  const columns = options.columns ?? ACTION_SHEET_GRID_DEFAULT_COLUMNS
  const cellLimit = options.cells ?? ACTION_SHEET_GRID_DEFAULT_CELLS
  const cells: ActionSheetGridCell[] = []
  const slots: ActionSheetGridSlot[] = ['start', 'middle', 'end']

  for (const member of members) {
    for (const slot of slots) {
      if (cells.length >= cellLimit) break
      const mediaId = member.originals[slot] ?? member.adopted[slot]
      if (!mediaId) continue
      cells.push({ shotNumber: member.shotNumber, slot, mediaId })
    }
  }
  return { columns, cells: cells.slice(0, cellLimit) }
}

export type ActionSheetGridValidationResult = { ok: true } | { ok: false; reason: string }

/**
 * 结构校验（纯函数）：columns 1..4、cells 1..16、字段完整、slot 合法。
 * mediaId 归属校验（必须来自成员素材）在服务端做（需要 DB）。
 */
export function validateActionSheetGridShape(grid: unknown): ActionSheetGridValidationResult {
  if (!grid || typeof grid !== 'object') return { ok: false, reason: '缺少动作表布局' }
  const candidate = grid as Record<string, unknown>
  const columns = candidate.columns
  if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > ACTION_SHEET_GRID_MAX_COLUMNS) {
    return { ok: false, reason: `列数必须是 1-${ACTION_SHEET_GRID_MAX_COLUMNS} 的整数` }
  }
  const cells = candidate.cells
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > ACTION_SHEET_GRID_MAX_CELLS) {
    return { ok: false, reason: `格子数必须是 1-${ACTION_SHEET_GRID_MAX_CELLS}` }
  }
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index] as Record<string, unknown> | null | undefined
    if (!cell || typeof cell !== 'object') return { ok: false, reason: `第 ${index + 1} 格缺少数据` }
    if (typeof cell.shotNumber !== 'number' || typeof cell.mediaId !== 'string' || !cell.mediaId) {
      return { ok: false, reason: `第 ${index + 1} 格缺少镜头编号或素材` }
    }
    if (cell.slot !== 'start' && cell.slot !== 'middle' && cell.slot !== 'end') {
      return { ok: false, reason: `第 ${index + 1} 格的 slot 非法` }
    }
  }
  return { ok: true }
}
