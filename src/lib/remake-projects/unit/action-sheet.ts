import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey, getMediaObjectById } from '@/lib/media/service'
import { getObjectBuffer } from '@/lib/storage'
import {
  renderUnitActionSheet,
  unitActionSheetFingerprint,
  type UnitActionSheetSource,
} from '../keyframes/action-sheet'

/**
 * D-07 / W5 merged unit action-sheet persist helper (Plan 09.1-04).
 *
 * Invoked ONLY by the worker task flow (Plan 09.1-05): it renders the merged
 * N-grid sheet from the snapshot-frozen member sources, uploads it to COS,
 * ensures a stable MediaObject, and persists a `RemakeVideoUnitActionSheet`
 * row deduped by `unitActionSheetFingerprint` — the `sources` column records
 * the per-member provenance (ordinal + mediaId + timestamp), mirroring the
 * `persistActionSheet` conventions.
 *
 * The submission service and the preview endpoint MUST NOT call this helper
 * (W5 — no rendering or persistence in the synchronous request path); the
 * preview renders on demand with the pure `renderUnitActionSheet` instead.
 *
 * T-091-20: sources come from the frozen snapshot only (never client-supplied
 * URLs), and the fingerprint dedup makes re-renders idempotent.
 */

export type UnitActionSheetPersistSource = Pick<
  UnitActionSheetSource,
  'ordinal' | 'mediaId' | 'timestamp'
> & {
  buffer?: Buffer
}

export async function renderAndPersistUnitActionSheet(input: {
  projectId: string
  unitId: string
  sources: UnitActionSheetPersistSource[]
  /** Phase 09.3: 宫格列数（缺省按源数量自动 2/3 列） */
  columns?: number
}) {
  const fingerprint = unitActionSheetFingerprint({
    unitId: input.unitId,
    cells: input.sources.map(({ mediaId }) => ({ mediaId })),
  })

  // Fingerprint dedup (D-07): identical cell sets never re-render/upload.
  const existing = await prisma.remakeVideoUnitActionSheet.findUnique({
    where: { unitId_fingerprint: { unitId: input.unitId, fingerprint } },
  })
  if (existing) {
    return {
      id: existing.id,
      unitId: existing.unitId,
      fingerprint,
      mediaId: existing.mediaId,
      status: existing.status,
      reused: true as const,
    }
  }

  // Resolve per-cell image buffers from the media library (worker path passes
  // mediaIds only; buffers are fetched here, never trusted from the client).
  const resolved = await Promise.all(
    input.sources.map(async (source) => {
      if (source.buffer) return source
      const media = await getMediaObjectById(source.mediaId)
      const storageKey = media?.storageKey
      if (!storageKey) throw new Error('REMAKE_ACTION_SHEET_SOURCE_MISSING')
      return { ...source, buffer: await getObjectBuffer(storageKey) }
    }),
  )

  const buffer = await renderUnitActionSheet(
    resolved as UnitActionSheetSource[],
    input.columns !== undefined ? { columns: input.columns } : undefined,
  )
  const key = generateUniqueKey(`remake/${input.projectId}/action-sheets`, 'jpg')
  const storageKey = await uploadObject(buffer, key, 1, 'image/jpeg')
  const media = await ensureMediaObjectFromStorageKey(storageKey, { mimeType: 'image/jpeg' })

  const row = await prisma.remakeVideoUnitActionSheet.create({
    data: {
      unitId: input.unitId,
      fingerprint,
      mediaId: media.id,
      sources: JSON.stringify(
        input.sources.map(({ ordinal, mediaId: sourceMediaId, timestamp }) => ({
          ordinal,
          mediaId: sourceMediaId,
          timestamp,
        })),
      ),
      status: 'completed',
    },
  })
  return {
    id: row.id,
    unitId: row.unitId,
    fingerprint,
    mediaId: row.mediaId,
    status: row.status,
    reused: false as const,
  }
}
