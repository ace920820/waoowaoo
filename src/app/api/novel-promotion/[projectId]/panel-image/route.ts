import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey, resolveMediaRef } from '@/lib/media/service'

interface PanelHistoryEntry {
  url: string
  timestamp: string
}

function parsePanelHistory(jsonValue: string | null): PanelHistoryEntry[] {
  if (!jsonValue) return []
  try {
    const parsed = JSON.parse(jsonValue)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is PanelHistoryEntry => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as { url?: unknown; timestamp?: unknown }
      return typeof candidate.url === 'string' && typeof candidate.timestamp === 'string'
    })
  } catch {
    return []
  }
}

function appendHistoryEntry(history: PanelHistoryEntry[], currentUrl: string | null, nextUrl: string | null) {
  if (!currentUrl || currentUrl === nextUrl) return history
  return [
    ...history,
    { url: currentUrl, timestamp: new Date().toISOString() },
  ]
}

function inferFileExtension(file: File): string {
  const fromName = path.extname(file.name || '').replace(/^\./, '').toLowerCase()
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName

  switch (file.type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'png'
  }
}

async function findProjectPanel(projectId: string, panelId: string) {
  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: {
      id: true,
      storyboardId: true,
      panelIndex: true,
      imageUrl: true,
      imageMediaId: true,
      previousImageUrl: true,
      previousImageMediaId: true,
      imageHistory: true,
      storyboard: {
        select: {
          episode: {
            select: {
              novelPromotionProject: {
                select: {
                  projectId: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!panel || panel.storyboard.episode.novelPromotionProject.projectId !== projectId) {
    throw new ApiError('NOT_FOUND')
  }

  return panel
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const panelId = formData.get('panelId')
  const file = formData.get('file')
  if (typeof panelId !== 'string' || !(file instanceof File) || !file.type.startsWith('image/')) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await findProjectPanel(projectId, panelId)
  const previousImageMedia = await resolveMediaRef(panel.imageMediaId, panel.imageUrl)
  const uploadBuffer = Buffer.from(await file.arrayBuffer())
  const storageKey = await uploadObject(
    uploadBuffer,
    generateUniqueKey(`storyboard-panel-${panelId}-upload`, inferFileExtension(file)),
    3,
    file.type || undefined,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      imageUrl: storageKey,
      imageMediaId: media.id,
      previousImageUrl: panel.imageUrl,
      previousImageMediaId: panel.imageMediaId,
      candidateImages: null,
      imageHistory: JSON.stringify(appendHistoryEntry(parsePanelHistory(panel.imageHistory), panel.imageUrl, storageKey)),
    },
  })

  return NextResponse.json({
    success: true,
    panel: {
      id: panel.id,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      imageUrl: media.url,
      media,
      previousImageUrl: previousImageMedia?.url || null,
      previousImageMedia,
    },
  })
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as { panelId?: unknown }
  const panelId = typeof body.panelId === 'string' ? body.panelId : ''
  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await findProjectPanel(projectId, panelId)
  if (!panel.previousImageUrl) {
    throw new ApiError('INVALID_PARAMS', { message: 'No previous storyboard image to restore' })
  }

  const currentImageMedia = await resolveMediaRef(panel.imageMediaId, panel.imageUrl)
  const previousImageMedia = await resolveMediaRef(panel.previousImageMediaId, panel.previousImageUrl)

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      imageUrl: panel.previousImageUrl,
      imageMediaId: panel.previousImageMediaId,
      previousImageUrl: panel.imageUrl,
      previousImageMediaId: panel.imageMediaId,
      candidateImages: null,
      imageHistory: JSON.stringify(appendHistoryEntry(parsePanelHistory(panel.imageHistory), panel.imageUrl, panel.previousImageUrl)),
    },
  })

  return NextResponse.json({
    success: true,
    panel: {
      id: panel.id,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      imageUrl: previousImageMedia?.url || null,
      media: previousImageMedia,
      previousImageUrl: currentImageMedia?.url || null,
      previousImageMedia: currentImageMedia,
    },
  })
})
