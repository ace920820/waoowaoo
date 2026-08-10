import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { ACTION_SHEET_RENDERER_VERSION, actionSheetFingerprint, prepareActionSheet, renderActionSheet } from '@/lib/remake-projects/keyframes/action-sheet'

async function source(color: string, slot: 'start' | 'middle' | 'end', timestamp: number) {
  const buffer = await sharp({ create: { width: 32, height: 20, channels: 3, background: color } }).png().toBuffer()
  return { slot, mediaId: `${slot}-media`, timestamp, buffer }
}

describe('remake keyframe action-sheet contract', () => {
  it('renders deterministic Start -> Middle -> End pixels and exact provenance identity', async () => {
    const sources = [await source('#d33', 'start', 1), await source('#3d3', 'middle', 2), await source('#33d', 'end', 3)]
    const first = await renderActionSheet(sources)
    const second = await renderActionSheet(sources)
    expect(first.equals(second)).toBe(true)
    const prepared = prepareActionSheet({ revisionId: 'revision-1', confirmed: true, sources })
    expect(prepared.status).toBe('ready')
    expect(prepared.fingerprint).toBe(actionSheetFingerprint({ revisionId: 'revision-1', sources }))
    expect(prepared.output).toMatchObject({ renderer: ACTION_SHEET_RENDERER_VERSION, revisionId: 'revision-1', sources: [{ slot: 'start' }, { slot: 'middle' }, { slot: 'end' }] })
  })

  it('does not prepare output until the source revision is confirmed and complete', () => {
    const waiting = prepareActionSheet({ revisionId: 'revision-1', confirmed: false, sources: [] })
    expect(waiting).toMatchObject({ status: 'waiting', output: null })
    const missing = prepareActionSheet({ revisionId: 'revision-1', confirmed: true, sources: [{ slot: 'start', mediaId: 'start', timestamp: 1 }] })
    expect(missing).toMatchObject({ status: 'missing', output: null })
  })
})
