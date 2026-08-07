import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type VideoProbeMetadata = {
  duration: number
  fps: number
  width: number
  height: number
  totalFrames: number
}

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseFps(value: unknown): number | null {
  if (typeof value !== 'string') return finitePositive(value)
  const [numerator, denominator] = value.split('/').map(Number)
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? finitePositive(numerator / denominator)
    : null
}

export async function probeVideo(bytes: Buffer, extension: string): Promise<VideoProbeMetadata> {
  const directory = await mkdtemp(join(tmpdir(), 'waoowaoo-source-'))
  const inputPath = join(directory, `source.${extension}`)
  try {
    await writeFile(inputPath, bytes, { mode: 0o600 })
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height,avg_frame_rate,nb_frames:format=duration', '-of', 'json', inputPath,
    ], { timeout: 15_000, maxBuffer: 128 * 1024 })
    const parsed = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> }
    const stream = parsed.streams?.[0]
    const duration = finitePositive(parsed.format?.duration)
    const fps = parseFps(stream?.avg_frame_rate)
    const width = finitePositive(stream?.width)
    const height = finitePositive(stream?.height)
    const declaredFrames = finitePositive(stream?.nb_frames)
    if (!duration || !fps || !width || !height) throw new Error('Video probe returned incomplete metadata')
    const totalFrames = declaredFrames ? Math.round(declaredFrames) : Math.round(duration * fps)
    if (!Number.isSafeInteger(totalFrames) || totalFrames < 1) throw new Error('Video probe returned invalid frame count')
    return { duration, fps, width: Math.round(width), height: Math.round(height), totalFrames }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
