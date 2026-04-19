import { prisma } from '@/lib/prisma'
import type { EpisodeMultiShotDraft } from '@/lib/novel-promotion/multi-shot/episode-draft-builder'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import { parseShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import { buildShotGroupVideoConfigSnapshot } from '@/lib/shot-group/video-config-snapshot'

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
    itemIndex: number
    title: string | null
  }>
}

export async function persistEpisodeMultiShotDrafts(params: {
  episodeId: string
  drafts: EpisodeMultiShotDraft[]
}) {
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: params.episodeId },
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
    throw new Error('Episode not found for multi-shot draft persistence')
  }

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

  for (const draft of params.drafts) {
    if (draft.sourceStatus === 'placeholder') {
      placeholderCount += 1
    }

    const existing = existingBySegmentKey.get(draft.segmentKey)
      || existingByLegacySegmentIdentity.get(
        buildLegacySegmentIdentity(draft.sourceClipId, draft.segmentIndexWithinClip),
      )
    const previousDraftMetadata = existing
      ? parseShotGroupDraftMetadata(existing.videoReferencesJson)
      : null

    const videoReferencesJson = buildShotGroupVideoConfigSnapshot({
      generateAudio: false,
      includeDialogue: draft.includeDialogue,
      dialogueLanguage: 'zh',
      omniReferenceEnabled: false,
      smartMultiFrameEnabled: true,
      generationOptions: {},
      previousDraftMetadata,
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
        selectedLocationAsset: previousDraftMetadata?.selectedLocationAsset ?? null,
        preselectedLocationAsset: previousDraftMetadata?.preselectedLocationAsset ?? null,
        selectedCharacterAssets: previousDraftMetadata?.selectedCharacterAssets ?? [],
        preselectedCharacterAssets: previousDraftMetadata?.preselectedCharacterAssets ?? [],
        selectedPropAssets: previousDraftMetadata?.selectedPropAssets ?? [],
        preselectedPropAssets: previousDraftMetadata?.preselectedPropAssets ?? [],
        scriptDerivedLocationAsset: previousDraftMetadata?.scriptDerivedLocationAsset ?? {
          assetType: 'location',
          source: 'scriptDerived',
          assetId: null,
          label: draft.sceneLabel,
        },
        scriptDerivedCharacterAssets: previousDraftMetadata?.scriptDerivedCharacterAssets ?? [],
        scriptDerivedPropAssets: previousDraftMetadata?.scriptDerivedPropAssets ?? [],
        storyboardMoodPresetId: previousDraftMetadata?.storyboardMoodPresetId ?? null,
        customMood: previousDraftMetadata?.customMood ?? null,
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
        episodeId: params.episodeId,
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

  return {
    shotGroups,
    summary: {
      totalSegments: params.drafts.length,
      createdCount,
      reusedCount,
      placeholderCount,
    },
  }
}
