const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'video/mp4', 'video/webm'])

export type SceneDetectMediaInput =
  | { kind: 'executor_bytes'; bytes: Uint8Array; contentType: string; fileName: string }
  | { kind: 'signed_object'; objectId: string; contentType: string }
  | { kind: 'external_url'; url: string; contentType?: string; contentLength?: number }

export function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  if (value === 'localhost' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true
  const octets = value.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254) || octets[0] === 0
}

export async function validateExternalMediaUrl(urlValue: string, options: {
  allowlistedHosts: ReadonlySet<string>
  resolveHost?: (hostname: string) => Promise<string[]>
  maxRedirects?: number
}): Promise<URL> {
  const url = new URL(urlValue)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Media URL must be credential-free HTTPS')
  if (!options.allowlistedHosts.has(url.hostname.toLowerCase())) throw new Error('Media URL host is not allowlisted')
  if (url.port && url.port !== '443') throw new Error('Media URL port is not allowed')
  const addresses = await (options.resolveHost?.(url.hostname) ?? Promise.resolve([url.hostname]))
  if (addresses.some(isPrivateAddress)) throw new Error('Media URL resolves to a private address')
  return url
}

export function normalizeMediaInput(input: SceneDetectMediaInput, maxBytes = DEFAULT_MAX_BYTES) {
  const contentType = input.contentType ?? ''
  if (!ALLOWED_MIME_TYPES.has(contentType)) throw new Error('Unsupported media content type')
  if (input.kind === 'executor_bytes') {
    if (input.bytes.byteLength > maxBytes) throw new Error('Media exceeds byte limit')
    return { kind: 'executor_bytes' as const, contentType, fileName: input.fileName, bytes: input.bytes }
  }
  if (input.kind === 'signed_object') return { kind: 'signed_object' as const, objectId: input.objectId, contentType }
  if (input.contentLength !== undefined && input.contentLength > maxBytes) throw new Error('Media exceeds byte limit')
  return { kind: 'external_url' as const, url: input.url, contentType }
}
