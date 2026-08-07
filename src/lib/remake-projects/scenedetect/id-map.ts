export function createExternalShotKey(projectId: string, analysisId: string, externalShotKey: string): string {
  return `${projectId}:${analysisId}:${externalShotKey}`
}

export function resolveWaooShotId(externalKey: string, existing: ReadonlyMap<string, string>): string {
  return existing.get(externalKey) || crypto.randomUUID()
}

export function externalShotKeyFromStableKey(stableKey: string): string {
  const separator = stableKey.indexOf(':')
  return separator >= 0 ? stableKey.slice(separator + 1) : stableKey
}
