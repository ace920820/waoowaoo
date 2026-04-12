import { describe, expect, it } from 'vitest'
import {
  collapseCharacterSelection,
  collapseLocationSelection,
  resolveCharacterSelectedImageUrl,
  resolveSelectedLocationImage,
} from '@/lib/assets/image-selection-state'

describe('image selection state helpers', () => {
  it('prefers selected character candidate over stale imageUrl', () => {
    expect(resolveCharacterSelectedImageUrl({
      imageUrl: 'stale-cover',
      imageUrls: ['img-0', 'img-1', 'img-2'],
      selectedIndex: 2,
    })).toBe('img-2')
  })

  it('prefers selected location image id over list fallback', () => {
    const selected = resolveSelectedLocationImage({
      selectedImageId: 'img-2',
      images: [
        { id: 'img-1', imageIndex: 0, imageUrl: 'loc-0', isSelected: true },
        { id: 'img-2', imageIndex: 1, imageUrl: 'loc-1', isSelected: false },
      ],
    })

    expect(selected?.id).toBe('img-2')
    expect(selected?.imageUrl).toBe('loc-1')
  })

  it('collapses character selection to the confirmed image only', () => {
    const collapsed = collapseCharacterSelection({
      imageUrl: 'stale-cover',
      imageUrls: ['img-0', 'img-1', 'img-2'],
      selectedIndex: 1,
      descriptions: ['d0', 'd1', 'd2'],
      description: 'fallback',
    })

    expect(collapsed.imageUrl).toBe('img-1')
    expect(collapsed.imageUrls).toEqual(['img-1'])
    expect(collapsed.selectedIndex).toBe(0)
    expect(collapsed.descriptions).toEqual(['d1'])
    expect(collapsed.description).toBe('d1')
  })

  it('collapses location selection to the confirmed image only', () => {
    const collapsed = collapseLocationSelection({
      selectedImageId: 'img-2',
      images: [
        { id: 'img-1', imageIndex: 0, imageUrl: 'loc-0', isSelected: false },
        { id: 'img-2', imageIndex: 1, imageUrl: 'loc-1', isSelected: true },
      ],
    })

    expect(collapsed.selectedImageId).toBe('img-2')
    expect(collapsed.images).toEqual([
      { id: 'img-2', imageIndex: 0, imageUrl: 'loc-1', isSelected: true },
    ])
  })
})
