import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  apiKey: 'vidu-key',
})))

const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QQ=='))

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

vi.stubGlobal('fetch', fetchMock)

import { ViduVideoGenerator } from '@/lib/generators/vidu'

describe('ViduVideoGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({ apiKey: 'vidu-key' })
    normalizeToBase64ForGenerationMock.mockResolvedValue('data:image/png;base64,QQ==')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        task_id: 'vidu-task-1',
        state: 'created',
      }),
    })
  })

  it('forces bgm=false while preserving spoken audio generation', async () => {
    const generator = new ViduVideoGenerator()
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: 'Generate spoken dialogue only.',
      options: {
        modelId: 'viduq3-pro',
        duration: 5,
        resolution: '720p',
        generateAudio: true,
        bgm: true,
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'vidu-task-1',
    })

    const fetchCall = fetchMock.mock.calls.at(0)
    expect(fetchCall).toBeTruthy()
    if (!fetchCall) {
      throw new Error('fetch should be called')
    }

    const requestBody = JSON.parse(String(fetchCall[1]?.body))
    expect(requestBody).toMatchObject({
      model: 'viduq3-pro',
      audio: true,
      bgm: false,
    })
  })
})
