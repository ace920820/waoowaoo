import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

import { generateImageViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-image'

describe('openai-compat template image output urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all image urls when outputUrlsPath contains multiple values', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { url: 'https://cdn.test/1.png' },
        { url: 'https://cdn.test/2.png' },
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/1.png',
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
  })

  it('renders gpt-image-2 quality alias as upstream model plus quality', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/alias.png' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-2-auto',
      modelKey: 'openai-compatible:test-provider::gpt-image-2-auto',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            quality: '{{quality}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
        },
      },
    })

    expect(result.imageUrl).toBe('https://cdn.test/alias.png')
    const request = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(request?.[0]).toBe('https://compat.example.com/v1/images/generations')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'draw a cat',
      quality: 'auto',
    })
  })

  it('accepts OpenAI-compatible b64_json image responses', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: 'YmFzZTY0LWltYWdl' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-2-high',
      modelKey: 'openai-compatible:test-provider::gpt-image-2-high',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            quality: '{{quality}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'YmFzZTY0LWltYWdl',
      imageUrl: 'data:image/png;base64,YmFzZTY0LWltYWdl',
    })
  })

  it('keeps single-url output compatible when outputUrlsPath has only one image', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/only.png' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/only.png',
    })
  })
})
