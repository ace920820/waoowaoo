import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

export const ACTION_SHEET_RENDERER_VERSION = 'remake-keyframe-action-sheet@1'
export const ACTION_SHEET_SLOTS = ['start', 'middle', 'end'] as const
export type ActionSheetSlot = typeof ACTION_SHEET_SLOTS[number]

export type ActionSheetSource = {
  slot: ActionSheetSlot
  mediaId: string
  timestamp: number
  buffer?: Buffer
}

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

export async function renderActionSheet(sources: ActionSheetSource[]) {
  const prepared = prepareActionSheet({ revisionId: 'render', confirmed: true, sources })
  if (prepared.status !== 'ready' || sources.some((source) => !source.buffer)) throw new Error('REMAKE_ACTION_SHEET_SOURCE_MISSING')
  const width = 640
  const height = 360
  const panels = await Promise.all((prepared.output.sources as Array<{ slot: ActionSheetSlot; timestamp: number }>).map(async (source) => {
    const original = sources.find((item) => item.slot === source.slot)?.buffer as Buffer
    const image = await sharp(original).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    return { input: image, label: `${source.slot.toUpperCase()}  ${source.timestamp}` }
  }))
  const labelHeight = 34
  const labeled = await Promise.all(panels.map(async (panel) => {
    const svg = labelSvg(width, labelHeight, panel.label)
    return sharp(panel.input).extend({ top: labelHeight, background: '#111' }).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  }))
  return sharp({ create: { width, height: (height + labelHeight) * labeled.length, channels: 3, background: '#111' } }).composite(labeled.map((input, index) => ({ input, left: 0, top: (height + labelHeight) * index }))).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
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
