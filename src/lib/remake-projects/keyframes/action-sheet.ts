import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

export const ACTION_SHEET_RENDERER_VERSION = 'remake-keyframe-action-sheet@1'
export const UNIT_ACTION_SHEET_RENDERER_VERSION = 'remake-unit-action-sheet@2'
export const ACTION_SHEET_SLOTS = ['start', 'middle', 'end'] as const
export type ActionSheetSlot = typeof ACTION_SHEET_SLOTS[number]

export type ActionSheetSource = {
  slot: ActionSheetSlot
  mediaId: string
  timestamp: number
  buffer?: Buffer
}

/** Phase 09.3: one cell of the draggable unit action-sheet grid. */
export type UnitActionSheetSource = {
  ordinal: number
  mediaId: string
  timestamp: number
  buffer?: Buffer
  /** 格子标签（如 镜头3·中）；缺省 镜头{ordinal} */
  label?: string
}

const CELL_WIDTH = 640
const CELL_HEIGHT = 360
const LABEL_HEIGHT = 34
const CELL_TOTAL_HEIGHT = CELL_HEIGHT + LABEL_HEIGHT

type Row = Record<string, unknown>

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}

export function actionSheetFingerprint(input: { revisionId: string; sources: Array<Pick<ActionSheetSource, 'slot' | 'mediaId' | 'timestamp'> > }) {
  const sources = ACTION_SHEET_SLOTS.map((slot) => input.sources.find((source) => source.slot === slot))
  return createHash('sha256').update(stableJson({ renderer: ACTION_SHEET_RENDERER_VERSION, revisionId: input.revisionId, sources })).digest('hex')
}

/**
 * Phase 09.3: deterministic fingerprint of the merged unit action-sheet grid —
 * hashes the renderer version, the unit id, and the ordered cell mediaId
 * list (positional semantics: reordering or swapping a cell changes the
 * fingerprint). Any layout change produces a new sheet.
 */
export function unitActionSheetFingerprint(input: {
  unitId: string
  cells: Array<{ mediaId: string }>
}) {
  const cells = input.cells.map((cell) => cell.mediaId)
  return createHash('sha256').update(stableJson({ renderer: UNIT_ACTION_SHEET_RENDERER_VERSION, unitId: input.unitId, cells })).digest('hex')
}

export function prepareActionSheet(input: {
  revisionId: string
  confirmed: boolean
  sources: ActionSheetSource[]
}) {
  const ordered = ACTION_SHEET_SLOTS.map((slot) => input.sources.find((source) => source.slot === slot))
  if (!input.confirmed) return { status: 'waiting' as const, output: null, fingerprint: null }
  if (ordered.some((source) => !source || !source.mediaId || !Number.isFinite(source.timestamp))) {
    return { status: 'missing' as const, output: null, fingerprint: null }
  }
  const sources = ordered as ActionSheetSource[]
  return {
    status: 'ready' as const,
    fingerprint: actionSheetFingerprint({ revisionId: input.revisionId, sources }),
    output: { renderer: ACTION_SHEET_RENDERER_VERSION, revisionId: input.revisionId, sources: sources.map((source) => ({ slot: source.slot, mediaId: source.mediaId, timestamp: source.timestamp })) },
  }
}

function labelSvg(width: number, height: number, text: string) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="16" y="${Math.max(20, height - 12)}" fill="#fff" font-family="Arial, sans-serif" font-size="18" font-weight="700">${text.replace(/[<&>\"']/g, '')}</text></svg>`)
}

/**
 * Generalized cell renderer: each cell is a 640x360 cover-fit frame with a
 * 34px label bar, laid left-to-right / top-to-bottom into `columns` columns.
 * The single-shot path calls this with columns=1 (vertical stack), so the
 * 3-slot output stays byte-identical to the pre-generalization renderer.
 */
async function renderCells(
  cells: Array<{ buffer: Buffer; label: string }>,
  columns: number,
): Promise<Buffer> {
  const panels = await Promise.all(cells.map(async (cell) => {
    const image = await sharp(cell.buffer).rotate().resize(CELL_WIDTH, CELL_HEIGHT, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    const svg = labelSvg(CELL_WIDTH, LABEL_HEIGHT, cell.label)
    return sharp(image).extend({ top: LABEL_HEIGHT, background: '#111' }).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  }))
  const rows = Math.ceil(panels.length / columns)
  const canvasWidth = columns * CELL_WIDTH
  const canvasHeight = rows * CELL_TOTAL_HEIGHT
  return sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background: '#111' } }).composite(panels.map((input, index) => ({ input, left: (index % columns) * CELL_WIDTH, top: Math.floor(index / columns) * CELL_TOTAL_HEIGHT }))).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}

export async function renderActionSheet(sources: ActionSheetSource[]) {
  const prepared = prepareActionSheet({ revisionId: 'render', confirmed: true, sources })
  if (prepared.status !== 'ready' || sources.some((source) => !source.buffer)) throw new Error('REMAKE_ACTION_SHEET_SOURCE_MISSING')
  const ordered = prepared.output.sources as Array<{ slot: ActionSheetSlot; timestamp: number }>
  const cells = ordered.map((source) => {
    const original = sources.find((item) => item.slot === source.slot)?.buffer as Buffer
    return { buffer: original, label: `${source.slot.toUpperCase()}  ${source.timestamp}` }
  })
  return renderCells(cells, 1)
}

/**
 * Phase 09.3: render the merged unit action-sheet x-grid — one 640x360
 * cover-fit frame per cell (labeled 镜头{N} or a custom label), in a grid of
 * `options.columns` columns (default: 2 for <=6 cells, 3 for 7-16).
 * Cell count bounded 2..16.
 */
export async function renderUnitActionSheet(
  sources: UnitActionSheetSource[],
  options: { columns?: number } = {},
) {
  if (sources.length < 2 || sources.length > 16) {
    throw new Error('REMAKE_ACTION_SHEET_SOURCE_COUNT_INVALID')
  }
  const ordered = [...sources].sort((left, right) => left.ordinal - right.ordinal)
  if (ordered.some((source) => !source.buffer || !source.mediaId || !Number.isFinite(source.timestamp))) {
    throw new Error('REMAKE_ACTION_SHEET_SOURCE_MISSING')
  }
  const cells = ordered.map((source) => ({
    buffer: source.buffer as Buffer,
    label: source.label ?? `镜头 ${source.ordinal}`,
  }))
  const columns = options.columns ?? (ordered.length <= 6 ? 2 : 3)
  return renderCells(cells, columns)
}

export async function persistActionSheet(input: {
  projectId: string
  shotId: string
  revisionId: string
  confirmed: boolean
  sources: ActionSheetSource[]
  mediaId?: string | null
  taskId?: string | null
  tx?: unknown
}) {
  const prepared = prepareActionSheet(input)
  if (prepared.status !== 'ready') return prepared
  const write = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.remakeOutputVersion.findUnique({ where: { revisionId_kind_fingerprint: { revisionId: input.revisionId, kind: 'action_sheet', fingerprint: prepared.fingerprint } } })
    if (existing) {
      if (existing.mediaId || !input.mediaId) return { ...prepared, outputVersion: existing, reused: true }
      const backfilled = await tx.remakeOutputVersion.update({ where: { id: existing.id }, data: { mediaId: input.mediaId } })
      return { ...prepared, outputVersion: backfilled, reused: true }
    }
    const outputVersion = await tx.remakeOutputVersion.create({ data: { shotId: input.shotId, revisionId: input.revisionId, kind: 'action_sheet', fingerprint: prepared.fingerprint, taskId: input.taskId ?? null, mediaId: input.mediaId ?? null, status: 'completed', inputSnapshot: prepared.output } })
    await tx.remakeProvenanceRecord.create({ data: { shotId: input.shotId, outputVersionId: outputVersion.id, schema: ACTION_SHEET_RENDERER_VERSION, executor: 'deterministic-sharp', capability: 'remake.keyframe.action_sheet', payload: JSON.stringify(prepared.output) } })
    return { ...prepared, outputVersion, reused: false }
  }
  return input.tx ? write(input.tx as Prisma.TransactionClient) : prisma.$transaction(write)
}

export async function renderAndUploadActionSheet(input: { projectId: string; revisionId: string; sources: ActionSheetSource[] }) {
  const buffer = await renderActionSheet(input.sources)
  const key = generateUniqueKey(`remake/${input.projectId}/action-sheets`, 'jpg')
  return { key: await uploadObject(buffer, key, 1, 'image/jpeg'), buffer }
}
