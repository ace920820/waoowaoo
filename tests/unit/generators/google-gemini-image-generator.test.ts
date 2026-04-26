import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateContentMock = vi.hoisted(() => vi.fn())

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      generateContent: generateContentMock,
    },
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'harassment',
    HARM_CATEGORY_HATE_SPEECH: 'hate_speech',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'sexually_explicit',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'dangerous_content',
  },
  HarmBlockThreshold: {
    BLOCK_NONE: 'BLOCK_NONE',
  },
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'google-key' })),
}))

vi.mock('@/lib/image-cache', () => ({
  getImageBase64Cached: vi.fn(),
}))

vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}))

import { GoogleGeminiImageGenerator } from '@/lib/generators/image/google'

describe('GoogleGeminiImageGenerator Nano Banana 2 adaptation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'generated-image-base64',
                },
              },
            ],
          },
        },
      ],
    })
  })

  it('omits imageConfig.aspectRatio for Nano Banana 2 when reference images are present', async () => {
    const generator = new GoogleGeminiImageGenerator('gemini-3.1-flash-image-preview')

    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'draw storyboard panel',
      referenceImages: ['raw-base64-reference'],
      options: {
        modelKey: 'google::gemini-3.1-flash-image-preview',
        aspectRatio: '16:9',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'generated-image-base64',
      imageUrl: 'data:image/png;base64,generated-image-base64',
    })
    expect(generateContentMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/png', data: 'raw-base64-reference' } },
            { text: 'draw storyboard panel' },
          ],
        },
      ],
      config: expect.objectContaining({
        responseModalities: ['TEXT', 'IMAGE'],
      }),
    }))
    expect(generateContentMock.mock.calls[0]?.[0]?.config).not.toHaveProperty('imageConfig')
  })

  it('retains supported imageConfig fields for Nano Banana 2 image-conditioned requests', async () => {
    const generator = new GoogleGeminiImageGenerator('gemini-3.1-flash-image-preview')

    await generator.generate({
      userId: 'user-1',
      prompt: 'draw storyboard panel',
      referenceImages: ['raw-base64-reference'],
      options: {
        modelKey: 'google::gemini-3.1-flash-image-preview',
        aspectRatio: '16:9',
        resolution: '2K',
      },
    })

    expect(generateContentMock.mock.calls[0]?.[0]?.config).toEqual(expect.objectContaining({
      imageConfig: {
        imageSize: '2K',
      },
    }))
  })

  it('omits unsupported 0.5K imageSize for Nano Banana 2 image-conditioned requests', async () => {
    const generator = new GoogleGeminiImageGenerator('gemini-3.1-flash-image-preview')

    await generator.generate({
      userId: 'user-1',
      prompt: 'draw storyboard panel',
      referenceImages: ['raw-base64-reference'],
      options: {
        modelKey: 'google::gemini-3.1-flash-image-preview',
        aspectRatio: '4:3',
        resolution: '0.5K',
      },
    })

    expect(generateContentMock.mock.calls[0]?.[0]?.config).not.toHaveProperty('imageConfig')
  })

  it('keeps aspectRatio for Nano Banana 2 text-only generation', async () => {
    const generator = new GoogleGeminiImageGenerator('gemini-3.1-flash-image-preview')

    await generator.generate({
      userId: 'user-1',
      prompt: 'draw storyboard panel',
      options: {
        modelKey: 'google::gemini-3.1-flash-image-preview',
        aspectRatio: '16:9',
      },
    })

    expect(generateContentMock.mock.calls[0]?.[0]?.config).toEqual(expect.objectContaining({
      imageConfig: {
        aspectRatio: '16:9',
      },
    }))
  })
})
