/**
 * Client-safe timecode-to-seconds parser shared by the keyframe adapter and
 * the unit time anchors (D-09 / Pitfall 1).
 *
 * Supports `MM:SS.mmm`, `HH:MM:SS.mmm`, `SS.mmm`, and plain seconds.
 *
 * Two entry points:
 *   - `timecodeToSeconds`: the public contract — empty/malformed input returns
 *     0 WITHOUT throwing, so duration derivation degrades gracefully.
 *   - `parseTimecodeSeconds`: strict variant — returns `null` for
 *     empty/malformed input so callers (e.g. the keyframe adapter) can tell a
 *     genuinely parseable timecode apart from a fallback (Pitfall 1: never
 *     fall back to 3 when parseable timecodes exist).
 *
 * This module intentionally has NO `node:` imports so the client preview panel
 * (Plan 09.1-06, D-16 WYSIWYG) can import it unchanged.
 */
export function parseTimecodeSeconds(timecode: string): number | null {
  if (!timecode) return null
  const trimmed = timecode.trim()
  if (!trimmed) return null

  const parts = trimmed.split(':')
  let seconds = 0

  if (parts.length === 3) {
    const hours = Number(parts[0])
    const minutes = Number(parts[1])
    const secs = Number(parts[2])
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(secs)) return null
    seconds = hours * 3600 + minutes * 60 + secs
  } else if (parts.length === 2) {
    const minutes = Number(parts[0])
    const secs = Number(parts[1])
    if (!Number.isFinite(minutes) || !Number.isFinite(secs)) return null
    seconds = minutes * 60 + secs
  } else if (parts.length === 1) {
    const secs = Number(parts[0])
    if (!Number.isFinite(secs)) return null
    seconds = secs
  } else {
    // More than two colons (4+ fields) is not a supported timecode shape.
    return null
  }

  return Math.max(0, seconds)
}

export function timecodeToSeconds(timecode: string): number {
  return parseTimecodeSeconds(timecode) ?? 0
}
