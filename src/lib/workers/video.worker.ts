import { Worker, type Job } from 'bullmq'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildShotGroupInProjectWhere } from '@/lib/novel-promotion/ownership'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { getUserWorkflowConcurrencyConfig } from '@/lib/config-service'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { withUserConcurrencyGate } from './user-concurrency-gate'
import {
  assertTaskActive,
  getProjectModels,
  resolveLipSyncVideoSource,
  resolveVideoSourceFromGeneration,
  toSignedUrlIfCos,
  uploadVideoSourceToCos,
} from './utils'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { getProviderConfig } from '@/lib/api-config'
import {
  buildPanelVideoGenerationPrompt,
  derivePanelSpeechPlan,
  resolveEffectivePanelDialogueText,
} from '@/lib/novel-promotion/panel-speech-plan'
import { buildShotGroupVideoPrompt } from '@/lib/shot-group/prompt'
import { parseShotGroupDraftMetadata, type ShotGroupAssetBindingReference } from '@/lib/shot-group/draft-metadata'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import {
  deriveShotGroupModeFlags,
  resolveShotGroupModeForModel,
  resolveShotGroupReferenceMode,
  supportsShotGroupMultiReferenceModes,
  normalizeShotGroupVideoReferenceSettings,
  type ShotGroupVideoReferenceSettings,
} from '@/lib/shot-group/video-config'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type ShotGroupAdvancedFields = {
  generateAudio: boolean
  bgmEnabled: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
}
type ShotGroupDialogueLanguage = 'zh' | 'en' | 'ja'
type ArkReferenceContentItem =
  | { type: 'image_url'; image_url: { url: string }; role?: 'reference_image' }
  | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' }

type ShotGroupVideoReferencePlanItem = {
  token: string
  type: 'image' | 'audio' | 'video'
  sourceType: string
  label: string
  url: string
  usage: string
}

type ShotGroupArkContentPlan = {
  contentItems: ArkReferenceContentItem[]
  promptSuffix: string
  references: ShotGroupVideoReferencePlanItem[]
}

function parseShotGroupVideoConfig(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function readFirstImageUrlFromImageUrls(raw: string | null | undefined, selectedIndex?: number | null): string | null {
  if (!raw) return null
  try {
    const imageUrls = decodeImageUrlsFromDb(raw, 'characterAppearance.imageUrls')
    if (imageUrls.length === 0) return null
    const preferredIndex = typeof selectedIndex === 'number' && selectedIndex >= 0 ? selectedIndex : 0
    return imageUrls[preferredIndex] || imageUrls[0] || null
  } catch {
    return null
  }
}

function collectAssetIds(assets: Array<ShotGroupAssetBindingReference | null | undefined>): string[] {
  return [...new Set(assets
    .map((asset) => asset?.assetId || null)
    .filter((assetId): assetId is string => Boolean(assetId)))]
}

function selectedAssetIdsOrAll(selectedIds: string[], fallbackAssets: ShotGroupAssetBindingReference[]) {
  return selectedIds.length > 0 ? selectedIds : collectAssetIds(fallbackAssets)
}

function resolveReferenceSettings(shotGroup: ShotGroupRecord): ShotGroupVideoReferenceSettings {
  return normalizeShotGroupVideoReferenceSettings(parseShotGroupVideoConfig(shotGroup.videoReferencesJson).videoReferenceSettings)
}

async function resolveShotGroupAssetReferenceMaps(projectId: string, shotGroup: ShotGroupRecord) {
  const draftMetadata = parseShotGroupDraftMetadata(shotGroup.videoReferencesJson)
  const settings = resolveReferenceSettings(shotGroup)
  const characterAssets = draftMetadata?.effectiveCharacterAssets ?? []
  const propAssets = draftMetadata?.effectivePropAssets ?? []
  const locationAsset = draftMetadata?.effectiveLocationAsset ?? null
  const characterIds = collectAssetIds(characterAssets)
  const audioCharacterIds = selectedAssetIdsOrAll(settings.selectedAudioCharacterAssetIds, characterAssets)
  const locationIds = collectAssetIds([locationAsset])
  const propIds = collectAssetIds(propAssets)

  const [characters, locations, props] = await Promise.all([
    characterIds.length > 0 || audioCharacterIds.length > 0
      ? prisma.novelPromotionCharacter.findMany({
        where: { id: { in: [...new Set([...characterIds, ...audioCharacterIds])] }, novelPromotionProjectId: projectId },
        include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
      })
      : [],
    locationIds.length > 0
      ? prisma.novelPromotionLocation.findMany({
        where: { id: { in: locationIds }, novelPromotionProjectId: projectId, assetKind: { not: 'prop' } },
        include: { selectedImage: true, images: { orderBy: { imageIndex: 'asc' } } },
      })
      : [],
    propIds.length > 0
      ? prisma.novelPromotionLocation.findMany({
        where: { id: { in: propIds }, novelPromotionProjectId: projectId, assetKind: 'prop' },
        include: { selectedImage: true, images: { orderBy: { imageIndex: 'asc' } } },
      })
      : [],
  ])

  const characterById = new Map(characters.map((character) => [character.id, character]))
  const characterImageById = new Map(characters.flatMap((character) => {
    const appearance = character.appearances[0]
    const imageUrl = appearance?.imageUrl || readFirstImageUrlFromImageUrls(appearance?.imageUrls, appearance?.selectedIndex) || null
    return imageUrl ? [[character.id, imageUrl]] : []
  }))
  const locationImageById = new Map(locations.flatMap((location) => {
    const selected = location.selectedImage || location.images.find((image) => image.isSelected) || location.images[0] || null
    return selected?.imageUrl ? [[location.id, selected.imageUrl]] : []
  }))
  const propImageById = new Map(props.flatMap((prop) => {
    const selected = prop.selectedImage || prop.images.find((image) => image.isSelected) || prop.images[0] || null
    return selected?.imageUrl ? [[prop.id, selected.imageUrl]] : []
  }))

  return {
    settings,
    draftMetadata,
    characterById,
    characterImageById,
    locationImageById,
    propImageById,
  }
}
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.novelPromotionPanel.findUnique>>>
type VideoPanelRecord = NonNullable<Awaited<ReturnType<typeof fetchPanelByStoryboardIndex>>>
type ShotGroupRecord = Prisma.NovelPromotionShotGroupGetPayload<{
  include: {
    items: true
  }
}> & ShotGroupAdvancedFields

function readPanelDialogueOverride(panel: VideoPanelRecord): string | null | undefined {
  return (panel as VideoPanelRecord & { dialogueOverride?: string | null }).dialogueOverride
}

function toDurationMs(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1000 ? Math.round(value) : Math.round(value * 1000)
}

function extractGenerationOptions(payload: AnyObj): VideoOptionMap {
  const fromEnvelope = payload.generationOptions
  if (!fromEnvelope || typeof fromEnvelope !== 'object' || Array.isArray(fromEnvelope)) {
    return {}
  }

  const next: VideoOptionMap = {}
  for (const [key, value] of Object.entries(fromEnvelope as Record<string, unknown>)) {
    if (key === 'aspectRatio') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value
    }
  }
  return next
}

async function fetchPanelByStoryboardIndex(storyboardId: string, panelIndex: number) {
  return await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex,
    },
    include: {
      storyboard: {
        select: {
          episode: {
            select: {
              clips: {
                select: {
                  id: true,
                  screenplay: true,
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          clip: {
            select: {
              id: true,
              screenplay: true,
            },
          },
        },
      },
      matchedVoiceLines: {
        select: {
          lineIndex: true,
          speaker: true,
          content: true,
          matchedPanelId: true,
          matchedStoryboardId: true,
          matchedPanelIndex: true,
        },
        orderBy: { lineIndex: 'asc' },
      },
    },
  })
}

async function getPanelForVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj

  // 优先使用 targetType=NovelPromotionPanel 直接定位
  if (job.data.targetType === 'NovelPromotionPanel') {
    const panel = await prisma.novelPromotionPanel.findUnique({
      where: { id: job.data.targetId },
      include: {
        storyboard: {
          select: {
            episode: {
              select: {
                clips: {
                  select: {
                    id: true,
                    screenplay: true,
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
            clip: {
              select: {
                id: true,
                screenplay: true,
              },
            },
          },
        },
        matchedVoiceLines: {
          select: {
            lineIndex: true,
            speaker: true,
            content: true,
            matchedPanelId: true,
            matchedStoryboardId: true,
            matchedPanelIndex: true,
          },
          orderBy: { lineIndex: 'asc' },
        },
      },
    })
    if (!panel) throw new Error('Panel not found')
    return panel
  }

  // 兜底：通过 storyboardId + panelIndex 定位
  const storyboardId = payload.storyboardId
  const panelIndex = payload.panelIndex
  if (typeof storyboardId !== 'string' || !storyboardId || panelIndex === undefined || panelIndex === null) {
    throw new Error('Missing storyboardId/panelIndex for video task')
  }

  const panel = await fetchPanelByStoryboardIndex(storyboardId, Number(panelIndex))
  if (!panel) throw new Error('Panel not found by storyboardId/panelIndex')
  return panel
}

async function generateVideoForPanel(
  job: Job<TaskJobData>,
  panel: VideoPanelRecord,
  payload: AnyObj,
  modelId: string,
  projectVideoRatio: string | null | undefined,
  generationOptions: VideoOptionMap,
): Promise<{ cosKey: string; generationMode: VideoGenerationMode; actualVideoTokens?: number }> {
  if (!panel.imageUrl) {
    throw new Error(`Panel ${panel.id} has no imageUrl`)
  }

  const firstLastFramePayload =
    typeof payload.firstLastFrame === 'object' && payload.firstLastFrame !== null
      ? (payload.firstLastFrame as AnyObj)
      : null
  const firstLastCustomPrompt = typeof firstLastFramePayload?.customPrompt === 'string' ? firstLastFramePayload.customPrompt : null
  const persistedFirstLastPrompt = firstLastFramePayload ? panel.firstLastFramePrompt : null
  const customPrompt = typeof payload.customPrompt === 'string' ? payload.customPrompt : null
  const basePrompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || panel.description
  if (!basePrompt) {
    throw new Error(`Panel ${panel.id} has no video prompt`)
  }

  const speechPlan = derivePanelSpeechPlan({
    panel: {
      id: panel.id,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      srtSegment: panel.srtSegment,
      dialogueOverride: readPanelDialogueOverride(panel),
    },
    clip: panel.storyboard?.clip || null,
    clips: panel.storyboard?.episode?.clips || [],
    voiceLines: panel.matchedVoiceLines,
  })
  const requestedGenerateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : undefined
  const effectiveGenerateAudio = requestedGenerateAudio ?? speechPlan.generatedAudioRequired
  const prompt = buildPanelVideoGenerationPrompt({
    basePrompt,
    panel: {
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      description: panel.description,
      duration: panel.duration,
      srtSegment: resolveEffectivePanelDialogueText(panel),
      dialogueOverride: readPanelDialogueOverride(panel),
    },
    speechPlan,
    generateAudio: effectiveGenerateAudio,
  })

  const sourceImageUrl = toSignedUrlIfCos(panel.imageUrl, 3600)
  if (!sourceImageUrl) {
    throw new Error(`Panel ${panel.id} image url invalid`)
  }
  const sourceImageBase64 = await normalizeToBase64ForGeneration(sourceImageUrl)

  let lastFrameImageBase64: string | undefined
  const generationMode: VideoGenerationMode = firstLastFramePayload ? 'firstlastframe' : 'normal'
  let model = modelId

  if (firstLastFramePayload) {
    model =
      typeof firstLastFramePayload.flModel === 'string' && firstLastFramePayload.flModel
        ? firstLastFramePayload.flModel
        : modelId
    const firstLastFrameCapabilities = resolveBuiltinCapabilitiesByModelKey('video', model)
    if (firstLastFrameCapabilities?.video?.firstlastframe !== true) {
      throw new Error(`VIDEO_FIRSTLASTFRAME_MODEL_UNSUPPORTED: ${model}`)
    }
    if (
      typeof firstLastFramePayload.lastFrameStoryboardId === 'string' &&
      firstLastFramePayload.lastFrameStoryboardId &&
      firstLastFramePayload.lastFramePanelIndex !== undefined
    ) {
      const lastPanel = await fetchPanelByStoryboardIndex(
        firstLastFramePayload.lastFrameStoryboardId,
        Number(firstLastFramePayload.lastFramePanelIndex),
      )
      if (lastPanel?.imageUrl) {
        const lastFrameUrl = toSignedUrlIfCos(lastPanel.imageUrl, 3600)
        if (lastFrameUrl) {
          lastFrameImageBase64 = await normalizeToBase64ForGeneration(lastFrameUrl)
        }
      }
    }
  }

  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: model,
    imageUrl: sourceImageBase64,
    options: {
      prompt,
      ...(projectVideoRatio ? { aspectRatio: projectVideoRatio } : {}),
      ...generationOptions,
      generationMode,
      generateAudio: effectiveGenerateAudio,
      ...(lastFrameImageBase64 ? { lastFrameImageUrl: lastFrameImageBase64 } : {}),
    },
  })

  let downloadHeaders: Record<string, string> | undefined
  const videoSource = generatedVideo.url
  if (generatedVideo.downloadHeaders) {
    downloadHeaders = generatedVideo.downloadHeaders
  } else if (typeof videoSource === 'string') {
    const parsedModel = parseModelKeyStrict(model)
    const isGoogleDownloadUrl = videoSource.includes('generativelanguage.googleapis.com/')
      && videoSource.includes('/files/')
      && videoSource.includes(':download')
    if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
      const { apiKey } = await getProviderConfig(job.data.userId, 'google')
      downloadHeaders = { 'x-goog-api-key': apiKey }
    }
  }

  const cosKey = await uploadVideoSourceToCos(videoSource, 'panel-video', panel.id, downloadHeaders)
  return {
    cosKey,
    generationMode,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}

function buildShotGroupReferenceSnapshot(input: {
  shotGroup: ShotGroupRecord
  modelId: string
  generationOptions: VideoOptionMap
  referencePlan?: ShotGroupVideoReferencePlanItem[]
}) {
  const { shotGroup, modelId, generationOptions, referencePlan } = input
  const mode = resolveShotGroupModeForModel({
    ...shotGroup,
    modelKey: modelId,
  })
  return {
    mode,
    referenceMode: resolveShotGroupReferenceMode({
      mode,
      omniReferenceEnabled: shotGroup.omniReferenceEnabled,
      smartMultiFrameEnabled: shotGroup.smartMultiFrameEnabled,
      modelKey: modelId,
    }),
    videoModel: modelId,
    compositeImageUrl: shotGroup.compositeImageUrl,
    generateAudio: typeof generationOptions.generateAudio === 'boolean'
      ? generationOptions.generateAudio
      : shotGroup.generateAudio,
    bgmEnabled: false,
    includeDialogue: shotGroup.includeDialogue,
    dialogueLanguage: shotGroup.dialogueLanguage,
    ...deriveShotGroupModeFlags(mode),
    generationOptions,
    videoReferenceSettings: resolveReferenceSettings(shotGroup),
    ...(referencePlan ? { referencePlan } : {}),
    orderedReferences: (shotGroup.items || []).map((item) => ({
      itemIndex: item.itemIndex,
      title: item.title,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      sourcePanelId: item.sourcePanelId,
    })),
  }
}

function normalizeDialogueLanguage(value: string | null | undefined): ShotGroupDialogueLanguage {
  return value === 'en' || value === 'ja' ? value : 'zh'
}

function buildShotGroupVideoSourceType(shotGroup: ShotGroupRecord, modelId: string) {
  return resolveShotGroupReferenceMode({
    ...shotGroup,
    modelKey: modelId,
  })
}

async function buildShotGroupArkContentPlan(projectId: string, shotGroup: ShotGroupRecord): Promise<ShotGroupArkContentPlan | undefined> {
  if (!shotGroup.compositeImageUrl) return undefined

  const mode = resolveShotGroupModeForModel({
    ...shotGroup,
    modelKey: shotGroup.videoModel,
  })
  const {
    settings,
    draftMetadata,
    characterById,
    characterImageById,
    locationImageById,
    propImageById,
  } = await resolveShotGroupAssetReferenceMaps(projectId, shotGroup)
  const uniqueUrls = new Set<string>()
  const contentItems: ArkReferenceContentItem[] = []
  const references: ShotGroupVideoReferencePlanItem[] = []
  let imageIndex = 0
  let audioIndex = 0

  const pushImage = (url: string | null | undefined, sourceType: string, label: string, usage: string, role?: 'reference_image') => {
    if (imageIndex >= 9) return
    const signed = toSignedUrlIfCos(url, 3600)
    if (!signed || uniqueUrls.has(signed)) return
    uniqueUrls.add(signed)
    imageIndex += 1
    contentItems.push({
      type: 'image_url',
      image_url: { url: signed },
      ...(role ? { role } : {}),
    })
    references.push({ token: `@Image${imageIndex}`, type: 'image', sourceType, label, url: signed, usage })
  }

  const pushAudio = (url: string | null | undefined, sourceType: string, label: string, usage: string) => {
    if (audioIndex >= 3) return
    const signed = toSignedUrlIfCos(url, 3600)
    if (!signed || uniqueUrls.has(signed)) return
    uniqueUrls.add(signed)
    audioIndex += 1
    contentItems.push({
      type: 'audio_url',
      audio_url: { url: signed },
      role: 'reference_audio',
    })
    references.push({ token: `@Audio${audioIndex}`, type: 'audio', sourceType, label, url: signed, usage })
  }

  pushImage(shotGroup.compositeImageUrl, 'composite_storyboard', '分镜参考表', '参考镜头顺序、构图和动作节奏；不要把九宫格画面直接做成拼贴成片')
  if (settings.includeConceptImage) {
    pushImage(shotGroup.referenceImageUrl, 'concept_reference', '辅助参考图 / 概念母图', '参考整体美术、空间、光线、人物气质和氛围', 'reference_image')
  }

  if (settings.includeCharacterImages) {
    const selectedCharacterIds = selectedAssetIdsOrAll(settings.selectedCharacterAssetIds, draftMetadata?.effectiveCharacterAssets ?? [])
    for (const asset of draftMetadata?.effectiveCharacterAssets ?? []) {
      if (!asset.assetId || !selectedCharacterIds.includes(asset.assetId)) continue
      pushImage(asset.imageUrl || characterImageById.get(asset.assetId), 'character_reference', `角色 ${asset.label}`, '必须保持角色身份、性别、脸型、发型、服装和年龄感一致', 'reference_image')
    }
  }

  if (settings.includeLocationImage && draftMetadata?.effectiveLocationAsset?.assetId) {
    const asset = draftMetadata.effectiveLocationAsset
    const locationAssetId = asset.assetId
    pushImage(asset.imageUrl || (locationAssetId ? locationImageById.get(locationAssetId) : null), 'location_reference', `场景 ${asset.label}`, '参考空间结构、材质、光线方向和场面调度边界', 'reference_image')
  }

  if (settings.includePropImages) {
    for (const asset of draftMetadata?.effectivePropAssets ?? []) {
      if (!asset.assetId) continue
      pushImage(asset.imageUrl || propImageById.get(asset.assetId), 'prop_reference', `物品 ${asset.label}`, '参考关键物品外观，保持触发剧情的道具一致', 'reference_image')
    }
  }

  if (settings.includeShotImages || mode === 'smart-multi-frame') {
    for (const item of shotGroup.items || []) {
      pushImage(item.imageUrl, 'shot_frame_reference', item.title || `镜头 ${item.itemIndex + 1}`, '参考该镜头的构图、人物站位和动作衔接', 'reference_image')
    }
  }

  if (settings.includeCharacterAudio) {
    const selectedAudioIds = selectedAssetIdsOrAll(settings.selectedAudioCharacterAssetIds, draftMetadata?.effectiveCharacterAssets ?? [])
    for (const asset of draftMetadata?.effectiveCharacterAssets ?? []) {
      if (!asset.assetId || !selectedAudioIds.includes(asset.assetId)) continue
      const character = characterById.get(asset.assetId)
      pushAudio(character?.customVoiceUrl, 'character_voice_reference', `角色 ${asset.label} 声音`, '参考角色音色、语气、年龄感和情绪强度；不要当作背景音乐')
    }
  }

  if (references.length === 0) return undefined
  const promptSuffix = [
    '参考素材使用说明：',
    ...references.map((reference) => `${reference.token}（${reference.label}）：${reference.usage}。`),
    '请严格按上述 @Image / @Audio 引用理解素材用途，优先保证跨片段角色外观、场景质感和声音气质一致。',
  ].join('\n')

  return { contentItems, promptSuffix, references }
}

async function generateVideoForShotGroup(
  job: Job<TaskJobData>,
  shotGroup: ShotGroupRecord,
  modelId: string,
  projectVideoRatio: string | null | undefined,
  generationOptions: VideoOptionMap,
) {
  if (!shotGroup.compositeImageUrl) {
    throw new Error(`Shot group ${shotGroup.id} has no compositeImageUrl`)
  }

  const template = getShotGroupTemplateSpec(shotGroup.templateKey)
  const basePrompt = buildShotGroupVideoPrompt({
    group: {
      ...shotGroup,
      videoMode: resolveShotGroupModeForModel({
        ...shotGroup,
        modelKey: modelId,
      }),
      bgmEnabled: false,
      dialogueLanguage: normalizeDialogueLanguage(shotGroup.dialogueLanguage),
      items: shotGroup.items,
    },
    template,
    locale: job.data.locale,
  })

  const sourceImageUrl = toSignedUrlIfCos(shotGroup.compositeImageUrl, 3600)
  if (!sourceImageUrl) {
    throw new Error('Shot group composite image url invalid')
  }
  const sourceImageBase64 = await normalizeToBase64ForGeneration(sourceImageUrl)
  const effectiveGenerateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : shotGroup.generateAudio
  const sourceType = buildShotGroupVideoSourceType(shotGroup, modelId)
  const contentPlan = supportsShotGroupMultiReferenceModes(modelId)
    ? await buildShotGroupArkContentPlan(job.data.projectId, { ...shotGroup, videoModel: modelId })
    : undefined
  const prompt = contentPlan?.promptSuffix
    ? `${basePrompt}\n\n${contentPlan.promptSuffix}`
    : basePrompt

  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId,
    imageUrl: sourceImageBase64,
    options: {
      prompt,
      ...(projectVideoRatio ? { aspectRatio: projectVideoRatio } : {}),
      ...generationOptions,
      generationMode: 'normal',
      generateAudio: effectiveGenerateAudio,
      ...(contentPlan?.contentItems ? { contentItems: contentPlan.contentItems } : {}),
    },
  })

  let downloadHeaders: Record<string, string> | undefined
  const videoSource = generatedVideo.url
  if (generatedVideo.downloadHeaders) {
    downloadHeaders = generatedVideo.downloadHeaders
  } else if (typeof videoSource === 'string') {
    const parsedModel = parseModelKeyStrict(modelId)
    const isGoogleDownloadUrl = videoSource.includes('generativelanguage.googleapis.com/')
      && videoSource.includes('/files/')
      && videoSource.includes(':download')
    if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
      const { apiKey } = await getProviderConfig(job.data.userId, 'google')
      downloadHeaders = { 'x-goog-api-key': apiKey }
    }
  }

  const cosKey = await uploadVideoSourceToCos(videoSource, 'shot-group-video', shotGroup.id, downloadHeaders)
  return {
    cosKey,
    prompt,
    sourceType,
    referencesSnapshot: buildShotGroupReferenceSnapshot({
      shotGroup,
      modelId,
      generationOptions: {
        ...generationOptions,
        generateAudio: effectiveGenerateAudio,
      },
      referencePlan: contentPlan?.references,
    }),
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}

async function handleVideoPanelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectModels = await getProjectModels(job.data.projectId, job.data.userId)

  const modelId = typeof payload.videoModel === 'string' ? payload.videoModel.trim() : ''
  if (!modelId) throw new Error('VIDEO_MODEL_REQUIRED: payload.videoModel is required')

  const panel = await getPanelForVideoTask(job)

  const generationOptions = extractGenerationOptions(payload)

  await reportTaskProgress(job, 10, {
    stage: 'generate_panel_video',
    panelId: panel.id,
  })

  const { cosKey, generationMode, actualVideoTokens } = await generateVideoForPanel(
    job,
    panel,
    payload,
    modelId,
    projectModels.videoRatio,
    generationOptions,
  )

  await assertTaskActive(job, 'persist_panel_video')
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      videoUrl: cosKey,
      videoGenerationMode: generationMode,
    },
  })

  return {
    panelId: panel.id,
    videoUrl: cosKey,
    ...(typeof actualVideoTokens === 'number' ? { actualVideoTokens } : {}),
  }
}

async function handleShotGroupVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectModels = await getProjectModels(job.data.projectId, job.data.userId)

  const modelId = typeof payload.videoModel === 'string' ? payload.videoModel.trim() : ''
  if (!modelId) throw new Error('VIDEO_MODEL_REQUIRED: payload.videoModel is required')

  const shotGroup = await prisma.novelPromotionShotGroup.findFirst({
    where: buildShotGroupInProjectWhere(job.data.projectId, job.data.targetId),
    include: {
      items: { orderBy: { itemIndex: 'asc' } },
    },
  }) as ShotGroupRecord | null
  if (!shotGroup) throw new Error('Shot group not found')

  const generationOptions = extractGenerationOptions(payload)

  await reportTaskProgress(job, 10, {
    stage: 'generate_shot_group_video',
    shotGroupId: shotGroup.id,
  })

  const { cosKey, prompt, sourceType, referencesSnapshot, actualVideoTokens } = await generateVideoForShotGroup(
    job,
    shotGroup,
    modelId,
    projectModels.videoRatio,
    generationOptions,
  )

  await assertTaskActive(job, 'persist_shot_group_video')
  await prisma.novelPromotionShotGroup.update({
    where: { id: shotGroup.id },
    data: {
      videoUrl: cosKey,
      videoModel: modelId,
      videoSourceType: sourceType,
      videoReferencesJson: JSON.stringify(referencesSnapshot),
    },
  })

  return {
    shotGroupId: shotGroup.id,
    videoUrl: cosKey,
    videoPrompt: prompt,
    videoModel: modelId,
    videoSourceType: sourceType,
    videoReferences: referencesSnapshot,
    ...(typeof actualVideoTokens === 'number' ? { actualVideoTokens } : {}),
  }
}

async function handleLipSyncTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const lipSyncModel = typeof payload.lipSyncModel === 'string' && payload.lipSyncModel.trim()
    ? payload.lipSyncModel.trim()
    : undefined

  let panel: PanelRecord | null = null
  if (job.data.targetType === 'NovelPromotionPanel') {
    panel = await prisma.novelPromotionPanel.findUnique({ where: { id: job.data.targetId } })
  }

  if (
    !panel &&
    typeof payload.storyboardId === 'string' &&
    payload.storyboardId &&
    payload.panelIndex !== undefined
  ) {
    panel = await fetchPanelByStoryboardIndex(payload.storyboardId, Number(payload.panelIndex))
  }

  if (!panel) throw new Error('Lip-sync panel not found')
  if (!panel.videoUrl) throw new Error('Panel has no base video')

  const voiceLineId = typeof payload.voiceLineId === 'string' ? payload.voiceLineId : null
  if (!voiceLineId) throw new Error('Lip-sync task missing voiceLineId')

  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({ where: { id: voiceLineId } })
  if (!voiceLine || !voiceLine.audioUrl) {
    throw new Error('Voice line or audioUrl not found')
  }

  const signedVideoUrl = toSignedUrlIfCos(panel.videoUrl, 7200)
  const signedAudioUrl = toSignedUrlIfCos(voiceLine.audioUrl, 7200)

  if (!signedVideoUrl || !signedAudioUrl) {
    throw new Error('Lip-sync input media url invalid')
  }

  await reportTaskProgress(job, 25, { stage: 'submit_lip_sync' })

  const source = await resolveLipSyncVideoSource(job, {
    userId: job.data.userId,
    videoUrl: signedVideoUrl,
    audioUrl: signedAudioUrl,
    audioDurationMs: typeof voiceLine.audioDuration === 'number' ? voiceLine.audioDuration : undefined,
    videoDurationMs: toDurationMs(panel.duration),
    modelKey: lipSyncModel,
  })

  await reportTaskProgress(job, 93, { stage: 'persist_lip_sync' })

  const cosKey = await uploadVideoSourceToCos(source, 'lip-sync', panel.id)

  await assertTaskActive(job, 'persist_lip_sync_video')
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      lipSyncVideoUrl: cosKey,
      lipSyncTaskId: null,
    },
  })

  return {
    panelId: panel.id,
    voiceLineId,
    lipSyncVideoUrl: cosKey,
  }
}

async function processVideoTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VIDEO_PANEL:
      return await handleVideoPanelTask(job)
    case TASK_TYPE.VIDEO_SHOT_GROUP:
      return await handleShotGroupVideoTask(job)
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
    default:
      throw new Error(`Unsupported video task type: ${job.data.type}`)
  }
}

export function createVideoWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.VIDEO,
    async (job) => await withTaskLifecycle(job, async (taskJob) => {
      const workflowConcurrency = await getUserWorkflowConcurrencyConfig(taskJob.data.userId)
      return await withUserConcurrencyGate({
        scope: 'video',
        userId: taskJob.data.userId,
        limit: workflowConcurrency.video,
        run: async () => await processVideoTask(taskJob),
      })
    }),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
    },
  )
}
