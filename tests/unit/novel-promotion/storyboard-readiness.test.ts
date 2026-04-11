import { describe, expect, it } from 'vitest'
import {
  formatPanelImageReadinessError,
  getPanelImageGenerationReadiness,
  getStoryboardTextGenerationReadiness,
} from '@/lib/novel-promotion/storyboard-readiness'

describe('storyboard readiness helpers', () => {
  it('storyboard text generation stays ready when character/location images are missing', () => {
    const readiness = getStoryboardTextGenerationReadiness({
      clips: [
        {
          id: 'clip-1',
          characters: JSON.stringify(['Hero']),
          location: 'Old Town',
        },
      ],
    })

    expect(readiness).toEqual({
      isReady: true,
      blockingReason: null,
    })
  })

  it('panel image generation rejects missing referenced character/location images', () => {
    const readiness = getPanelImageGenerationReadiness({
      panel: {
        id: 'panel-1',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        location: 'Old Town',
      },
      characters: [
        {
          id: 'character-1',
          name: 'Hero',
          appearances: [
            {
              changeReason: 'default',
              imageUrl: null,
              imageUrls: [],
              selectedIndex: 0,
            },
          ],
        },
      ],
      locations: [
        {
          id: 'location-1',
          name: 'Old Town',
          selectedImageId: 'location-image-1',
          images: [
            {
              id: 'location-image-1',
              isSelected: true,
              imageUrl: null,
            },
          ],
        },
      ],
    })

    expect(readiness.isReady).toBe(false)
    expect(readiness.missingReferences).toEqual([
      { type: 'character', name: 'Hero', reason: 'image_missing' },
      { type: 'location', name: 'Old Town', reason: 'image_missing' },
    ])
    expect(formatPanelImageReadinessError(readiness)).toContain('角色「Hero」缺少参考图')
    expect(formatPanelImageReadinessError(readiness)).toContain('场景「Old Town」缺少参考图')
  })

  it('panel image generation allows panels without character/location references', () => {
    const readiness = getPanelImageGenerationReadiness({
      panel: {
        id: 'panel-2',
        characters: null,
        location: null,
      },
      characters: [],
      locations: [],
    })

    expect(readiness).toEqual({
      isReady: true,
      missingReferences: [],
    })
  })
})
