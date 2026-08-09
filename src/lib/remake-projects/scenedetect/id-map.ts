export function createExternalShotKey(projectId: string, analysisId: string, externalShotKey: string): string {
  // analysisId changes on every executor run. It is provenance, not Shot identity.
  void analysisId
  return `${projectId}:${externalShotKey}`
}

export function resolveWaooShotId(externalKey: string, existing: ReadonlyMap<string, string>): string {
  return existing.get(externalKey) || crypto.randomUUID()
}

export function externalShotKeyFromStableKey(stableKey: string): string {
  const separator = stableKey.indexOf(':')
  return separator >= 0 ? stableKey.slice(separator + 1) : stableKey
}
