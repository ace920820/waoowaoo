interface CharacterAppearanceLike {
  changeReason?: string | null
  imageUrl?: string | null
  imageUrls?: string[] | string | null
  selectedIndex?: number | null
}

interface CharacterLike {
  id?: string
  name: string
  appearances?: CharacterAppearanceLike[]
}

interface LocationImageLike {
  id?: string
  isSelected?: boolean
  imageUrl?: string | null
}

interface LocationLike {
  id?: string
  name: string
  selectedImageId?: string | null
  images?: LocationImageLike[]
}

interface ClipLike {
  id?: string
  characters?: string | null
  location?: string | null
}

interface PanelLike {
  id?: string
  characters?: string | null
  location?: string | null
}

export interface PanelCharacterReference {
  name: string
  appearance?: string
  slot?: string
}

export interface StoryboardTextGenerationReadiness {
  isReady: boolean
  blockingReason: 'missing_clips' | null
}

export interface StoryboardAssetCoverage {
  referencedCharacterIds: string[]
  referencedLocationIds: string[]
  missingCharacterIds: string[]
  missingLocationIds: string[]
  missingAssetCount: number
}

export interface PanelImageMissingReference {
  type: 'character' | 'location'
  name: string
  reason: 'asset_not_found' | 'image_missing'
}

export interface PanelImageGenerationReadiness {
  isReady: boolean
  missingReferences: PanelImageMissingReference[]
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function parseImageUrls(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function fuzzyMatchLocationName(left: string, right: string): boolean {
  const leftNormalized = left.toLowerCase().trim()
  const rightNormalized = right.toLowerCase().trim()
  if (!leftNormalized || !rightNormalized) return false
  if (leftNormalized === rightNormalized) return true
  if (leftNormalized.includes(rightNormalized)) return true
  if (rightNormalized.includes(leftNormalized)) return true
  return false
}

export function parsePanelCharacterReferences(value: string | null | undefined): PanelCharacterReference[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item: unknown) => {
        if (typeof item === 'string') return { name: item.trim() }
        if (!item || typeof item !== 'object') return null
        const candidate = item as { name?: unknown; appearance?: unknown; slot?: unknown }
        if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null
        return {
          name: candidate.name.trim(),
          appearance: typeof candidate.appearance === 'string' && candidate.appearance.trim()
            ? candidate.appearance.trim()
            : undefined,
          slot: typeof candidate.slot === 'string' && candidate.slot.trim() ? candidate.slot.trim() : undefined,
        }
      })
      .filter((item): item is PanelCharacterReference => !!item)
  } catch {
    return []
  }
}

export function findCharacterByName<T extends { name: string }>(characters: T[], referenceName: string): T | undefined {
  const refLower = referenceName.toLowerCase().trim()
  if (!refLower) return undefined

  const exact = characters.find((item) => item.name.toLowerCase().trim() === refLower)
  if (exact) return exact

  const refAliases = refLower.split('/').map((item) => item.trim()).filter(Boolean)
  return characters.find((character) => {
    const aliases = character.name.toLowerCase().split('/').map((item) => item.trim()).filter(Boolean)
    return refAliases.some((alias) => aliases.includes(alias))
  })
}

export function getSelectedCharacterReferenceImage(appearance: CharacterAppearanceLike | null | undefined): string | null {
  if (!appearance) return null
  const imageUrls = parseImageUrls(appearance.imageUrls)
  const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : null
  if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < imageUrls.length) {
    const selected = imageUrls[selectedIndex]
    if (selected) return selected
  }
  return appearance.imageUrl || imageUrls[0] || null
}

function hasAnyCharacterReferenceImage(character: CharacterLike): boolean {
  return (character.appearances || []).some((appearance) => !!getSelectedCharacterReferenceImage(appearance))
}

export function getSelectedLocationReferenceImage(location: LocationLike | null | undefined): string | null {
  if (!location?.images?.length) return null
  const selected = location.selectedImageId
    ? location.images.find((image) => image.id === location.selectedImageId)
    : undefined
  const fallback =
    selected ||
    location.images.find((image) => image.isSelected) ||
    location.images.find((image) => image.imageUrl) ||
    location.images[0]
  return fallback?.imageUrl || null
}

export function getStoryboardTextGenerationReadiness(params: { clips: ClipLike[] }): StoryboardTextGenerationReadiness {
  return {
    isReady: params.clips.length > 0,
    blockingReason: params.clips.length > 0 ? null : 'missing_clips',
  }
}

export function getStoryboardAssetCoverageForClips(params: {
  clips: ClipLike[]
  characters: CharacterLike[]
  locations: LocationLike[]
}): StoryboardAssetCoverage {
  const referencedCharacters: CharacterLike[] = []
  const referencedLocations: LocationLike[] = []
  const seenCharacterIds = new Set<string>()
  const seenLocationIds = new Set<string>()

  for (const clip of params.clips) {
    const clipCharacters = parseJsonStringArray(clip.characters)
    for (const characterName of clipCharacters) {
      const matched = findCharacterByName(params.characters, characterName)
      if (!matched?.id || seenCharacterIds.has(matched.id)) continue
      seenCharacterIds.add(matched.id)
      referencedCharacters.push(matched)
    }

    const clipLocations = parseJsonStringArray(clip.location)
    for (const locationName of clipLocations) {
      const matched = params.locations.find((item) => fuzzyMatchLocationName(locationName, item.name))
      if (!matched?.id || seenLocationIds.has(matched.id)) continue
      seenLocationIds.add(matched.id)
      referencedLocations.push(matched)
    }
  }

  const missingCharacterIds = referencedCharacters
    .filter((character) => !hasAnyCharacterReferenceImage(character))
    .map((character) => character.id as string)
  const missingLocationIds = referencedLocations
    .filter((location) => !getSelectedLocationReferenceImage(location))
    .map((location) => location.id as string)

  return {
    referencedCharacterIds: referencedCharacters.map((character) => character.id as string),
    referencedLocationIds: referencedLocations.map((location) => location.id as string),
    missingCharacterIds,
    missingLocationIds,
    missingAssetCount: missingCharacterIds.length + missingLocationIds.length,
  }
}

export function getPanelImageGenerationReadiness(params: {
  panel: PanelLike
  characters: CharacterLike[]
  locations: LocationLike[]
}): PanelImageGenerationReadiness {
  const missingReferences: PanelImageMissingReference[] = []

  for (const reference of parsePanelCharacterReferences(params.panel.characters)) {
    const character = findCharacterByName(params.characters, reference.name)
    if (!character) {
      missingReferences.push({ type: 'character', name: reference.name, reason: 'asset_not_found' })
      continue
    }

    const appearances = character.appearances || []
    const matchedAppearance = reference.appearance
      ? appearances.find((appearance) => (appearance.changeReason || '').toLowerCase() === reference.appearance!.toLowerCase())
      : undefined
    const resolvedAppearance = reference.appearance
      ? matchedAppearance || null
      : appearances[0] || null

    if (!getSelectedCharacterReferenceImage(resolvedAppearance)) {
      missingReferences.push({ type: 'character', name: reference.name, reason: 'image_missing' })
    }
  }

  const locationName = params.panel.location?.trim()
  if (locationName) {
    const location = params.locations.find((item) => item.name.toLowerCase().trim() === locationName.toLowerCase())
    if (!location) {
      missingReferences.push({ type: 'location', name: locationName, reason: 'asset_not_found' })
    } else if (!getSelectedLocationReferenceImage(location)) {
      missingReferences.push({ type: 'location', name: locationName, reason: 'image_missing' })
    }
  }

  return {
    isReady: missingReferences.length === 0,
    missingReferences,
  }
}

export function formatPanelImageReadinessError(readiness: PanelImageGenerationReadiness): string {
  if (readiness.isReady) return ''
  const details = readiness.missingReferences.map((item) => {
    const noun = item.type === 'character' ? '角色' : '场景'
    const suffix = item.reason === 'asset_not_found' ? '未在资产库中找到' : '缺少参考图'
    return `${noun}「${item.name}」${suffix}`
  })
  return `当前分镜图生成缺少必要参考资产：${details.join('；')}。请先补齐后再生成分镜图。`
}
