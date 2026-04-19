import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { buildEpisodeInProjectWhere } from '@/lib/novel-promotion/ownership'
import { buildEpisodeMultiShotDrafts } from '@/lib/novel-promotion/multi-shot/episode-draft-builder'
import { buildShotGroupVideoConfigSnapshot } from '@/lib/shot-group/video-config-snapshot'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import type { NovelPromotionClip } from '@/types/project'

function buildDefaultItems(templateKey: string) {
  const template = getShotGroupTemplateSpec(templateKey)
  return Array.from({ length: template.slotCount }, (_, index) => ({
    itemIndex: index,
    title: template.slotTitles[index] || `镜头 ${index + 1}`,
  }))
}

function buildLegacySegmentIdentity(sourceClipId: string, segmentIndexWithinClip: number): string {
  return `${sourceClipId}:${segmentIndexWithinClip}`
}

type PersistedShotGroup = {
  id: string
  episodeId: string
  title: string
  templateKey: string
  groupPrompt: string | null
  videoPrompt: string | null
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
  videoModel: string | null
  videoReferencesJson: string | null
  compositeImageUrl: string | null
  videoUrl: string | null
  items: Array<{
    id?: string
    itemIndex: number
    title: string | null
    prompt: string | null
    imageUrl: string | null
    sourcePanelId: string | null
  }>
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId.trim() : ''
  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { field: 'episodeId' })
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: buildEpisodeInProjectWhere(projectId, episodeId),
    include: {
      clips: {
        orderBy: [
          { start: 'asc' },
          { createdAt: 'asc' },
        ],
      },
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

  const drafts = buildEpisodeMultiShotDrafts({
    episodeId: episode.id,
    clips: episode.clips.map((clip) => ({
      ...clip,
      start: clip.start ?? undefined,
      end: clip.end ?? undefined,
      duration: clip.duration ?? undefined,
      shotCount: clip.shotCount ?? undefined,
      screenplay: clip.screenplay ?? undefined,
      startText: clip.startText ?? undefined,
      endText: clip.endText ?? undefined,
      location: clip.location ?? undefined,
      characters: clip.characters ?? undefined,
      props: clip.props ?? undefined,
      storyboardMoodPresetId: clip.storyboardMoodPresetId ?? undefined,
      customMood: clip.customMood ?? undefined,
    })) as NovelPromotionClip[],
  })
  const existingBySegmentKey = new Map<string, PersistedShotGroup>()
  const existingByLegacySegmentIdentity = new Map<string, PersistedShotGroup>()

  for (const shotGroup of episode.shotGroups as PersistedShotGroup[]) {
    const draftMetadata = parseShotGroupDraftMetadata(shotGroup.videoReferencesJson)
    if (!draftMetadata) continue

    if (!existingBySegmentKey.has(draftMetadata.segmentKey)) {
      existingBySegmentKey.set(draftMetadata.segmentKey, shotGroup)
    }

    const legacySegmentIdentity = buildLegacySegmentIdentity(
      draftMetadata.sourceClipId,
      draftMetadata.segmentIndexWithinClip,
    )
    if (!existingByLegacySegmentIdentity.has(legacySegmentIdentity)) {
      existingByLegacySegmentIdentity.set(legacySegmentIdentity, shotGroup)
    }
  }

  let createdCount = 0
  let reusedCount = 0
  let placeholderCount = 0
  const shotGroups: PersistedShotGroup[] = []

  for (const draft of drafts) {
    if (draft.sourceStatus === 'placeholder') {
      placeholderCount += 1
    }

    const existing = existingBySegmentKey.get(draft.segmentKey)
      || existingByLegacySegmentIdentity.get(
        buildLegacySegmentIdentity(draft.sourceClipId, draft.segmentIndexWithinClip),
      )
    const videoReferencesJson = buildShotGroupVideoConfigSnapshot({
      generateAudio: false,
      includeDialogue: draft.includeDialogue,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: {},
      draftMetadata: {
        segmentOrder: draft.segmentOrder,
        clipId: draft.clipId,
        segmentKey: draft.segmentKey,
        sourceClipId: draft.sourceClipId,
        segmentIndexWithinClip: draft.segmentIndexWithinClip,
        segmentStartSeconds: draft.segmentStartSeconds,
        segmentEndSeconds: draft.segmentEndSeconds,
        sceneLabel: draft.sceneLabel,
        narrativePrompt: draft.narrativePrompt,
        embeddedDialogue: draft.embeddedDialogue,
        shotRhythmGuidance: draft.shotRhythmGuidance,
        expectedShotCount: draft.expectedShotCount,
        sourceStatus: draft.sourceStatus,
        placeholderReason: draft.placeholderReason,
      },
    })

    if (existing?.compositeImageUrl || existing?.videoUrl) {
      const reused = existing.videoReferencesJson === videoReferencesJson
        ? existing
        : await prisma.novelPromotionShotGroup.update({
          where: { id: existing.id },
          data: {
            videoReferencesJson,
          },
          include: {
            items: { orderBy: { itemIndex: 'asc' } },
          },
        }) as PersistedShotGroup
      reusedCount += 1
      shotGroups.push(reused)
      continue
    }

    if (existing) {
      const updated = await prisma.novelPromotionShotGroup.update({
        where: { id: existing.id },
        data: {
          title: draft.title,
          templateKey: draft.templateKey,
          groupPrompt: draft.groupPrompt,
          videoPrompt: draft.videoPrompt,
          includeDialogue: draft.includeDialogue,
          dialogueLanguage: 'zh',
          generateAudio: false,
          bgmEnabled: false,
          omniReferenceEnabled: false,
          smartMultiFrameEnabled: true,
          videoReferencesJson,
          items: {
            deleteMany: {},
            create: buildDefaultItems(draft.templateKey),
          },
        },
        include: {
          items: { orderBy: { itemIndex: 'asc' } },
        },
      })
      shotGroups.push(updated as PersistedShotGroup)
      continue
    }

    createdCount += 1
    const created = await prisma.novelPromotionShotGroup.create({
      data: {
        episodeId: episode.id,
        title: draft.title,
        templateKey: draft.templateKey,
        groupPrompt: draft.groupPrompt,
        videoPrompt: draft.videoPrompt,
        generateAudio: false,
        bgmEnabled: false,
        includeDialogue: draft.includeDialogue,
        dialogueLanguage: 'zh',
        omniReferenceEnabled: false,
        smartMultiFrameEnabled: true,
        videoReferencesJson,
        items: {
          create: buildDefaultItems(draft.templateKey),
        },
      },
      include: {
        items: { orderBy: { itemIndex: 'asc' } },
      },
    })
    shotGroups.push(created as PersistedShotGroup)
  }

  const withMedia = await attachMediaFieldsToProject({ shotGroups })
  const hydratedShotGroups = withMedia.shotGroups || shotGroups
  const totalSegments = drafts.length
  return NextResponse.json({
    shotGroups: hydratedShotGroups,
    summary: { totalSegments, createdCount, reusedCount, placeholderCount },
  })
})
