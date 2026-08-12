import { describe, expect, it, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

// 1) Vertical render layout (pure sharp render, no DB)
describe('renderActionSheet vertical layout', () => {
  it('stacks the three panels vertically', async () => {
    const { renderActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const tiny = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 200, g: 100, b: 50 } } }).jpeg().toBuffer()
    const output = await renderActionSheet([
      { slot: 'start', mediaId: 'm1', timestamp: 0, buffer: tiny },
      { slot: 'middle', mediaId: 'm2', timestamp: 1000, buffer: tiny },
      { slot: 'end', mediaId: 'm3', timestamp: 2000, buffer: tiny },
    ])
    const meta = await sharp(output).metadata()
    // 640 wide, 3 panels each (360 + 34 label) stacked vertically
    expect(meta.width).toBe(640)
    expect(meta.height).toBe((360 + 34) * 3)
    expect(meta.height).toBeGreaterThan(meta.width as number) // portrait / vertical
  })
})

// 2) persistActionSheet writes mediaId onto the output version
const prismaMocks = vi.hoisted(() => {
  const findUnique = vi.fn()
  const create = vi.fn()
  const update = vi.fn()
  return {
    findUnique,
    create,
    update,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      return await (cb as (tx: unknown) => unknown)({ remakeOutputVersion: { findUnique, create, update }, remakeProvenanceRecord: { create: vi.fn() } })
    }),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: prismaMocks.$transaction } }))

describe('persistActionSheet mediaId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates the output version with the uploaded mediaId', async () => {
    prismaMocks.findUnique.mockResolvedValue(null)
    prismaMocks.create.mockResolvedValue({ id: 'output-1', mediaId: 'media-action-sheet' })
    const { persistActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const result = await persistActionSheet({
      projectId: 'p1', shotId: 's1', revisionId: 'r1', confirmed: true,
      sources: [
        { slot: 'start', mediaId: 'm1', timestamp: 0 },
        { slot: 'middle', mediaId: 'm2', timestamp: 1000 },
        { slot: 'end', mediaId: 'm3', timestamp: 2000 },
      ],
      mediaId: 'media-action-sheet',
    })
    expect(result.status).toBe('ready')
    expect(prismaMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mediaId: 'media-action-sheet', kind: 'action_sheet', status: 'completed' }),
    }))
  })

  it('backfills mediaId onto an existing version that lacks one', async () => {
    prismaMocks.findUnique.mockResolvedValue({ id: 'output-1', mediaId: null })
    prismaMocks.update.mockResolvedValue({ id: 'output-1', mediaId: 'media-action-sheet' })
    const { persistActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const result = await persistActionSheet({
      projectId: 'p1', shotId: 's1', revisionId: 'r1', confirmed: true,
      sources: [
        { slot: 'start', mediaId: 'm1', timestamp: 0 },
        { slot: 'middle', mediaId: 'm2', timestamp: 1000 },
        { slot: 'end', mediaId: 'm3', timestamp: 2000 },
      ],
      mediaId: 'media-action-sheet',
    })
    expect(result.reused).toBe(true)
    expect(prismaMocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { mediaId: 'media-action-sheet' } }))
  })
})
