import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'

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

function buildDefaultItems(templateKey: string) {
  return Array.from({ length: getTemplateItemCount(templateKey) }, (_, index) => ({
    itemIndex: index,
    title: `镜头 ${index + 1}`,
  }))
}

async function listShotGroups(episodeId: string) {
  const shotGroups = await prisma.novelPromotionShotGroup.findMany({
    where: { episodeId },
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

  const shotGroups = await listShotGroups(episodeId)
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
  const groupPrompt = typeof body.groupPrompt === 'string' ? body.groupPrompt.trim() : null
  const templateKey = normalizeTemplateKey(body.templateKey ?? 'grid-4')

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { field: 'episodeId' })
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
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

  const shotGroup = await prisma.novelPromotionShotGroup.create({
    data: {
      episodeId,
      title,
      templateKey,
      groupPrompt,
      createdAt: newCreatedAt,
      items: {
        create: buildDefaultItems(templateKey),
      },
    },
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

  const current = await prisma.novelPromotionShotGroup.findUnique({
    where: { id: shotGroupId },
    include: { items: { orderBy: { itemIndex: 'asc' } } },
  })
  if (!current) {
    throw new ApiError('NOT_FOUND')
  }

  const nextTemplateKey = body.templateKey !== undefined
    ? normalizeTemplateKey(body.templateKey)
    : current.templateKey
  const nextItemCount = getTemplateItemCount(nextTemplateKey)

  await prisma.$transaction(async (tx) => {
    await tx.novelPromotionShotGroup.update({
      where: { id: shotGroupId },
      data: {
        title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
        templateKey: nextTemplateKey,
        groupPrompt: body.groupPrompt === undefined
          ? current.groupPrompt
          : (typeof body.groupPrompt === 'string' && body.groupPrompt.trim() ? body.groupPrompt.trim() : null),
      },
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

  const shotGroup = await prisma.novelPromotionShotGroup.findUnique({
    where: { id: shotGroupId },
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

  await prisma.novelPromotionShotGroup.delete({
    where: { id: shotGroupId },
  })

  return NextResponse.json({ success: true })
})
