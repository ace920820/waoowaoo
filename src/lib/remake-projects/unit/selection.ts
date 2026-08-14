/**
 * Client-safe unit selection helpers for the 成片页 (D-04/D-18).
 *
 * D-04: a shot belongs to at most one unit; D-18: unit members are delivered
 * by their unit and do not get a separate single-shot video. Therefore a shot
 * already in a unit must NOT be selectable for a NEW unit — this prevents the
 * server-side REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED (409 Conflict) by
 * filtering before the request.
 */

export function canSelectShotForUnit(input: { inUnit: boolean }): boolean {
  return !input.inUnit
}

export function filterSelectableUnitShots(input: {
  selectedShotIds: string[]
  shotToUnit: ReadonlyMap<string, string>
}): { selectable: string[]; blocked: string[] } {
  const selectable: string[] = []
  const blocked: string[] = []
  for (const shotId of input.selectedShotIds) {
    if (input.shotToUnit.has(shotId)) {
      blocked.push(shotId)
    } else {
      selectable.push(shotId)
    }
  }
  return { selectable, blocked }
}
