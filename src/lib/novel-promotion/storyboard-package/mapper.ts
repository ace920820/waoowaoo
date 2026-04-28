import type {
  StoryboardPackage,
  StoryboardPackageAsset,
  StoryboardPackageSegment,
  StoryboardPackageShot,
} from './schema'
import type { ShotGroupAssetBindingReference } from '@/lib/shot-group/draft-metadata'
import type { ShotGroupVideoGenerationOptions, ShotGroupVideoMode } from '@/lib/shot-group/video-config'
import { sanitizeShotGroupGenerationOptions } from '@/lib/shot-group/video-config'

export type StoryboardPackageAssetType = 'location' | 'character' | 'prop'

export type StoryboardPackageAssetMatchRequest = {
  assetType: StoryboardPackageAssetType
  ref: string
  externalId: string | null
  matchName: string
  label: string
  description: string | null
  status: 'declared' | 'missing-declaration'
}

export type StoryboardPackageImportShotItem = {
  itemIndex: number
  title: string | null
  prompt: string | null
  durationSec?: number | null
  shotSize?: string | null
  angle?: string | null
  cameraMovement?: string | null
  composition?: string | null
  lighting?: string | null
  blocking?: string | null
  emotionalBeat?: string | null
}

export type StoryboardPackageImportSegment = {
  packageId: string
  sceneId: string
  segmentId: string
  order: number
  timecode: string
  title: string
  sceneLabel: string
  targetDurationSec: number
  templateKey: StoryboardPackageSegment['reviewConfig']['templateKey']
  shotGroupFields: {
    title: string
    templateKey: StoryboardPackageSegment['reviewConfig']['templateKey']
    groupPrompt: string
    videoPrompt: string
    generateAudio: boolean
    includeDialogue: boolean
    dialogueLanguage: StoryboardPackageSegment['videoConfig']['dialogueLanguage']
    mode: ShotGroupVideoMode
    videoModel: string | null
    generationOptions: ShotGroupVideoGenerationOptions
  }
  draftMetadata: {
    segmentOrder: number
    clipId: string
    segmentKey: string
    sourceClipId: string
    segmentIndexWithinClip: number
    segmentStartSeconds: number
    segmentEndSeconds: number
    sceneLabel: string
    narrativePrompt: string | null
    embeddedDialogue: string | null
    dialogueOverrideText: string | null
    shotRhythmGuidance: string | null
    expectedShotCount: number
    sourceStatus: 'ready'
    placeholderReason: null
    referencePromptText: string
    compositePromptText: string
    storyboardModeId: string
    storyboardModeLabel: string
    storyboardModePromptText: string
    storyboardMoodPresetId: string | null
    customMood: string | null
    scriptDerivedLocationAsset: ShotGroupAssetBindingReference | null
    scriptDerivedCharacterAssets: ShotGroupAssetBindingReference[]
    scriptDerivedPropAssets: ShotGroupAssetBindingReference[]
    cinematicPlan: Record<string, unknown>
  }
  assetMatchRequests: {
    location: StoryboardPackageAssetMatchRequest[]
    characters: StoryboardPackageAssetMatchRequest[]
    props: StoryboardPackageAssetMatchRequest[]
  }
  warnings: string[]
  items: StoryboardPackageImportShotItem[]
}

export type StoryboardPackageImportPlan = {
  packageId: string
  title: string
  language: StoryboardPackage['language']
  global: StoryboardPackage['global']
  scenes: Array<{
    sceneId: string
    title: string
    targetDurationSec: number
    directorIntent: string
    segmentIds: string[]
  }>
  segments: StoryboardPackageImportSegment[]
}

type AssetLookup = Record<StoryboardPackageAssetType, Map<string, StoryboardPackageAsset>>

function buildAssetLookup(pkg: StoryboardPackage): AssetLookup {
  return {
    location: new Map(pkg.assets.locations.map((asset) => [asset.externalId, asset])),
    character: new Map(pkg.assets.characters.map((asset) => [asset.externalId, asset])),
    prop: new Map(pkg.assets.props.map((asset) => [asset.externalId, asset])),
  }
}

function toSecondsFromTimecode(timecode: string) {
  const [start, end] = timecode.split('-').map((part) => part.trim())
  return {
    start: parseTimecodePart(start),
    end: parseTimecodePart(end),
  }
}

function parseTimecodePart(part: string | undefined) {
  if (!part) return 0
  const pieces = part.split(':').map((piece) => Number(piece))
  if (pieces.some((piece) => !Number.isFinite(piece))) return 0
  if (pieces.length === 3) return pieces[0] * 3600 + pieces[1] * 60 + pieces[2]
  if (pieces.length === 2) return pieces[0] * 60 + pieces[1]
  return pieces[0] || 0
}

function resolveAsset(
  lookup: AssetLookup,
  assetType: StoryboardPackageAssetType,
  ref: string,
): StoryboardPackageAssetMatchRequest {
  const asset = lookup[assetType].get(ref)
  return {
    assetType,
    ref,
    externalId: asset?.externalId ?? null,
    matchName: asset?.matchName || asset?.name || ref,
    label: asset?.name || ref,
    description: asset?.description || null,
    status: asset ? 'declared' : 'missing-declaration',
  }
}

function toScriptDerivedAssetReference(
  request: StoryboardPackageAssetMatchRequest,
): ShotGroupAssetBindingReference {
  return {
    assetType: request.assetType,
    source: 'scriptDerived',
    assetId: null,
    label: request.label,
  }
}

function buildAssetRequests(
  segment: StoryboardPackageSegment,
  lookup: AssetLookup,
) {
  const refs = segment.reviewConfig.assets
  return {
    location: refs.locationRefs.map((ref) => resolveAsset(lookup, 'location', ref)),
    characters: refs.characterRefs.map((ref) => resolveAsset(lookup, 'character', ref)),
    props: refs.propRefs.map((ref) => resolveAsset(lookup, 'prop', ref)),
  }
}

function formatShotRhythmGuidance(segment: StoryboardPackageSegment) {
  return [
    segment.dramaticFunction,
    segment.localOnlyNotice,
    segment.informationProgression.length > 0
      ? `信息推进：${segment.informationProgression.join(' -> ')}`
      : null,
  ].filter(Boolean).join('\n')
}

function formatShotField(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) return []
  const text = typeof value === 'number' ? String(value) : value.trim()
  return text ? [`${label}=${text}`] : []
}

function formatDirectorShotLine(shot: StoryboardPackageShot) {
  const fields = [
    ...formatShotField('shotId', shot.shotId),
    ...formatShotField('时长', shot.durationSec === null || shot.durationSec === undefined ? null : `${shot.durationSec}s`),
    ...formatShotField('戏剧节拍', shot.dramaticBeat),
    ...formatShotField('信息点', shot.informationUnit),
    ...formatShotField('目的', shot.purpose),
    ...formatShotField('场面调度', shot.blocking),
    ...formatShotField('景别', shot.shotSize),
    ...formatShotField('焦段', shot.lens),
    ...formatShotField('景深', shot.dof),
    ...formatShotField('角度', shot.angle),
    ...formatShotField('运镜', shot.cameraMovement),
    ...formatShotField('构图', shot.composition),
    ...formatShotField('打光', shot.lighting),
    ...formatShotField('剪辑', shot.edit),
    ...formatShotField('画面提示词', shot.imagePrompt),
  ]
  return `镜头${shot.index}《${shot.title}》：${fields.join('；')}`
}

function formatDirectorShotPlan(segment: StoryboardPackageSegment) {
  return segment.cinematicPlan.shots
    .slice()
    .sort((left, right) => left.index - right.index)
    .map(formatDirectorShotLine)
    .join('\n')
}

function buildDirectorReferencePrompt(segment: StoryboardPackageSegment) {
  const visualStrategy = JSON.stringify(segment.cinematicPlan.visualStrategy ?? {}, null, 0)
  const emotionalIntent = JSON.stringify(segment.cinematicPlan.emotionalIntent ?? {}, null, 0)
  const shotAnchors = segment.cinematicPlan.shots
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((shot) => `镜头${shot.index}《${shot.title}》：${shot.imagePrompt}`)
    .join('\n')
  return [
    segment.reviewConfig.referencePromptText,
    `导演情绪意图：${emotionalIntent}`,
    `导演视觉策略：${visualStrategy}`,
    `关键镜头视觉锚点：\n${shotAnchors}`,
  ].filter(Boolean).join('\n\n')
}

function buildDirectorCompositePrompt(segment: StoryboardPackageSegment) {
  return [
    segment.reviewConfig.compositePromptText,
    `导演逐镜头分镜表要求：\n${formatDirectorShotPlan(segment)}`,
  ].join('\n\n')
}

function buildDirectorVideoPrompt(segment: StoryboardPackageSegment) {
  return [
    segment.videoConfig.videoPrompt,
    `导演逐镜头视频执行表：\n${formatDirectorShotPlan(segment)}`,
  ].join('\n\n')
}

function mapShotToItem(shot: StoryboardPackageShot): StoryboardPackageImportShotItem {
  return {
    itemIndex: shot.index - 1,
    title: shot.title || null,
    prompt: formatDirectorShotLine(shot),
    durationSec: shot.durationSec ?? null,
    shotSize: shot.shotSize || null,
    angle: shot.angle || null,
    cameraMovement: shot.cameraMovement || null,
    composition: shot.composition || null,
    lighting: shot.lighting || null,
    blocking: shot.blocking || null,
    emotionalBeat: shot.emotionalBeat || shot.dramaticBeat || null,
  }
}

function buildWarnings(requests: StoryboardPackageImportSegment['assetMatchRequests']) {
  return [
    ...requests.location,
    ...requests.characters,
    ...requests.props,
  ].flatMap((request) => request.status === 'missing-declaration'
    ? [`${request.assetType} asset reference "${request.ref}" is not declared in package assets.`]
    : [])
}

function buildCinematicPlan(segment: StoryboardPackageSegment): Record<string, unknown> {
  return {
    ...segment.cinematicPlan,
    packageSegmentId: segment.segmentId,
    dramaticFunction: segment.dramaticFunction,
    localOnlyNotice: segment.localOnlyNotice ?? null,
    informationProgression: segment.informationProgression,
  }
}

function mapSegment(params: {
  pkg: StoryboardPackage
  sceneId: string
  segment: StoryboardPackageSegment
  lookup: AssetLookup
}): StoryboardPackageImportSegment {
  const { pkg, sceneId, segment, lookup } = params
  const assetMatchRequests = buildAssetRequests(segment, lookup)
  const timeWindow = toSecondsFromTimecode(segment.timecode)
  const items = segment.cinematicPlan.shots
    .slice()
    .sort((left, right) => left.index - right.index)
    .map(mapShotToItem)
  const dialogueText = segment.videoConfig.dialogueText.trim()
  const cinematicPlan = buildCinematicPlan(segment)
  const generationOptions = sanitizeShotGroupGenerationOptions(segment.videoConfig.generationOptions)
  const referencePromptText = buildDirectorReferencePrompt(segment)
  const compositePromptText = buildDirectorCompositePrompt(segment)
  const videoPrompt = buildDirectorVideoPrompt(segment)

  return {
    packageId: pkg.packageId,
    sceneId,
    segmentId: segment.segmentId,
    order: segment.order,
    timecode: segment.timecode,
    title: segment.title,
    sceneLabel: segment.sceneLabel,
    targetDurationSec: segment.targetDurationSec,
    templateKey: segment.reviewConfig.templateKey,
    shotGroupFields: {
      title: segment.title,
      templateKey: segment.reviewConfig.templateKey,
      groupPrompt: compositePromptText,
      videoPrompt,
      generateAudio: segment.videoConfig.generateAudio,
      includeDialogue: segment.videoConfig.includeDialogue || Boolean(dialogueText),
      dialogueLanguage: segment.videoConfig.dialogueLanguage,
      mode: segment.videoConfig.referenceMode,
      videoModel: segment.videoConfig.videoModel ?? null,
      generationOptions,
    },
    draftMetadata: {
      segmentOrder: segment.order,
      clipId: `${pkg.packageId}:${sceneId}`,
      segmentKey: `${pkg.packageId}:${segment.segmentId}`,
      sourceClipId: sceneId,
      segmentIndexWithinClip: segment.order,
      segmentStartSeconds: timeWindow.start,
      segmentEndSeconds: timeWindow.end || timeWindow.start + segment.targetDurationSec,
      sceneLabel: segment.sceneLabel,
      narrativePrompt: compositePromptText,
      embeddedDialogue: dialogueText || null,
      dialogueOverrideText: dialogueText || null,
      shotRhythmGuidance: formatShotRhythmGuidance(segment),
      expectedShotCount: items.length,
      sourceStatus: 'ready',
      placeholderReason: null,
      referencePromptText,
      compositePromptText,
      storyboardModeId: segment.reviewConfig.storyboardMode.id,
      storyboardModeLabel: segment.reviewConfig.storyboardMode.label,
      storyboardModePromptText: segment.reviewConfig.storyboardMode.promptText,
      storyboardMoodPresetId: segment.reviewConfig.mood.presetId || null,
      customMood: segment.reviewConfig.mood.customMood || null,
      scriptDerivedLocationAsset: assetMatchRequests.location[0]
        ? toScriptDerivedAssetReference(assetMatchRequests.location[0])
        : null,
      scriptDerivedCharacterAssets: assetMatchRequests.characters.map(toScriptDerivedAssetReference),
      scriptDerivedPropAssets: assetMatchRequests.props.map(toScriptDerivedAssetReference),
      cinematicPlan: {
        ...cinematicPlan,
        importedRawPrompts: {
          referencePromptText: segment.reviewConfig.referencePromptText,
          compositePromptText: segment.reviewConfig.compositePromptText,
          videoPrompt: segment.videoConfig.videoPrompt,
        },
      },
    },
    assetMatchRequests,
    warnings: buildWarnings(assetMatchRequests),
    items,
  }
}

export function mapStoryboardPackageToImportPlan(pkg: StoryboardPackage): StoryboardPackageImportPlan {
  const lookup = buildAssetLookup(pkg)
  const scenes = pkg.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    title: scene.title,
    targetDurationSec: scene.targetDurationSec,
    directorIntent: scene.directorIntent,
    segmentIds: scene.segments.map((segment) => segment.segmentId),
  }))
  const segments = pkg.scenes.flatMap((scene) => scene.segments.map((segment) => mapSegment({
    pkg,
    sceneId: scene.sceneId,
    segment,
    lookup,
  })))

  return {
    packageId: pkg.packageId,
    title: pkg.title,
    language: pkg.language,
    global: pkg.global,
    scenes,
    segments,
  }
}
