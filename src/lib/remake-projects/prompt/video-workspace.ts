import { chmod, mkdtemp, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export type VideoWorkspaceMedia = {
  bytes?: Buffer
  contentType?: string
  writeTo?: (destination: string) => Promise<void>
}

export type VideoWorkspaceShot = {
  stableShotId: string
  sequence: number
  startTime: string
  endTime: string
  frames: { first: VideoWorkspaceMedia; middle: VideoWorkspaceMedia; last: VideoWorkspaceMedia }
}

export type VideoPromptWorkspace = {
  directory: string
  promptPaths: { manifest: 'manifest.csv'; source: 'source.mp4'; frames: 'frames'; evidence: 'evidence' }
}

function csv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function extensionFromMedia(contentType: string | undefined, bytes: Buffer): 'jpg' | 'png' | 'webp' | 'mp4' | 'bin' {
  const type = contentType?.toLowerCase() || ''
  if (type === 'image/jpeg' || bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg'
  if (type === 'image/png' || bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (type === 'image/webp' || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')) return 'webp'
  if (type === 'video/mp4' || bytes.subarray(4, 8).toString() === 'ftyp') return 'mp4'
  return 'bin'
}

async function writeMedia(media: VideoWorkspaceMedia, stem: string): Promise<{ path: string; extension: ReturnType<typeof extensionFromMedia> }> {
  if ((!media.bytes && !media.writeTo) || (media.bytes && media.writeTo)) throw new Error('REMAKE_PROMPT_WORKSPACE_MEDIA_INVALID')
  const partial = `${stem}.part`
  if (media.bytes) await writeFile(partial, media.bytes, { mode: 0o600 })
  else await media.writeTo!(partial)
  const file = await open(partial, 'r')
  const header = Buffer.alloc(12)
  try {
    await file.read(header, 0, header.length, 0)
  } finally {
    await file.close()
  }
  const extension = extensionFromMedia(media.contentType, header)
  const path = `${stem}.${extension}`
  await rename(partial, path)
  await chmod(path, 0o600)
  return { path, extension }
}

export async function createVideoPromptWorkspace(input: {
  source: VideoWorkspaceMedia
  shots: VideoWorkspaceShot[]
  parentDirectory?: string
}): Promise<VideoPromptWorkspace> {
  const directory = await mkdtemp(join(input.parentDirectory || tmpdir(), 'waoowaoo-codex-video-'))
  try {
    await chmod(directory, 0o700)
    const framesDirectory = join(directory, 'frames')
    await mkdir(framesDirectory, { mode: 0o700 })
    await mkdir(join(directory, 'evidence'), { mode: 0o700 })
    const source = await writeMedia(input.source, join(directory, 'source'))
    if (source.extension !== 'mp4') throw new Error('REMAKE_PROMPT_VIDEO_SOURCE_NOT_MP4')
    const rows = ['stableShotId,startTime,endTime,firstFrame,middleFrame,lastFrame']
    const sequences = new Set<number>()
    for (const shot of input.shots) {
      if (!shot.stableShotId || !Number.isInteger(shot.sequence) || shot.sequence < 1 || sequences.has(shot.sequence) || !shot.startTime || !shot.endTime) throw new Error('REMAKE_PROMPT_VIDEO_BOUNDARY_INVALID')
      sequences.add(shot.sequence)
      const prefix = String(shot.sequence).padStart(3, '0')
      const first = await writeMedia(shot.frames.first, join(framesDirectory, `${prefix}-start`))
      const middle = await writeMedia(shot.frames.middle, join(framesDirectory, `${prefix}-middle`))
      const last = await writeMedia(shot.frames.last, join(framesDirectory, `${prefix}-end`))
      if ([first, middle, last].some((frame) => !['jpg', 'png', 'webp'].includes(frame.extension))) throw new Error('REMAKE_PROMPT_KEYFRAME_FORMAT_INVALID')
      rows.push([shot.stableShotId, shot.startTime, shot.endTime, `frames/${prefix}-start.${first.extension}`, `frames/${prefix}-middle.${middle.extension}`, `frames/${prefix}-end.${last.extension}`].map(csv).join(','))
    }
    await writeFile(join(directory, 'manifest.csv'), `${rows.join('\n')}\n`, { mode: 0o600 })
    return { directory, promptPaths: { manifest: 'manifest.csv', source: 'source.mp4', frames: 'frames', evidence: 'evidence' } }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function removeVideoPromptWorkspace(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true })
}
