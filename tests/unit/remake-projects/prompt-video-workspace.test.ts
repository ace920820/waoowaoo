import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createVideoPromptWorkspace } from '@/lib/remake-projects/prompt/video-workspace'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('video Prompt Codex workspace', () => {
  it('creates an isolated MP4 workspace with an authoritative escaped manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'waoowaoo-prompt-workspace-test-'))
    directories.push(root)
    const workspace = await createVideoPromptWorkspace({
      parentDirectory: root,
      source: { bytes: Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), contentType: 'video/mp4' },
      shots: [{
        stableShotId: 'shot,"one"\nline', sequence: 1, startTime: '00:00:00.000', endTime: '00:00:01.000',
        frames: {
          first: { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: 'image/jpeg' },
          middle: { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), contentType: 'image/png' },
          last: { bytes: Buffer.from('RIFFxxxxWEBP'), contentType: 'image/webp' },
        },
      }],
    })
    directories.push(workspace.directory)

    expect((await stat(workspace.directory)).mode & 0o777).toBe(0o700)
    expect(await readFile(join(workspace.directory, 'source.mp4'))).toEqual(expect.any(Buffer))
    expect(await readFile(join(workspace.directory, 'manifest.csv'), 'utf8')).toBe(
      'stableShotId,startTime,endTime,firstFrame,middleFrame,lastFrame\n"shot,""one""\nline",00:00:00.000,00:00:01.000,frames/001-start.jpg,frames/001-middle.png,frames/001-end.webp\n',
    )
    expect(workspace.promptPaths).toEqual({ manifest: 'manifest.csv', source: 'source.mp4', frames: 'frames', evidence: 'evidence' })
  })

  it('rejects non-MP4 source media before creating a Codex workspace', async () => {
    await expect(createVideoPromptWorkspace({
      source: { bytes: Buffer.from('not-an-mp4'), contentType: 'video/webm' },
      shots: [],
    })).rejects.toThrow('REMAKE_PROMPT_VIDEO_SOURCE_NOT_MP4')
  })
})
