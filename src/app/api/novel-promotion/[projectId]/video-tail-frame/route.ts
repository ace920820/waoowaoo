import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { buildPanelInProjectWhere, buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

function inferFileExtension(file: File): string {
  const fromName = path.extname(file.name || '').replace(/^\./, '').toLowerCase()
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName

  switch (file.type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'png'
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const sourceType = formData.get('sourceType')
  const sourceId = formData.get('sourceId')
  const file = formData.get('file')

  if (
    (sourceType !== 'panel' && sourceType !== 'shot-group')
    || typeof sourceId !== 'string'
    || !(file instanceof File)
    || !file.type.startsWith('image/')
  ) {
    throw new ApiError('INVALID_PARAMS')
  }

  const uploadBuffer = Buffer.from(await file.arrayBuffer())
  const storageKey = await uploadObject(
    uploadBuffer,
    generateUniqueKey(`${sourceType}-${sourceId}-tail-frame`, inferFileExtension(file)),
    3,
    file.type || undefined,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  })

  if (sourceType === 'panel') {
    const panel = await prisma.novelPromotionPanel.findFirst({
      where: buildPanelInProjectWhere(projectId, sourceId),
      select: { id: true },
    })
    if (!panel) throw new ApiError('NOT_FOUND')

    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        savedTailFrameUrl: storageKey,
        savedTailFrameMediaId: media.id,
      } as Record<string, unknown>,
    })
  } else {
    const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
      where: buildShotGroupInProjectWhere(projectId, sourceId),
      select: { id: true },
    })
    if (!shotGroup) throw new ApiError('NOT_FOUND')

    await prisma.novelPromotionShotGroup.update({
      where: { id: shotGroup.id },
      data: {
        savedTailFrameUrl: storageKey,
        savedTailFrameMediaId: media.id,
      } as Record<string, unknown>,
    })
  }

  return NextResponse.json({
    success: true,
    sourceType,
    sourceId,
    imageUrl: media.url,
    media,
  })
})
