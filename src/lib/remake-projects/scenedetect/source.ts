import { deleteObject, generateUniqueKey, uploadObject } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { probeVideo, type VideoProbeMetadata } from './video-probe'

const ALLOWED_VIDEO_TYPES = new Map([
  ['mp4', 'video/mp4'],
  ['m4v', 'video/x-m4v'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm'],
])
const DEFAULT_MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024

export class SourceIngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceIngestError'
  }
}

type SourceRow = Record<string, unknown>
type RemakeTransaction = {
  remakeSource: {
    findFirst: (args: unknown) => Promise<SourceRow | null>
    create: (args: unknown) => Promise<SourceRow>
  }
  remakeProject: { update: (args: unknown) => Promise<SourceRow> }
}

function sourceClient() {
  return prisma as unknown as {
    remakeProject: { findUnique: (args: unknown) => Promise<SourceRow | null> }
    remakeSource: { findFirst: (args: unknown) => Promise<SourceRow | null> }
    $transaction: <T>(callback: (tx: RemakeTransaction) => Promise<T>) => Promise<T>
  }
}

function configuredMaxBytes(): number {
  const configured = Number(process.env.SCENEDETECT_SOURCE_MAX_BYTES)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_SOURCE_BYTES
}

function extensionOf(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  if (!ALLOWED_VIDEO_TYPES.has(extension)) throw new SourceIngestError('Unsupported source video extension')
  return extension
}

function hasExpectedHeader(bytes: Buffer, extension: string): boolean {
  if (bytes.length < 8) return false
  if (extension === 'webm') return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  return bytes.subarray(4, 8).toString('ascii') === 'ftyp'
}

function validateFile(file: File, bytes: Buffer): { extension: string; contentType: string } {
  const extension = extensionOf(file.name)
  const expectedType = ALLOWED_VIDEO_TYPES.get(extension)!
  const contentType = file.type.toLowerCase()
  if (contentType !== expectedType && !(extension === 'm4v' && contentType === 'video/mp4')) {
    throw new SourceIngestError('Source video type does not match its extension')
  }
  if (bytes.length < 1 || bytes.length > configuredMaxBytes()) throw new SourceIngestError('Source video exceeds the allowed size')
  if (!hasExpectedHeader(bytes, extension)) throw new SourceIngestError('Source video header does not match its extension')
  return { extension, contentType }
}

function toSourceResponse(row: SourceRow) {
  const metadata = typeof row.probeMetadata === 'string' ? JSON.parse(row.probeMetadata) : row.probeMetadata
  return { sourceRevision: Number(row.sourceRevision), status: row.status, metadata }
}

export async function ingestRemakeSource(input: { projectId: string; file: File; operationKey: string }) {
  if (!input.operationKey.trim()) throw new SourceIngestError('operationKey is required')
  const client = sourceClient()
  const remakeProject = await client.remakeProject.findUnique({ where: { projectId: input.projectId } })
  if (!remakeProject) throw new SourceIngestError('Remake project was not found')
  const replay = await client.remakeSource.findFirst({ where: { remakeProjectId: remakeProject.id, operationKey: input.operationKey } })
  if (replay) return { created: false, source: toSourceResponse(replay) }

  const bytes = Buffer.from(await input.file.arrayBuffer())
  const validation = validateFile(input.file, bytes)
  const metadata: VideoProbeMetadata = await probeVideo(bytes, validation.extension)
  const storageKey = generateUniqueKey(`remake/${input.projectId}/source`, validation.extension)
  await uploadObject(bytes, storageKey, 1, validation.contentType)

  try {
    const source = await client.$transaction(async (tx) => {
      const latest = await tx.remakeSource.findFirst({
        where: { remakeProjectId: remakeProject.id }, orderBy: { sourceRevision: 'desc' },
      })
      const sourceRevision = Number(latest?.sourceRevision ?? 0) + 1
      const created = await tx.remakeSource.create({
        data: {
          remakeProjectId: remakeProject.id,
          sourceRevision,
          operationKey: input.operationKey,
          storageKey,
          fileName: input.file.name,
          contentType: validation.contentType,
          byteSize: BigInt(bytes.byteLength),
          probeMetadata: JSON.stringify(metadata),
          status: 'uploaded_pending',
        },
      })
      await tx.remakeProject.update({ where: { id: remakeProject.id }, data: { currentSourceId: created.id, importStatus: 'source_uploaded' } })
      return created as SourceRow
    })
    return { created: true, source: toSourceResponse(source) }
  } catch (error) {
    await deleteObject(storageKey).catch(() => undefined)
    throw error
  }
}
