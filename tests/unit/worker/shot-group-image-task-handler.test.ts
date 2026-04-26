import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { buildShotGroupCompositePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionShotGroup: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionCharacter: {
    findMany: vi.fn(async () => []),
  },
  novelPromotionLocation: {
    findMany: vi.fn(async () => []),
  },
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ storyboardModel: 'google::gemini-3.1-flash-image-preview', artStyle: 'shaw-brothers' })),
  resolveImageSourceFromGeneration: vi.fn(async () => 'generated-shot-group-source'),
  toSignedUrlIfCos: vi.fn((url: string | null | undefined) => (url ? `https://signed.example/${url}` : null)),
  uploadImageSourceToCos: vi.fn(async () => 'cos/shot-group-composite.png'),
}))

const sharedMock = vi.hoisted(() => ({
  resolveNovelData: vi.fn(async () => ({ videoRatio: '16:9' })),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async (refs: string[]) => refs.map((item) => `normalized:${item}`)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', () => ({
  resolveNovelData: sharedMock.resolveNovelData,
}))

import { handleShotGroupImageTask } from '@/lib/workers/handlers/shot-group-image-task-handler'

function buildJob(payload: Record<string, unknown> = {}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-group-image-1',
      type: TASK_TYPE.IMAGE_SHOT_GROUP,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionShotGroup',
      targetId: 'group-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function buildShotGroupRecord() {
  return {
    id: 'group-1',
    episodeId: 'episode-1',
    title: '动作推进',
    templateKey: 'grid-4',
    groupPrompt: '同一空间内完成建立到收束',
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: 'clip-1:1',
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 0,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '站台',
        narrativePrompt: '旧提示词',
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        expectedShotCount: 4,
        sourceStatus: 'ready',
        placeholderReason: null,
        storyboardModeId: 'classic-nine-grid',
        storyboardModeLabel: '经典九宫格',
        storyboardModePromptText: '固定九宫格构图模板',
        compositePromptText: '同一空间内完成建立到收束',
      },
    }),
    referenceImageUrl: 'cos/ref-shot-group.png',
    compositeImageUrl: null,
    dialogueLanguage: 'zh' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      { id: 'item-1', shotGroupId: 'group-1', itemIndex: 0, title: '建立镜头' },
      { id: 'item-2', shotGroupId: 'group-1', itemIndex: 1, title: '关系镜头' },
    ],
  }
}

describe('shot-group-image-task-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionShotGroup.findFirst.mockResolvedValue(buildShotGroupRecord())
  })

  it('builds composite prompt from storyboard mode and story content', () => {
    const template = getShotGroupTemplateSpec('grid-4')
    const prompt = buildShotGroupCompositePrompt({
      group: {
        ...buildShotGroupRecord(),
        referenceImageUrl: null,
      },
      template,
      artStyle: '电影感分镜风格',
      locale: 'zh',
      canvasAspectRatio: '1:1',
    })

    expect(prompt).toContain('动作推进')
    expect(prompt).toContain('分镜模式提示词：固定九宫格构图模板')
    expect(prompt).toContain('剧情内容：同一空间内完成建立到收束')
    expect(prompt).toContain('4 宫格')
    expect(prompt).toContain('建立镜头')
    expect(prompt).toContain('画布比例：1:1')
  })

  it('passes composite aspectRatio through to the shared generator layer', async () => {
    await handleShotGroupImageTask(buildJob())

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'google::gemini-3.1-flash-image-preview',
        prompt: expect.stringContaining('画布比例：1:1'),
        options: {
          referenceImages: ['normalized:https://signed.example/cos/ref-shot-group.png'],
          aspectRatio: '1:1',
        },
      }),
    )
    expect(prismaMock.novelPromotionShotGroup.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        compositeImageUrl: 'cos/shot-group-composite.png',
      }),
    }))
  })


  it('hydrates selected asset imageUrls before reference generation', async () => {
    prismaMock.novelPromotionShotGroup.findFirst.mockResolvedValue({
      ...buildShotGroupRecord(),
      videoReferencesJson: JSON.stringify({
        draftMetadata: {
          segmentOrder: 1,
          clipId: 'clip-1',
          segmentKey: 'clip-1:1',
          sourceClipId: 'clip-1',
          segmentIndexWithinClip: 0,
          segmentStartSeconds: 0,
          segmentEndSeconds: 15,
          sceneLabel: '空房间',
          narrativePrompt: '李未在空房间发现旧钥匙。',
          embeddedDialogue: null,
          shotRhythmGuidance: null,
          expectedShotCount: 4,
          sourceStatus: 'ready',
          placeholderReason: null,
          selectedLocationAsset: {
            assetType: 'location',
            source: 'manual',
            assetId: 'location-empty-room',
            label: '空房间',
            imageUrl: null,
          },
          effectiveLocationAsset: {
            assetType: 'location',
            source: 'manual',
            assetId: 'location-empty-room',
            label: '空房间',
            imageUrl: null,
          },
          selectedCharacterAssets: [{
            assetType: 'character',
            source: 'manual',
            assetId: 'character-liwei',
            label: '李未',
            imageUrl: null,
          }],
          effectiveCharacterAssets: [{
            assetType: 'character',
            source: 'manual',
            assetId: 'character-liwei',
            label: '李未',
            imageUrl: null,
          }],
          selectedPropAssets: [{
            assetType: 'prop',
            source: 'manual',
            assetId: 'prop-old-key',
            label: '旧钥匙',
            imageUrl: null,
          }],
          effectivePropAssets: [{
            assetType: 'prop',
            source: 'manual',
            assetId: 'prop-old-key',
            label: '旧钥匙',
            imageUrl: null,
          }],
        },
      }),
    })
    ;(prismaMock.novelPromotionCharacter.findMany as Mock).mockResolvedValueOnce([{
      id: 'character-liwei',
      appearances: [{ id: 'appearance-liwei', imageUrl: 'cos/liwei-character.png', imageUrls: null, selectedIndex: null }],
    }])
    ;(prismaMock.novelPromotionLocation.findMany as Mock)
      .mockResolvedValueOnce([{
        id: 'location-empty-room',
        selectedImage: { id: 'location-image-empty-room', imageUrl: 'cos/empty-room.png' },
        images: [],
      }])
      .mockResolvedValueOnce([{
        id: 'prop-old-key',
        selectedImage: null,
        images: [{ id: 'prop-image-old-key', imageUrl: 'cos/old-key.png', isSelected: true }],
      }])

    await handleShotGroupImageTask(buildJob({ targetField: 'reference' }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: {
          referenceImages: [
            'normalized:https://signed.example/cos/empty-room.png',
            'normalized:https://signed.example/cos/liwei-character.png',
            'normalized:https://signed.example/cos/old-key.png',
          ],
          aspectRatio: '4:3',
        },
      }),
    )
    const updateArg = (prismaMock.novelPromotionShotGroup.update as Mock).mock.calls[0]?.[0] as { data: { videoReferencesJson?: string } }
    expect(updateArg.data.videoReferencesJson).toContain('cos/liwei-character.png')
  })

  it('keeps the same options shape for other storyboard models', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({
      storyboardModel: 'google::gemini-2.5-flash-image-preview',
      artStyle: 'shaw-brothers',
    })

    await handleShotGroupImageTask(buildJob())

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'google::gemini-2.5-flash-image-preview',
        options: {
          referenceImages: ['normalized:https://signed.example/cos/ref-shot-group.png'],
          aspectRatio: '1:1',
        },
      }),
    )
  })
})
