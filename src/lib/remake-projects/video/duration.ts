import type { EffectiveVideoCapabilityDefinition } from '@/lib/model-capabilities/video-effective'

/**
 * Derive the default video duration for a Shot per D-10 / D-11.
 *
 * Pure function — safe to import in client components.
 * Does NOT depend on prisma, storage, or any server-only module.
 */
export function deriveDefaultVideoDuration(
  shotDurationSeconds: number,
  definitions: EffectiveVideoCapabilityDefinition[],
): number {
  // D-10: round up to integer
  let duration = Math.ceil(shotDurationSeconds)

  const durationDef = definitions.find((d) => d.field === 'duration')
  const durationOptions = durationDef?.options
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)

  const hasDurationOptions = durationOptions && durationOptions.length > 0
  const minDuration = hasDurationOptions ? durationOptions![0] : 1
  const modelMax = hasDurationOptions
    ? durationOptions![durationOptions!.length - 1]
    : 15
  const maxDuration = Math.min(15, modelMax)

  if (duration < minDuration) duration = minDuration
  if (duration > maxDuration) duration = maxDuration

  // D-11: if discrete options, round up to nearest legal
  if (hasDurationOptions) {
    const discrete = durationOptions!
    const found = discrete.find((v) => v >= duration)
    if (found !== undefined) duration = found
    else duration = discrete[discrete.length - 1]
  }

  return Math.max(1, Math.floor(duration))
}
