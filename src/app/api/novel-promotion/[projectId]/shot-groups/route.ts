import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { buildEpisodeInProjectWhere, buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'

const TEMPLATE_ITEM_COUNT: Record<string, number> = {
  'grid-4': 4,
  'grid-6': 6,
  'grid-9': 9,
}

function normalizeTemplateKey(value: unknown): string {
  const templateKey = typeof value === 'string' ? value.trim() : ''
  if (!templateKey || !TEMPLATE_ITEM_COUNT[templateKey]) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_SHOT_GROUP_TEMPLATE_KEY',
      field: 'templateKey',
    })
  }
  return templateKey
}

function getTemplateItemCount(templateKey: string) {
  return TEMPLATE_ITEM_COUNT[templateKey] ?? TEMPLATE_ITEM_COUNT['grid-4']
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeDialogueLanguage(value: unknown): 'zh' | 'en' | 'ja' | undefined {
  return value === 'zh' || value === 'en' || value === 'ja' ? value : undefined
}

function buildDefaultItems(templateKey: string) {
  return Array.from({ length: getTemplateItemCount(templateKey) }, (_, index) => ({
    itemIndex: index,
    title: `镜头 ${index + 1}`,
  }))
}

type ShotGroupAdvancedFields = {
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
}
type ShotGroupItemFields = {
  items: Array<{
    itemIndex: number
    title: string | null
    prompt: string | null
    imageUrl: string | null
    sourcePanelId: string | null
  }>
}

async function listShotGroups(projectId: string, episodeId: string) {
  const shotGroups = await prisma.novelPromotionShotGroup.findMany({
    where: {
      episodeId,
      episode: {
        novelPromotionProject: {
          projectId,
        },
      },
    },
    include: {
      items: { orderBy: { itemIndex: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const withMedia = await attachMediaFieldsToProject({ shotGroups })
  return withMedia.shotGroups || shotGroups
}

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')
  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: buildEpisodeInProjectWhere(projectId, episodeId),
    select: { id: true },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const shotGroups = await listShotGroups(projectId, episodeId)
  return NextResponse.json({ shotGroups })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '未命名镜头组'
  const groupPrompt = normalizeOptionalString(body.groupPrompt)
  const videoPrompt = normalizeOptionalString(body.videoPrompt)
  const referenceImageUrl = normalizeOptionalString(body.referenceImageUrl)
  const dialogueLanguage = normalizeDialogueLanguage(body.dialogueLanguage) || 'zh'
  const templateKey = normalizeTemplateKey(body.templateKey ?? 'grid-4')

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { field: 'episodeId' })
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: buildEpisodeInProjectWhere(projectId, episodeId),
    include: {
      shotGroups: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const insertAtRaw = typeof body.insertIndex === 'number' ? body.insertIndex : episode.shotGroups.length
  const insertAt = Math.max(0, Math.min(insertAtRaw, episode.shotGroups.length))

  let newCreatedAt: Date
  if (episode.shotGroups.length === 0) {
    newCreatedAt = new Date()
  } else if (insertAt === 0) {
    newCreatedAt = new Date(episode.shotGroups[0].createdAt.getTime() - 1000)
  } else if (insertAt >= episode.shotGroups.length) {
    newCreatedAt = new Date(episode.shotGroups[episode.shotGroups.length - 1].createdAt.getTime() + 1000)
  } else {
    const previous = episode.shotGroups[insertAt - 1]
    const next = episode.shotGroups[insertAt]
    newCreatedAt = new Date((previous.createdAt.getTime() + next.createdAt.getTime()) / 2)
  }

  const createData = {
      episodeId,
      title,
      templateKey,
      groupPrompt,
      videoPrompt,
      referenceImageUrl,
      generateAudio: normalizeOptionalBoolean(body.generateAudio) ?? false,
      bgmEnabled: normalizeOptionalBoolean(body.bgmEnabled) ?? false,
      includeDialogue: normalizeOptionalBoolean(body.includeDialogue) ?? false,
      dialogueLanguage,
      omniReferenceEnabled: normalizeOptionalBoolean(body.omniReferenceEnabled) ?? false,
      smartMultiFrameEnabled: normalizeOptionalBoolean(body.smartMultiFrameEnabled) ?? false,
      createdAt: newCreatedAt,
      items: {
        create: buildDefaultItems(templateKey),
      },
    } as unknown as Prisma.NovelPromotionShotGroupUncheckedCreateInput

  const shotGroup = await prisma.novelPromotionShotGroup.create({
    data: createData,
    include: {
      items: { orderBy: { itemIndex: 'asc' } },
    },
  })

  const withMedia = await attachMediaFieldsToProject({ shotGroups: [shotGroup] })
  return NextResponse.json({ shotGroup: withMedia.shotGroups?.[0] || shotGroup })
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const shotGroupId = typeof body.shotGroupId === 'string' ? body.shotGroupId : ''
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const current = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    include: { items: { orderBy: { itemIndex: 'asc' } } },
  }) as (Awaited<ReturnType<typeof prisma.novelPromotionShotGroup.findFirst>> & ShotGroupAdvancedFields & ShotGroupItemFields) | null
  if (!current) {
    throw new ApiError('NOT_FOUND')
  }

  const nextTemplateKey = body.templateKey !== undefined
    ? normalizeTemplateKey(body.templateKey)
    : current.templateKey
  const nextItemCount = getTemplateItemCount(nextTemplateKey)

  await prisma.$transaction(async (tx) => {
    const updateData = {
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
      templateKey: nextTemplateKey,
      groupPrompt: body.groupPrompt === undefined
        ? current.groupPrompt
        : normalizeOptionalString(body.groupPrompt),
      videoPrompt: body.videoPrompt === undefined
        ? current.videoPrompt
        : normalizeOptionalString(body.videoPrompt),
      referenceImageUrl: body.referenceImageUrl === undefined
        ? current.referenceImageUrl
        : normalizeOptionalString(body.referenceImageUrl),
      compositeImageUrl: body.compositeImageUrl === undefined
        ? current.compositeImageUrl
        : normalizeOptionalString(body.compositeImageUrl),
      generateAudio: body.generateAudio === undefined
        ? current.generateAudio
        : (normalizeOptionalBoolean(body.generateAudio) ?? current.generateAudio),
      bgmEnabled: body.bgmEnabled === undefined
        ? current.bgmEnabled
        : (normalizeOptionalBoolean(body.bgmEnabled) ?? current.bgmEnabled),
      includeDialogue: body.includeDialogue === undefined
        ? current.includeDialogue
        : (normalizeOptionalBoolean(body.includeDialogue) ?? current.includeDialogue),
      dialogueLanguage: body.dialogueLanguage === undefined
        ? current.dialogueLanguage
        : (normalizeDialogueLanguage(body.dialogueLanguage) ?? current.dialogueLanguage),
      omniReferenceEnabled: body.omniReferenceEnabled === undefined
        ? current.omniReferenceEnabled
        : (normalizeOptionalBoolean(body.omniReferenceEnabled) ?? current.omniReferenceEnabled),
      smartMultiFrameEnabled: body.smartMultiFrameEnabled === undefined
        ? current.smartMultiFrameEnabled
        : (normalizeOptionalBoolean(body.smartMultiFrameEnabled) ?? current.smartMultiFrameEnabled),
      videoModel: body.videoModel === undefined
        ? current.videoModel
        : normalizeOptionalString(body.videoModel),
    } as unknown as Prisma.NovelPromotionShotGroupUncheckedUpdateInput

    await tx.novelPromotionShotGroup.update({
      where: { id: shotGroupId },
      data: updateData,
    })

    if (current.items.length > nextItemCount) {
      await tx.novelPromotionShotGroupItem.deleteMany({
        where: {
          shotGroupId,
          itemIndex: { gte: nextItemCount },
        },
      })
    }

    if (current.items.length < nextItemCount) {
      await tx.novelPromotionShotGroupItem.createMany({
        data: Array.from({ length: nextItemCount - current.items.length }, (_, offset) => ({
          shotGroupId,
          itemIndex: current.items.length + offset,
          title: `镜头 ${current.items.length + offset + 1}`,
        })),
      })
    }
  })

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    include: {
      items: { orderBy: { itemIndex: 'asc' } },
    },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }

  const withMedia = await attachMediaFieldsToProject({ shotGroups: [shotGroup] })
  return NextResponse.json({ shotGroup: withMedia.shotGroups?.[0] || shotGroup })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const shotGroupId = searchParams.get('shotGroupId')
  if (!shotGroupId) {
    throw new ApiError('INVALID_PARAMS', { field: 'shotGroupId' })
  }

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(projectId, shotGroupId),
    select: { id: true },
  })
  if (!shotGroup) {
    throw new ApiError('NOT_FOUND')
  }

  await prisma.novelPromotionShotGroup.delete({ where: { id: shotGroup.id } })

  return NextResponse.json({ success: true })
})
