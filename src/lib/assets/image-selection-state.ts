type NullableString = string | null | undefined

export interface CharacterSelectionState {
  imageUrl?: NullableString
  imageUrls?: NullableString[]
  selectedIndex?: number | null
  description?: NullableString
  descriptions?: NullableString[] | null
}

export interface LocationSelectionImage {
  id: string
  imageIndex: number
  imageUrl: NullableString
  isSelected?: boolean
  description?: NullableString
}

export interface LocationSelectionState {
  selectedImageId?: string | null
  images?: LocationSelectionImage[]
}

function isNonEmptyString(value: NullableString): value is string {
  return typeof value === 'string' && value.length > 0
}

export function resolveCharacterSelectedImageUrl(state: CharacterSelectionState): string | null {
  const imageUrls = state.imageUrls || []
  const selectedUrl = typeof state.selectedIndex === 'number'
    ? imageUrls[state.selectedIndex]
    : null
  return selectedUrl || state.imageUrl || imageUrls.find(isNonEmptyString) || null
}

export function collapseCharacterSelection<T extends CharacterSelectionState>(state: T): T {
  const imageUrls = state.imageUrls || []
  const selectedIndex = typeof state.selectedIndex === 'number' ? state.selectedIndex : null
  const selectedUrl = selectedIndex !== null ? imageUrls[selectedIndex] || null : null
  const descriptions = state.descriptions || null
  const selectedDescription = selectedIndex !== null && descriptions
    ? descriptions[selectedIndex] || state.description || null
    : state.description || null

  return {
    ...state,
    imageUrl: selectedUrl || state.imageUrl || null,
    imageUrls: selectedUrl ? [selectedUrl] : state.imageUrls || [],
    selectedIndex: selectedUrl ? 0 : state.selectedIndex ?? null,
    description: selectedDescription,
    descriptions: selectedUrl ? [selectedDescription] : descriptions,
  }
}

export function resolveSelectedLocationImage(state: LocationSelectionState): LocationSelectionImage | null {
  const images = state.images || []
  const selectedById = state.selectedImageId
    ? images.find((image) => image.id === state.selectedImageId)
    : null
  const selected = selectedById || images.find((image) => image.isSelected)
  return selected || images.find((image) => isNonEmptyString(image.imageUrl)) || null
}

export function collapseLocationSelection<T extends LocationSelectionState>(state: T): T {
  const selectedImage = resolveSelectedLocationImage(state)
  if (!selectedImage) return state

  return {
    ...state,
    selectedImageId: selectedImage.id,
    images: [{
      ...selectedImage,
      imageIndex: 0,
      isSelected: true,
    }],
  }
}
