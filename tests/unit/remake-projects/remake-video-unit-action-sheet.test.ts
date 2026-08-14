import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

/**
 * D-07 generalized action-sheet renderer:
 *  - renderActionSheet with exactly three sources stays byte-identical to the
 *    pre-refactor single-shot renderer (pinned golden hash).
 *  - renderUnitActionSheet lays member cells into a 2-column grid (3-6
 *    sources) or a 3-column grid (7-9 sources), each cell a 640x360 cover-fit
 *    member frame plus a 镜头{N} label bar.
 *  - unitActionSheetFingerprint is deterministic over (renderer version, unit
 *    member ordinal+mediaId list) and changes when a member mediaId changes.
 *  - renderUnitActionSheet rejects fewer than 2 or more than 9 sources
 *    (T-091-07 bounded source count).
 */

// Golden hash captured from the pre-refactor renderActionSheet output with the
// fixture below (solid 64x36 buffer, 640x1182 vertical 3-panel stack). If this
// test ever fails, the single-shot action-sheet path changed byte-wise.
const GOLDEN_3SLOT_HASH = '83007064806ee3ced64bb81808eb635be3712620ebb37ca0e8d66532e7ab7528'

const tiny = () =>
  sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .toBuffer()

const solid = (color: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).jpeg().toBuffer()

async function pixelAt(
  buffer: Buffer,
  left: number,
  top: number,
): Promise<{ r: number; g: number; b: number }> {
  const raw = await sharp(buffer).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()
  return { r: raw[0]!, g: raw[1]!, b: raw[2]! }
}

const closeTo = (actual: number, expected: number, tolerance = 30) =>
  Math.abs(actual - expected) <= tolerance

const COLORS = [
  { r: 200, g: 50, b: 50 },
  { r: 50, g: 200, b: 50 },
  { r: 50, g: 50, b: 200 },
  { r: 200, g: 200, b: 50 },
  { r: 50, g: 200, b: 200 },
  { r: 200, g: 50, b: 200 },
  { r: 200, g: 130, b: 50 },
  { r: 80, g: 160, b: 220 },
  { r: 160, g: 80, b: 220 },
]

const CELL_WIDTH = 640
const CELL_HEIGHT = 360
const LABEL_HEIGHT = 34
const CELL_TOTAL = CELL_HEIGHT + LABEL_HEIGHT

describe('renderActionSheet backward compatibility (single-shot path)', () => {
  it('produces byte-identical output to the pre-refactor implementation (golden hash)', async () => {
    const { renderActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const output = await renderActionSheet([
      { slot: 'start', mediaId: 'm1', timestamp: 0, buffer: await tiny() },
      { slot: 'middle', mediaId: 'm2', timestamp: 1000, buffer: await tiny() },
      { slot: 'end', mediaId: 'm3', timestamp: 2000, buffer: await tiny() },
    ])
    const hash = createHash('sha256').update(output).digest('hex')
    expect(hash).toBe(GOLDEN_3SLOT_HASH)
    const meta = await sharp(output).metadata()
    expect(meta.width).toBe(640)
    expect(meta.height).toBe(CELL_TOTAL * 3)
  })
})

describe('renderUnitActionSheet grid layout (D-07)', () => {
  it('lays 6 sources in a 2-column grid with each member frame and a 镜头 N label bar', async () => {
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const sources = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => ({
        ordinal: i + 1,
        mediaId: `media-${i + 1}`,
        timestamp: i * 1000,
        buffer: await solid(COLORS[i]!),
      })),
    )
    const output = await renderUnitActionSheet(sources)
    const meta = await sharp(output).metadata()
    // 2 columns x 3 rows of 640x394 cells.
    expect(meta.width).toBe(CELL_WIDTH * 2)
    expect(meta.height).toBe(CELL_TOTAL * 3)

    for (let i = 0; i < 6; i++) {
      const col = i % 2
      const row = Math.floor(i / 2)
      const bodyCenter = await pixelAt(output, col * CELL_WIDTH + 320, row * CELL_TOTAL + LABEL_HEIGHT + 180)
      const expected = COLORS[i]!
      expect(closeTo(bodyCenter.r, expected.r), `cell ${i + 1} red channel`).toBe(true)
      expect(closeTo(bodyCenter.g, expected.g), `cell ${i + 1} green channel`).toBe(true)
      expect(closeTo(bodyCenter.b, expected.b), `cell ${i + 1} blue channel`).toBe(true)
      // Label bar: dark band on top of the cell.
      const labelPixel = await pixelAt(output, col * CELL_WIDTH + 320, row * CELL_TOTAL + 17)
      expect(labelPixel.r).toBeLessThan(60)
      expect(labelPixel.g).toBeLessThan(60)
      expect(labelPixel.b).toBeLessThan(60)
    }
  })

  it('lays 9 sources in a 3-column grid', async () => {
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const sources = await Promise.all(
      Array.from({ length: 9 }, async (_, i) => ({
        ordinal: i + 1,
        mediaId: `media-${i + 1}`,
        timestamp: i * 500,
        buffer: await solid(COLORS[i]!),
      })),
    )
    const output = await renderUnitActionSheet(sources)
    const meta = await sharp(output).metadata()
    // 3 columns x 3 rows of 640x394 cells.
    expect(meta.width).toBe(CELL_WIDTH * 3)
    expect(meta.height).toBe(CELL_TOTAL * 3)

    // Spot-check the last cell (row 2, col 2).
    const bodyCenter = await pixelAt(output, 2 * CELL_WIDTH + 320, 2 * CELL_TOTAL + LABEL_HEIGHT + 180)
    const expected = COLORS[8]!
    expect(closeTo(bodyCenter.r, expected.r)).toBe(true)
    expect(closeTo(bodyCenter.g, expected.g)).toBe(true)
    expect(closeTo(bodyCenter.b, expected.b)).toBe(true)
  })
})

describe('unitActionSheetFingerprint (D-07 deterministic fingerprint)', () => {
  it('is deterministic over (renderer version, unit member ordinal+mediaId list)', async () => {
    const { unitActionSheetFingerprint } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const sources = [
      { ordinal: 1, mediaId: 'media-a' },
      { ordinal: 2, mediaId: 'media-b' },
      { ordinal: 3, mediaId: 'media-c' },
    ]
    const first = unitActionSheetFingerprint({ unitId: 'unit-1', sources })
    const second = unitActionSheetFingerprint({ unitId: 'unit-1', sources })
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when a member mediaId changes or the unit id changes', async () => {
    const { unitActionSheetFingerprint } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const sources = [
      { ordinal: 1, mediaId: 'media-a' },
      { ordinal: 2, mediaId: 'media-b' },
      { ordinal: 3, mediaId: 'media-c' },
    ]
    const baseline = unitActionSheetFingerprint({ unitId: 'unit-1', sources })
    const changedMedia = unitActionSheetFingerprint({
      unitId: 'unit-1',
      sources: [
        { ordinal: 1, mediaId: 'media-a' },
        { ordinal: 2, mediaId: 'media-B-CHANGED' },
        { ordinal: 3, mediaId: 'media-c' },
      ],
    })
    const changedUnit = unitActionSheetFingerprint({ unitId: 'unit-2', sources })
    expect(changedMedia).not.toBe(baseline)
    expect(changedUnit).not.toBe(baseline)
  })
})

describe('renderUnitActionSheet source count bounds (T-091-07)', () => {
  it('rejects fewer than 2 sources', async () => {
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    await expect(
      renderUnitActionSheet([
        { ordinal: 1, mediaId: 'media-1', timestamp: 0, buffer: await solid(COLORS[0]!) },
      ]),
    ).rejects.toThrow('REMAKE_ACTION_SHEET_SOURCE_COUNT_INVALID')
  })

  it('rejects more than 9 sources', async () => {
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const sources = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => ({
        ordinal: i + 1,
        mediaId: `media-${i + 1}`,
        timestamp: i * 500,
        buffer: await solid(COLORS[i % COLORS.length]!),
      })),
    )
    await expect(renderUnitActionSheet(sources)).rejects.toThrow(
      'REMAKE_ACTION_SHEET_SOURCE_COUNT_INVALID',
    )
  })
})
