import { beforeEach, describe, expect, it, vi } from 'vitest'

const projectId = '11111111-1111-4111-8111-111111111111'
const userId = 'user-1'
const shotId = '33333333-3333-4333-8333-333333333333'
const revisionId = '44444444-4444-4444-8444-444444444444'
const promptVersionId = '55555555-5555-4555-8555-555555555555'

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  remakeShot: { findFirst: vi.fn() },
  remakeKeyframeTrack: { findUnique: vi.fn() },
  novelPromotionProject: { findUnique: vi.fn() },
  novelPromotionCharacter: { findMany: vi.fn() },
  novelPromotionLocation: { findMany: vi.fn() },
}))
const media = vi.hoisted(() => ({
  resolveMediaRef: vi.fn(),
}))
const promptService = vi.hoisted(() => ({
  getAdoptedPromptForGeneration: vi.fn(),
}))
const config = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/media/service', () => ({ resolveMediaRef: media.resolveMediaRef }))
vi.mock('@/lib/remake-projects/prompt/service', () => promptService)
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: config.getProjectModelConfig,
  getUserModelConfig: vi.fn(async () => ({ storyboardModel: null })),
  resolveProjectModelCapabilityGenerationOptions: config.resolveProjectModelCapabilityGenerationOptions,
}))

describe('remake keyframe reference derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.project.findFirst.mockResolvedValue({ id: projectId })
    db.remakeShot.findFirst.mockResolvedValue({
      id: shotId,
      remakeProjectId: '22222222-2222-4222-8222-222222222222',
      stableKey: 'shot-1',
      currentRevision: 1,
      sceneAssetId: 'asset-scene',
      characterAssetIds: JSON.stringify(['asset-character']),
      propAssetIds: JSON.stringify(['asset-prop']),
      remakeProject: { currentSource: { sourceRevision: 1 } },
      revisions: [{ id: revisionId, revision: 1, sourceRevision: 1, lifecycleState: 'active' }],
    })
    db.remakeKeyframeTrack.findUnique.mockResolvedValue({ id: 'track-1', selectedForGeneration: true })
    db.novelPromotionProject.findUnique.mockResolvedValue({ id: 'container-1' })
    db.novelPromotionCharacter.findMany.mockResolvedValue([
      {
        id: 'asset-character',
        name: '小红',
        customVoiceMediaId: null,
        customVoiceUrl: null,
        appearances: [{ imageMediaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', imageUrl: 'images/character-1.png', imageUrls: null, selectedIndex: null }],
      },
    ])
    db.novelPromotionLocation.findMany.mockResolvedValue([
      {
        id: 'asset-scene',
        name: '雨夜街道',
        selectedImage: { imageMediaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', imageUrl: 'images/scene-1.png' },
        images: [],
      },
      {
        id: 'asset-prop',
        name: '旧雨伞',
        selectedImage: { imageMediaId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', imageUrl: 'images/prop-1.png' },
        images: [],
      },
    ])
    media.resolveMediaRef.mockImplementation(async (mediaId: string | null) =>
      mediaId ? { id: mediaId, storageKey: `images/${mediaId}.png` } : null,
    )
    promptService.getAdoptedPromptForGeneration.mockResolvedValue({ id: promptVersionId, integratedGenerationPrompt: 'A rainy street at dusk.' })
    config.getProjectModelConfig.mockResolvedValue({ storyboardModel: 'provider::image-v1' })
    config.resolveProjectModelCapabilityGenerationOptions.mockResolvedValue({})
  })

  it('derives all selected scene/character/prop asset images and appends a usage suffix', async () => {
    const { buildKeyframeGenerationSubmission } = await import('@/lib/remake-projects/keyframes/service')
    const descriptor = await buildKeyframeGenerationSubmission({
      projectId,
      userId,
      shotId,
      slot: 'start',
      operationKey: 'generate-1',
      count: 1,
      options: {},
      referenceMediaIds: [],
    })

    const snapshot = descriptor.payload.inputSnapshot
    // 顺序与 omni-reference 优先级一致：角色 -> 场景 -> 物品
    expect(snapshot.referenceMediaIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'])
    expect(snapshot.promptText).toContain('参考素材使用说明')
    expect(snapshot.promptText).toContain('@Image1（角色 小红）：必须保持角色身份、性别、脸型、发型、服装和年龄感一致。')
    expect(snapshot.promptText).toContain('@Image2（场景 雨夜街道）')
    expect(snapshot.promptText).toContain('@Image3（物品 旧雨伞）')
    expect(snapshot.promptText).toMatch(/^A rainy street at dusk\.\n\n参考素材使用说明：/)
  })

  it('merges client-passed reference media ids after the derived asset references', async () => {
    const { buildKeyframeGenerationSubmission } = await import('@/lib/remake-projects/keyframes/service')
    const descriptor = await buildKeyframeGenerationSubmission({
      projectId,
      userId,
      shotId,
      slot: 'start',
      operationKey: 'generate-2',
      count: 1,
      options: {},
      referenceMediaIds: ['66666666-6666-4666-8666-666666666666'],
    })

    expect(descriptor.payload.inputSnapshot.referenceMediaIds).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      '66666666-6666-4666-8666-666666666666',
    ])
  })

  it('accepts the suffixed promptText during the currentness check', async () => {
    const service = await import('@/lib/remake-projects/keyframes/service')
    const descriptor = await service.buildKeyframeGenerationSubmission({
      projectId,
      userId,
      shotId,
      slot: 'start',
      operationKey: 'generate-3',
      count: 1,
      options: {},
      referenceMediaIds: [],
    })
    await expect(service.assertKeyframeSubmissionCurrent(descriptor.payload.inputSnapshot)).resolves.toBeUndefined()
  })

  it('skips asset references when the shot has none selected', async () => {
    db.remakeShot.findFirst.mockResolvedValue({
      id: shotId,
      remakeProjectId: '22222222-2222-4222-8222-222222222222',
      stableKey: 'shot-1',
      currentRevision: 1,
      sceneAssetId: null,
      characterAssetIds: null,
      propAssetIds: null,
      remakeProject: { currentSource: { sourceRevision: 1 } },
      revisions: [{ id: revisionId, revision: 1, sourceRevision: 1, lifecycleState: 'active' }],
    })
    const { buildKeyframeGenerationSubmission } = await import('@/lib/remake-projects/keyframes/service')
    const descriptor = await buildKeyframeGenerationSubmission({
      projectId,
      userId,
      shotId,
      slot: 'start',
      operationKey: 'generate-4',
      count: 1,
      options: {},
      referenceMediaIds: [],
    })

    expect(descriptor.payload.inputSnapshot.referenceMediaIds).toEqual([])
    expect(descriptor.payload.inputSnapshot.promptText).toBe('A rainy street at dusk.')
    expect(db.novelPromotionProject.findUnique).not.toHaveBeenCalled()
  })
})
