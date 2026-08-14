import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

export const ACTION_SHEET_RENDERER_VERSION = 'remake-keyframe-action-sheet@1'
export const UNIT_ACTION_SHEET_RENDERER_VERSION = 'remake-unit-action-sheet@1'
export const ACTION_SHEET_SLOTS = ['start', 'middle', 'end'] as const
export type ActionSheetSlot = typeof ACTION_SHEET_SLOTS[number]

export type ActionSheetSource = {
  slot: ActionSheetSlot
  mediaId: string
  timestamp: number
  buffer?: Buffer
}

/** D-07: one cell per unit member, numbered by member ordinal. */
export type UnitActionSheetSource = {
  ordinal: number
  mediaId: string
  timestamp: number
  buffer?: Buffer
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
 * D-07: deterministic fingerprint of the merged unit action sheet — hashes the
 * renderer version, the unit id, and the member ordinal + mediaId list, so any
 * member change (reorder, keyframe swap) produces a new fingerprint.
 */
export function unitActionSheetFingerprint(input: {
  unitId: string
  sources: Array<Pick<UnitActionSheetSource, 'ordinal' | 'mediaId'>>
}) {
  const sources = [...input.sources].sort((left, right) => left.ordinal - right.ordinal)
  return createHash('sha256').update(stableJson({ renderer: UNIT_ACTION_SHEET_RENDERER_VERSION, unitId: input.unitId, sources })).digest('hex')
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
 * D-07: render the merged unit action sheet — one 640x360 cover-fit frame per
 * member (numbered 镜头{N}) in a 2-column grid for 3-6 sources and a 3-column
 * grid for 7-9 sources. Source count is bounded 2..9 (T-091-07).
 */
export async function renderUnitActionSheet(sources: UnitActionSheetSource[]) {
  if (sources.length < 2 || sources.length > 9) {
    throw new Error('REMAKE_ACTION_SHEET_SOURCE_COUNT_INVALID')
  }
  const ordered = [...sources].sort((left, right) => left.ordinal - right.ordinal)
  if (ordered.some((source) => !source.buffer || !source.mediaId || !Number.isFinite(source.timestamp))) {
    throw new Error('REMAKE_ACTION_SHEET_SOURCE_MISSING')
  }
  const cells = ordered.map((source) => ({
    buffer: source.buffer as Buffer,
    label: `镜头 ${source.ordinal}`,
  }))
  const columns = ordered.length <= 6 ? 2 : 3
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
