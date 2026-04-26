import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildEpisodeInProjectWhere } from '@/lib/novel-promotion/ownership'
import {
  buildStoryboardPackageImportPreview,
  commitStoryboardPackageImport,
  type StoryboardPackageCommitTx,
  type StoryboardPackageImportMode,
  type StoryboardPackageOverwriteStrategy,
} from '@/lib/novel-promotion/storyboard-package/import-service'

type RouteParams = { projectId: string; episodeId: string }

function readMode(value: unknown): StoryboardPackageImportMode {
  if (value === 'preview' || value === 'commit') return value
  throw new ApiError('INVALID_PARAMS', { field: 'mode', message: 'mode must be preview or commit.' })
}

function readOverwriteStrategy(value: unknown): StoryboardPackageOverwriteStrategy {
  if (value === undefined || value === null || value === 'replace-imported') return 'replace-imported'
  throw new ApiError('INVALID_PARAMS', { field: 'overwriteStrategy', message: 'Only replace-imported is supported.' })
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<RouteParams> },
) => {
  const { projectId, episodeId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const mode = readMode(body.mode)
  const content = typeof body.content === 'string' ? body.content : ''
  if (!content.trim()) {
    throw new ApiError('INVALID_PARAMS', { field: 'content', message: 'Storyboard package content is required.' })
  }
  const overwriteStrategy = readOverwriteStrategy(body.overwriteStrategy)
  const preserveGeneratedMedia = body.preserveGeneratedMedia !== false

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: buildEpisodeInProjectWhere(projectId, episodeId),
    include: {
      shotGroups: {
        include: {
          items: { orderBy: { itemIndex: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const projectAssets = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: {
        include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
      locations: {
        include: { images: { orderBy: { imageIndex: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  const options = {
    mode,
    content,
    filename: typeof body.filename === 'string' ? body.filename : null,
    contentType: typeof body.contentType === 'string' ? body.contentType : null,
    overwriteStrategy,
    preserveGeneratedMedia,
  }
  const serviceInput = {
    options,
    episode: {
      id: episode.id,
      shotGroups: episode.shotGroups,
    },
    projectAssets: {
      characters: projectAssets?.characters || [],
      locations: (projectAssets?.locations || []).filter((asset) => asset.assetKind !== 'prop'),
      props: (projectAssets?.locations || []).filter((asset) => asset.assetKind === 'prop'),
    },
  }

  if (mode === 'preview') {
    const preview = buildStoryboardPackageImportPreview(serviceInput)
    return NextResponse.json(preview)
  }

  const result = await prisma.$transaction(async (tx) => commitStoryboardPackageImport({
    ...serviceInput,
    tx: tx as unknown as StoryboardPackageCommitTx,
  }))
  return NextResponse.json(result)
})
