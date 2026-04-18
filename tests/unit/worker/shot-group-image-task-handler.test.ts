import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShotGroupCompositePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionShotGroup: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
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

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-group-image-1',
      type: TASK_TYPE.IMAGE_SHOT_GROUP,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionShotGroup',
      targetId: 'group-1',
      payload: {},
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

  it('builds composite prompt from template and group prompt', () => {
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
    expect(prompt).toContain('同一空间内完成建立到收束')
    expect(prompt).toContain('4 宫格')
    expect(prompt).toContain('建立镜头')
    expect(prompt).toContain('画布比例：1:1')
  })

  it('omits api-level aspectRatio for Nano Banana 2 when reference image exists', async () => {
    await handleShotGroupImageTask(buildJob())

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'google::gemini-3.1-flash-image-preview',
        prompt: expect.stringContaining('画布比例：1:1'),
        options: {
          referenceImages: ['normalized:https://signed.example/cos/ref-shot-group.png'],
        },
      }),
    )
    expect(prismaMock.novelPromotionShotGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        compositeImageUrl: 'cos/shot-group-composite.png',
      },
    })
  })

  it('keeps api-level aspectRatio for other storyboard models', async () => {
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
