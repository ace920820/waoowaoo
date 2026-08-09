import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getObjectBuffer } from '@/lib/storage'
import { getMediaObjectById } from '@/lib/media/service'

type MediaRef = { key: string; contentType?: string | null }

function parseRefs(value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  } catch { return {} }
}

function resolveRange(raw: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!raw) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw.trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  let end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return 'invalid'
  end = Math.min(end, size - 1)
  return { start, end }
}

async function locate(projectId: string, mediaId: string): Promise<MediaRef | null> {
  const remake = await prisma.remakeProject.findUnique({
    where: { projectId },
    include: { currentSource: true, shots: { include: { revisions: { orderBy: { revision: 'desc' } } } } },
  }) as unknown as { currentSource?: Record<string, unknown> | null; shots?: Array<{ revisions?: Array<Record<string, unknown>> }> } | null
  if (!remake) return null
  const source = remake.currentSource
  if (source && source.status !== 'retired' && (source.mediaId === mediaId || source.id === mediaId) && typeof source.storageKey === 'string') {
    return { key: source.storageKey, contentType: typeof source.contentType === 'string' ? source.contentType : 'video/mp4' }
  }
  for (const shot of remake.shots || []) {
    const revision = (shot.revisions || []).find((item) => item.lifecycleState === undefined || item.lifecycleState === 'active')
    if (!revision || Number(revision.sourceRevision ?? source?.sourceRevision ?? 0) !== Number(source?.sourceRevision ?? 0)) continue
    const refs = parseRefs(revision.keyframeMediaRefs)
    const refRole = Object.entries(refs).find(([, id]) => id === mediaId)?.[0]
    if (refRole) {
      const media = await getMediaObjectById(mediaId)
      if (media?.storageKey) return { key: media.storageKey, contentType: media.mimeType || 'image/jpeg' }
      if (refs[refRole] && refs[refRole] !== mediaId) return { key: refs[refRole], contentType: 'image/jpeg' }
    }
    const payload = parseRefs(revision.payload)
    const mediaIds = parseRefs(payload.mediaIds)
    const mediaRole = Object.entries(mediaIds).find(([, id]) => id === mediaId)?.[0]
    if (mediaRole && refs[mediaRole]) return { key: refs[mediaRole], contentType: 'image/jpeg' }
  }
  return null
}

async function handler(request: NextRequest, context: { params: Promise<{ projectId: string; mediaId: string }> }) {
  const { projectId, mediaId } = await context.params
  const auth = await requireProjectAuthLight(projectId)
  if (isErrorResponse(auth)) return auth
  if (!mediaId || mediaId.includes('/') || mediaId.length > 200) throw new ApiError('NOT_FOUND')
  const ref = await locate(projectId, mediaId)
  if (!ref) throw new ApiError('NOT_FOUND')
  const bytes = await getObjectBuffer(ref.key)
  const range = resolveRange(request.headers.get('range'), bytes.byteLength)
  if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } })
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': ref.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=60' })
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(range ? range.end - range.start + 1 : bytes.byteLength))
    if (range) { headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`); return new NextResponse(null, { status: 206, headers }) }
    return new NextResponse(null, { status: 200, headers })
  }
  const body = range ? bytes.subarray(range.start, range.end + 1) : bytes
  headers.set('Content-Length', String(body.byteLength))
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`)
  return new NextResponse(new Uint8Array(body), { status: range ? 206 : 200, headers })
}

export const GET = apiHandler(handler)
export const HEAD = apiHandler(handler)
