import { describe, expect, it } from 'vitest'
import { timecodeToSeconds } from '@/lib/remake-projects/unit/timecode'
import { adaptRemakeShot } from '@/lib/remake-projects/keyframes/adapter'
import {
  buildRemakeVideoUnitTimeAnchors,
  buildUnitTimedPrompt,
} from '@/lib/remake-projects/unit/time-anchors'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

describe('timecodeToSeconds (Pitfall 1 parser)', () => {
  it('parses MM:SS.mmm, HH:MM:SS.mmm, SS.mmm, and plain seconds', () => {
    expect(timecodeToSeconds('00:01.500')).toBe(1.5)
    expect(timecodeToSeconds('00:00:02.250')).toBe(2.25)
    expect(timecodeToSeconds('3.5')).toBe(3.5)
    expect(timecodeToSeconds('12')).toBe(12)
    expect(timecodeToSeconds('01:02:03.000')).toBe(3723)
    expect(timecodeToSeconds('02:30')).toBe(150)
  })

  it('returns 0 for empty or malformed input without throwing', () => {
    expect(timecodeToSeconds('')).toBe(0)
    expect(timecodeToSeconds('   ')).toBe(0)
    expect(timecodeToSeconds('abc')).toBe(0)
    expect(timecodeToSeconds('00:xx:00')).toBe(0)
    expect(timecodeToSeconds('1:2:3:4')).toBe(0)
  })
})

describe('adaptRemakeShot durationSeconds (Pitfall 1 projection)', () => {
  const baseShot = {
    id: 'shot-1',
    stableKey: 'scene-1-shot-1',
    sequence: 1,
    reviewStatus: 'pending',
  } as unknown as RemakeSnapshot['shots'][number]

  it('uses a numeric timeRange when present', () => {
    const shot = {
      ...baseShot,
      timeRange: { start: 1, end: 5 },
    } as unknown as RemakeSnapshot['shots'][number]
    expect(adaptRemakeShot(shot).durationSeconds).toBe(4)
  })

  it('parses projected HH:MM:SS.mmm string timecodes instead of falling back to 3', () => {
    const shot = {
      ...baseShot,
      timeRange: { start: '00:00:00.500', end: '00:00:02.000' },
    } as unknown as RemakeSnapshot['shots'][number]
    expect(adaptRemakeShot(shot).durationSeconds).toBe(1.5)
  })

  it('parses projected MM:SS.mmm string timecodes', () => {
    const shot = {
      ...baseShot,
      timeRange: { start: '00:00.000', end: '00:01.000' },
    } as unknown as RemakeSnapshot['shots'][number]
    expect(adaptRemakeShot(shot).durationSeconds).toBe(1)
  })

  it('falls back to 3 only when no parseable timecode exists', () => {
    const missing = { ...baseShot } as unknown as RemakeSnapshot['shots'][number]
    expect(adaptRemakeShot(missing).durationSeconds).toBe(3)
    const malformed = {
      ...baseShot,
      timeRange: { start: 'nope', end: 'also-nope' },
    } as unknown as RemakeSnapshot['shots'][number]
    expect(adaptRemakeShot(malformed).durationSeconds).toBe(3)
  })
})

describe('buildRemakeVideoUnitTimeAnchors (D-09 proportional scaling)', () => {
  it('scales each member duration by memberDur / sum x T with the first segment starting at 0', () => {
    const anchors = buildRemakeVideoUnitTimeAnchors(
      [
        { ordinal: 1, durationSeconds: 1 },
        { ordinal: 2, durationSeconds: 3 },
      ],
      8,
    )
    expect(anchors[0]).toEqual({ ordinal: 1, startSeconds: 0, endSeconds: 2 })
    expect(anchors[1]).toEqual({ ordinal: 2, startSeconds: 2, endSeconds: 8 })
  })

  it('closes intervals: the sum of all scaled segments equals the normalized total T', () => {
    const total = 10
    const anchors = buildRemakeVideoUnitTimeAnchors(
      [
        { ordinal: 1, durationSeconds: 2 },
        { ordinal: 2, durationSeconds: 2 },
        { ordinal: 3, durationSeconds: 1 },
      ],
      total,
    )
    expect(anchors[0]!.startSeconds).toBe(0)
    const sum = anchors.reduce((acc, segment) => acc + (segment.endSeconds - segment.startSeconds), 0)
    expect(Math.abs(sum - total)).toBeLessThan(1e-6)
    expect(anchors[anchors.length - 1]!.endSeconds).toBeCloseTo(total, 6)
  })

  it('guards non-positive durations with a safe minimum and keeps closure (T-091-03)', () => {
    const total = 6
    const anchors = buildRemakeVideoUnitTimeAnchors(
      [
        { ordinal: 1, durationSeconds: 0 },
        { ordinal: 2, durationSeconds: 3 },
      ],
      total,
    )
    expect(anchors[0]!.endSeconds).toBeGreaterThan(anchors[0]!.startSeconds)
    expect(anchors[1]!.endSeconds).toBeCloseTo(total, 6)
  })
})

describe('buildUnitTimedPrompt (D-09 timed prompt)', () => {
  it('emits the cut-declaration header, the 总时长 line, and one line per member in ordinal order', () => {
    const prompt = buildUnitTimedPrompt(
      [
        { ordinal: 1, durationSeconds: 1, prompt: '角色推门进入房间。' },
        { ordinal: 2, durationSeconds: 3, prompt: '角色走到窗边。' },
      ],
      8,
    )
    expect(prompt).toContain('这是按时间顺序切换的多镜头视频')
    expect(prompt).toContain('剪接切换（cut），不是连续运镜')
    expect(prompt).toContain('总时长约 8 秒。各镜头的时间位置与提示如下：')
    expect(prompt).toContain('0-2s（镜头 1）：角色推门进入房间。')
    expect(prompt).toContain('2-8s（镜头 2）：角色走到窗边。')
    expect(prompt.indexOf('镜头 1')).toBeLessThan(prompt.indexOf('镜头 2'))
  })

  it('formats anchors with 0.1s precision rounding', () => {
    const prompt = buildUnitTimedPrompt(
      [
        { ordinal: 1, durationSeconds: 1, prompt: 'A' },
        { ordinal: 2, durationSeconds: 1, prompt: 'B' },
        { ordinal: 3, durationSeconds: 1, prompt: 'C' },
      ],
      10,
    )
    expect(prompt).toContain('0-3.3s（镜头 1）：A')
    expect(prompt).toContain('3.3-6.7s（镜头 2）：B')
    expect(prompt).toContain('6.7-10s（镜头 3）：C')
  })
})
