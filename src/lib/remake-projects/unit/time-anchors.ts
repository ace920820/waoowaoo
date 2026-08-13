/**
 * Client-safe proportional time-anchor scaling and the D-09 timed-prompt
 * builder for Remake unit video generation.
 *
 * Both functions take numeric `durationSeconds` only — string timecodes are
 * converted to seconds by `timecodeToSeconds` before reaching this module.
 *
 * This module intentionally has NO `node:` / prisma imports so the client
 * preview panel (Plan 09.1-06, D-16 WYSIWYG) can import it unchanged.
 */

/** T-091-03: non-positive / NaN member durations coerce to this safe minimum. */
const SAFE_MIN_DURATION = 0.1

function safeDuration(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : SAFE_MIN_DURATION
}

export type UnitTimeAnchorMember = {
  ordinal: number
  durationSeconds: number
}

export type UnitTimeAnchorSegment = {
  ordinal: number
  startSeconds: number
  endSeconds: number
}

/**
 * Scale each member duration proportionally to the normalized total duration T:
 *
 *   segment_i = memberDur_i / sum(memberDurations) x T
 *
 * The first segment starts at 0 and segments tile the timeline back-to-back,
 * so the scaled segments always close (sum of scaled segments == T) — Pitfall 5
 * guard. A floating-point epsilon closure assertion throws if the sum drifts
 * from T, so a wrong anchor never silently reaches the frozen prompt.
 */
export function buildRemakeVideoUnitTimeAnchors(
  members: UnitTimeAnchorMember[],
  totalDurationSeconds: number,
): UnitTimeAnchorSegment[] {
  const total =
    Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0
      ? totalDurationSeconds
      : 0
  const sum = members.reduce((acc, member) => acc + safeDuration(member.durationSeconds), 0)
  // T-091-03: guard scale division when the sum is non-positive (factor 1).
  const scale = sum > 0 ? total / sum : 1
  let cursor = 0
  const segments = members.map((member) => {
    const startSeconds = cursor
    const endSeconds = cursor + safeDuration(member.durationSeconds) * scale
    cursor = endSeconds
    return { ordinal: member.ordinal, startSeconds, endSeconds }
  })

  const lastEnd = segments.length > 0 ? segments[segments.length - 1]!.endSeconds : 0
  const EPSILON = 1e-6
  if (Math.abs(lastEnd - total) > EPSILON) {
    throw new Error('REMAKE_VIDEO_UNIT_TIME_ANCHOR_CLOSURE_INVALID')
  }
  return segments
}

export type UnitTimedPromptMember = UnitTimeAnchorMember & {
  /** Adopted Video Prompt for this member (already approved). */
  prompt: string
}

/** D-09 canonical range display: `0-1s` / `3.3-6.7s` (unit suffix on the end). */
function formatAnchorRange(startSeconds: number, endSeconds: number): string {
  const start = Math.round(startSeconds * 10) / 10
  const end = Math.round(endSeconds * 10) / 10
  return `${start}-${end}s`
}

/**
 * Build the D-09 timed shot timeline: a cut-declaration header, a
 * 总时长约 N 秒 line, one line per member in ordinal order formatted as
 * `0-1s（镜头 1）：prompt` with 0.1s-precision rounding, and the overall
 * consistency requirements (each segment's visuals anchor to its matching
 * @Image keyframe).
 */
export function buildUnitTimedPrompt(
  members: UnitTimedPromptMember[],
  totalDurationSeconds: number,
): string {
  const segments = buildRemakeVideoUnitTimeAnchors(members, totalDurationSeconds)
  const lines = segments.map((segment, index) => {
    const member = members[index]
    return `${formatAnchorRange(segment.startSeconds, segment.endSeconds)}（镜头 ${index + 1}）：${member.prompt}`
  })
  return [
    '这是按时间顺序切换的多镜头视频，各镜头之间为剪接切换（cut），不是连续运镜。',
    `总时长约 ${totalDurationSeconds} 秒。各镜头的时间位置与提示如下：`,
    '',
    ...lines,
    '',
    '整体一致性要求：',
    '- 各镜头保持角色形象、场景、画风一致（以对应时间段的 @Image 关键帧为锚）；',
    '- 镜头切换自然、节奏紧凑，不补足空洞对话/无意义填充。',
  ].join('\n')
}
