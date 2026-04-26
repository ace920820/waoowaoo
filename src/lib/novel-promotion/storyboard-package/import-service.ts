import {
  mapStoryboardPackageToImportPlan,
  parseStoryboardPackageText,
  type StoryboardPackage,
  type StoryboardPackageAsset,
  type StoryboardPackageAssetMatchRequest,
  type StoryboardPackageAssetType,
  type StoryboardPackageImportSegment,
  type StoryboardPackageParseError,
} from '@/lib/novel-promotion/storyboard-package'
import {
  parseShotGroupDraftMetadata,
  type ShotGroupAssetBindingReference,
  type ShotGroupDraftMetadata,
} from '@/lib/shot-group/draft-metadata'
import { buildShotGroupVideoConfigSnapshot } from '@/lib/shot-group/video-config-snapshot'

export type StoryboardPackageImportMode = 'preview' | 'commit'
export type StoryboardPackageOverwriteStrategy = 'replace-imported'

export type StoryboardPackageImportOptions = {
  mode: StoryboardPackageImportMode
  content: string
  filename?: string | null
  contentType?: string | null
  overwriteStrategy?: StoryboardPackageOverwriteStrategy | null
  preserveGeneratedMedia?: boolean | null
}

export type StoryboardPackageProjectAsset = {
  id: string
  name: string
  assetKind?: string | null
  selectedImageId?: string | null
  selectedImage?: { id?: string | null; imageUrl?: string | null; url?: string | null } | null
  images?: Array<{ id?: string | null; imageUrl?: string | null; url?: string | null; selected?: boolean | null }>
  appearances?: Array<{ id?: string | null; imageUrl?: string | null; url?: string | null; selected?: boolean | null }>
}

export type StoryboardPackageProjectAssets = {
  characters: StoryboardPackageProjectAsset[]
  locations: StoryboardPackageProjectAsset[]
  props: StoryboardPackageProjectAsset[]
}

export type StoryboardPackageExistingItem = {
  id?: string
  itemIndex: number
  title: string | null
  prompt: string | null
  imageUrl?: string | null
  imageMediaId?: string | null
  sourcePanelId?: string | null
}

export type StoryboardPackageExistingShotGroup = {
  id: string
  title: string
  templateKey: string
  videoReferencesJson: string | null
  referenceImageUrl?: string | null
  referenceImageMediaId?: string | null
  compositeImageUrl?: string | null
  videoUrl?: string | null
  items: StoryboardPackageExistingItem[]
}

export type StoryboardPackageImportEpisode = {
  id: string
  shotGroups: StoryboardPackageExistingShotGroup[]
}

export type StoryboardPackageAssetMatch = {
  assetType: StoryboardPackageAssetType
  ref: string
  label: string
  matchName: string
  packageExternalId: string | null
  status: 'matched' | 'script-derived-fallback'
  source: 'id' | 'matchName' | 'name' | 'scriptDerived'
  assetId: string | null
  assetName: string | null
  imageId: string | null
  imageUrl: string | null
  warning: string | null
}

export type StoryboardPackageImportPreviewSegment = {
  packageId: string
  sceneId: string
  segmentId: string
  action: 'create' | 'update'
  existingShotGroupId: string | null
  order: number
  title: string
  sceneLabel: string
  targetDurationSec: number
  templateKey: string
  shotCount: number
  assetMatches: {
    location: StoryboardPackageAssetMatch[]
    characters: StoryboardPackageAssetMatch[]
    props: StoryboardPackageAssetMatch[]
  }
  warnings: string[]
}

export type StoryboardPackageImportPreview = {
  ok: true
  mode: StoryboardPackageImportMode
  overwriteStrategy: StoryboardPackageOverwriteStrategy
  preserveGeneratedMedia: boolean
  package: {
    packageId: string
    title: string
    language: StoryboardPackage['language']
    sceneCount: number
    segmentCount: number
  }
  summary: {
    totalSegments: number
    createCount: number
    updateCount: number
    warningCount: number
  }
  scenes: ReturnType<typeof mapStoryboardPackageToImportPlan>['scenes']
  segments: StoryboardPackageImportPreviewSegment[]
  warnings: string[]
}

export type StoryboardPackageImportFailure = {
  ok: false
  error: StoryboardPackageParseError
}

export type StoryboardPackageImportPreviewResult = StoryboardPackageImportPreview | StoryboardPackageImportFailure

export type StoryboardPackageCommitResult = StoryboardPackageImportPreview & {
  commit: {
    created: Array<{ segmentId: string; shotGroupId: string }>
    updated: Array<{ segmentId: string; shotGroupId: string }>
  }
}

type ExistingMatch = {
  group: StoryboardPackageExistingShotGroup
  metadata: ShotGroupDraftMetadata
}

type AssetIndex = Record<StoryboardPackageAssetType, StoryboardPackageProjectAsset[]>

export type StoryboardPackageCommitTx = {
  novelPromotionShotGroup: {
    create: (args: unknown) => Promise<{ id: string }>
    update: (args: unknown) => Promise<{ id: string }>
  }
  novelPromotionShotGroupItem: {
    deleteMany: (args: unknown) => Promise<unknown>
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<unknown>
  }
}

function normalizeName(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function getAssetLabel(asset: StoryboardPackageProjectAsset) {
  return asset.name.trim()
}

function getAssetImage(asset: StoryboardPackageProjectAsset) {
  const selected = asset.selectedImage
    || asset.images?.find((image) => image.selected)
    || asset.images?.[0]
    || asset.appearances?.find((image) => image.selected)
    || asset.appearances?.[0]
    || null
  return {
    imageId: selected?.id || asset.selectedImageId || null,
    imageUrl: selected?.imageUrl || selected?.url || null,
  }
}

function buildProjectAssetIndex(projectAssets: StoryboardPackageProjectAssets): AssetIndex {
  return {
    character: projectAssets.characters,
    location: projectAssets.locations.filter((asset) => asset.assetKind !== 'prop'),
    prop: projectAssets.props.length > 0
      ? projectAssets.props
      : projectAssets.locations.filter((asset) => asset.assetKind === 'prop'),
  }
}

function findPackageAsset(pkg: StoryboardPackage, request: StoryboardPackageAssetMatchRequest): StoryboardPackageAsset | null {
  const collection = request.assetType === 'character'
    ? pkg.assets.characters
    : request.assetType === 'location'
      ? pkg.assets.locations
      : pkg.assets.props
  return collection.find((asset) => asset.externalId === request.externalId || asset.externalId === request.ref) || null
}

function findProjectAsset(
  assets: StoryboardPackageProjectAsset[],
  request: StoryboardPackageAssetMatchRequest,
  packageAsset: StoryboardPackageAsset | null,
) {
  const externalId = packageAsset?.externalId || request.externalId || request.ref
  const matchName = packageAsset?.matchName || request.matchName
  const name = packageAsset?.name || request.label
  const byId = assets.find((asset) => asset.id === externalId)
  if (byId) return { asset: byId, source: 'id' as const }

  const normalizedMatchName = normalizeName(matchName)
  const byMatchName = normalizedMatchName
    ? assets.find((asset) => normalizeName(asset.name) === normalizedMatchName)
    : null
  if (byMatchName) return { asset: byMatchName, source: 'matchName' as const }

  const normalizedName = normalizeName(name)
  const byName = normalizedName
    ? assets.find((asset) => normalizeName(asset.name) === normalizedName)
    : null
  if (byName) return { asset: byName, source: 'name' as const }

  return null
}

function buildMissingAssetWarning(assetType: StoryboardPackageAssetType, label: string) {
  const labelPrefix = assetType === 'location' ? '场景' : assetType === 'character' ? '角色' : '物品'
  return `${labelPrefix}素材未匹配：${label}，将使用剧本文本回退。`
}

function matchAssetRequest(
  pkg: StoryboardPackage,
  assetIndex: AssetIndex,
  request: StoryboardPackageAssetMatchRequest,
): StoryboardPackageAssetMatch {
  const packageAsset = findPackageAsset(pkg, request)
  const found = findProjectAsset(assetIndex[request.assetType], request, packageAsset)
  const label = packageAsset?.name || request.label
  const matchName = packageAsset?.matchName || request.matchName
  if (found) {
    const image = getAssetImage(found.asset)
    return {
      assetType: request.assetType,
      ref: request.ref,
      label,
      matchName,
      packageExternalId: packageAsset?.externalId || request.externalId,
      status: 'matched',
      source: found.source,
      assetId: found.asset.id,
      assetName: getAssetLabel(found.asset),
      imageId: image.imageId,
      imageUrl: image.imageUrl,
      warning: null,
    }
  }

  return {
    assetType: request.assetType,
    ref: request.ref,
    label,
    matchName,
    packageExternalId: packageAsset?.externalId || request.externalId,
    status: 'script-derived-fallback',
    source: 'scriptDerived',
    assetId: null,
    assetName: null,
    imageId: null,
    imageUrl: null,
    warning: buildMissingAssetWarning(request.assetType, label),
  }
}

function matchSegmentAssets(
  pkg: StoryboardPackage,
  assetIndex: AssetIndex,
  segment: StoryboardPackageImportSegment,
) {
  return {
    location: segment.assetMatchRequests.location.map((request) => matchAssetRequest(pkg, assetIndex, request)),
    characters: segment.assetMatchRequests.characters.map((request) => matchAssetRequest(pkg, assetIndex, request)),
    props: segment.assetMatchRequests.props.map((request) => matchAssetRequest(pkg, assetIndex, request)),
  }
}

function flattenAssetWarnings(matches: StoryboardPackageImportPreviewSegment['assetMatches']) {
  return [
    ...matches.location,
    ...matches.characters,
    ...matches.props,
  ].flatMap((match) => match.warning ? [match.warning] : [])
}

function buildExistingImportedMap(shotGroups: StoryboardPackageExistingShotGroup[]) {
  const map = new Map<string, ExistingMatch>()
  for (const group of shotGroups) {
    const metadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
    if (!metadata) continue
    map.set(metadata.segmentKey, { group, metadata })
  }
  return map
}

function buildPreviewSegments(params: {
  pkg: StoryboardPackage
  episode: StoryboardPackageImportEpisode
  projectAssets: StoryboardPackageProjectAssets
}) {
  const plan = mapStoryboardPackageToImportPlan(params.pkg)
  const existingBySegmentKey = buildExistingImportedMap(params.episode.shotGroups)
  const assetIndex = buildProjectAssetIndex(params.projectAssets)

  return plan.segments.map((segment): StoryboardPackageImportPreviewSegment => {
    const existing = existingBySegmentKey.get(segment.draftMetadata.segmentKey) || null
    const assetMatches = matchSegmentAssets(params.pkg, assetIndex, segment)
    const warnings = [...segment.warnings, ...flattenAssetWarnings(assetMatches)]
    return {
      packageId: segment.packageId,
      sceneId: segment.sceneId,
      segmentId: segment.segmentId,
      action: existing ? 'update' : 'create',
      existingShotGroupId: existing?.group.id || null,
      order: segment.order,
      title: segment.title,
      sceneLabel: segment.sceneLabel,
      targetDurationSec: segment.targetDurationSec,
      templateKey: segment.templateKey,
      shotCount: segment.items.length,
      assetMatches,
      warnings,
    }
  })
}

export function buildStoryboardPackageImportPreview(params: {
  options: StoryboardPackageImportOptions
  episode: StoryboardPackageImportEpisode
  projectAssets: StoryboardPackageProjectAssets
}): StoryboardPackageImportPreviewResult {
  const parsed = parseStoryboardPackageText(params.options.content, {
    filename: params.options.filename,
    contentType: params.options.contentType,
  })
  if (!parsed.success) return { ok: false, error: parsed.error }

  const plan = mapStoryboardPackageToImportPlan(parsed.data)
  const segments = buildPreviewSegments({
    pkg: parsed.data,
    episode: params.episode,
    projectAssets: params.projectAssets,
  })
  const warnings = segments.flatMap((segment) => segment.warnings)

  return {
    ok: true,
    mode: params.options.mode,
    overwriteStrategy: params.options.overwriteStrategy || 'replace-imported',
    preserveGeneratedMedia: params.options.preserveGeneratedMedia !== false,
    package: {
      packageId: plan.packageId,
      title: plan.title,
      language: plan.language,
      sceneCount: plan.scenes.length,
      segmentCount: plan.segments.length,
    },
    summary: {
      totalSegments: segments.length,
      createCount: segments.filter((segment) => segment.action === 'create').length,
      updateCount: segments.filter((segment) => segment.action === 'update').length,
      warningCount: warnings.length,
    },
    scenes: plan.scenes,
    segments,
    warnings,
  }
}

function toSelectedAsset(match: StoryboardPackageAssetMatch): ShotGroupAssetBindingReference | null {
  if (match.status !== 'matched' || !match.assetId) return null
  return {
    assetType: match.assetType,
    source: 'preselected',
    assetId: match.assetId,
    label: match.assetName || match.label,
    imageId: match.imageId,
    imageUrl: match.imageUrl,
  }
}

function toScriptDerivedAsset(match: StoryboardPackageAssetMatch): ShotGroupAssetBindingReference {
  return {
    assetType: match.assetType,
    source: 'scriptDerived',
    assetId: null,
    label: match.label,
  }
}

function buildDraftMetadata(
  segment: StoryboardPackageImportSegment,
  previewSegment: StoryboardPackageImportPreviewSegment,
): ShotGroupDraftMetadata {
  const selectedLocationAsset = previewSegment.assetMatches.location.map(toSelectedAsset).find(Boolean) || null
  const selectedCharacterAssets = previewSegment.assetMatches.characters
    .map(toSelectedAsset)
    .filter((asset): asset is ShotGroupAssetBindingReference => Boolean(asset))
  const selectedPropAssets = previewSegment.assetMatches.props
    .map(toSelectedAsset)
    .filter((asset): asset is ShotGroupAssetBindingReference => Boolean(asset))

  return {
    ...segment.draftMetadata,
    importedStoryboardPackageId: segment.packageId,
    importedStoryboardSceneId: segment.sceneId,
    importedStoryboardSegmentId: segment.segmentId,
    selectedLocationAsset,
    selectedCharacterAssets,
    selectedPropAssets,
    scriptDerivedLocationAsset: selectedLocationAsset
      ? segment.draftMetadata.scriptDerivedLocationAsset
      : previewSegment.assetMatches.location[0]
        ? toScriptDerivedAsset(previewSegment.assetMatches.location[0])
        : segment.draftMetadata.scriptDerivedLocationAsset,
    scriptDerivedCharacterAssets: previewSegment.assetMatches.characters
      .filter((match) => match.status !== 'matched')
      .map(toScriptDerivedAsset),
    scriptDerivedPropAssets: previewSegment.assetMatches.props
      .filter((match) => match.status !== 'matched')
      .map(toScriptDerivedAsset),
    missingAssetWarnings: [
      ...previewSegment.assetMatches.location,
      ...previewSegment.assetMatches.characters,
      ...previewSegment.assetMatches.props,
    ].flatMap((match) => match.warning
      ? [{ assetType: match.assetType, code: 'missing_asset_binding' as const, message: match.warning }]
      : []),
    cinematicPlan: {
      ...segment.draftMetadata.cinematicPlan,
      importedStoryboardPackageId: segment.packageId,
      importedStoryboardSceneId: segment.sceneId,
      importedStoryboardSegmentId: segment.segmentId,
    },
  }
}

function toModeFlags(mode: StoryboardPackageImportSegment['shotGroupFields']['mode']) {
  return {
    omniReferenceEnabled: mode === 'omni-reference',
    smartMultiFrameEnabled: mode === 'smart-multi-frame',
  }
}

function findSegmentPlan(pkg: StoryboardPackage, sceneId: string, segmentId: string) {
  return mapStoryboardPackageToImportPlan(pkg).segments.find((segment) => segment.sceneId === sceneId && segment.segmentId === segmentId)
}

function buildItemData(params: {
  shotGroupId: string
  segment: StoryboardPackageImportSegment
  existingGroup: StoryboardPackageExistingShotGroup | null
  preserveGeneratedMedia: boolean
}) {
  return params.segment.items.map((item) => {
    const previous = params.existingGroup?.items.find((existingItem) => existingItem.itemIndex === item.itemIndex)
    return {
      shotGroupId: params.shotGroupId,
      itemIndex: item.itemIndex,
      title: item.title,
      prompt: item.prompt,
      ...(params.preserveGeneratedMedia && previous?.imageUrl ? { imageUrl: previous.imageUrl } : {}),
      ...(params.preserveGeneratedMedia && previous?.imageMediaId ? { imageMediaId: previous.imageMediaId } : {}),
      ...(params.preserveGeneratedMedia && previous?.sourcePanelId ? { sourcePanelId: previous.sourcePanelId } : {}),
    }
  })
}

export async function commitStoryboardPackageImport(params: {
  options: StoryboardPackageImportOptions
  episode: StoryboardPackageImportEpisode
  projectAssets: StoryboardPackageProjectAssets
  tx: StoryboardPackageCommitTx
}): Promise<StoryboardPackageImportPreviewResult | StoryboardPackageCommitResult> {
  const parsed = parseStoryboardPackageText(params.options.content, {
    filename: params.options.filename,
    contentType: params.options.contentType,
  })
  if (!parsed.success) return { ok: false, error: parsed.error }

  const preview = buildStoryboardPackageImportPreview(params)
  if (!preview.ok) return preview

  const existingBySegmentKey = buildExistingImportedMap(params.episode.shotGroups)
  const created: StoryboardPackageCommitResult['commit']['created'] = []
  const updated: StoryboardPackageCommitResult['commit']['updated'] = []
  const preserveGeneratedMedia = params.options.preserveGeneratedMedia !== false

  for (const previewSegment of preview.segments) {
    const segment = findSegmentPlan(parsed.data, previewSegment.sceneId, previewSegment.segmentId)
    if (!segment) continue
    const existing = existingBySegmentKey.get(segment.draftMetadata.segmentKey)?.group || null
    const previousDraftMetadata = existing ? parseShotGroupDraftMetadata(existing.videoReferencesJson) : null
    const modeFlags = toModeFlags(segment.shotGroupFields.mode)
    const draftMetadata = buildDraftMetadata(segment, previewSegment)
    const videoReferencesJson = buildShotGroupVideoConfigSnapshot({
      videoModel: segment.shotGroupFields.videoModel,
      generateAudio: segment.shotGroupFields.generateAudio,
      includeDialogue: segment.shotGroupFields.includeDialogue,
      dialogueLanguage: segment.shotGroupFields.dialogueLanguage,
      ...modeFlags,
      generationOptions: segment.shotGroupFields.generationOptions,
      previousDraftMetadata,
      draftMetadata,
    })
    const groupData = {
      episodeId: params.episode.id,
      title: segment.shotGroupFields.title,
      templateKey: segment.shotGroupFields.templateKey,
      groupPrompt: segment.shotGroupFields.groupPrompt,
      videoPrompt: segment.shotGroupFields.videoPrompt,
      generateAudio: segment.shotGroupFields.generateAudio,
      bgmEnabled: false,
      includeDialogue: segment.shotGroupFields.includeDialogue,
      dialogueLanguage: segment.shotGroupFields.dialogueLanguage,
      ...modeFlags,
      videoModel: segment.shotGroupFields.videoModel,
      videoReferencesJson,
    }

    if (existing) {
      await params.tx.novelPromotionShotGroup.update({
        where: { id: existing.id },
        data: groupData,
      })
      await params.tx.novelPromotionShotGroupItem.deleteMany({ where: { shotGroupId: existing.id } })
      await params.tx.novelPromotionShotGroupItem.createMany({
        data: buildItemData({
          shotGroupId: existing.id,
          segment,
          existingGroup: existing,
          preserveGeneratedMedia,
        }),
      })
      updated.push({ segmentId: segment.segmentId, shotGroupId: existing.id })
    } else {
      const createdGroup = await params.tx.novelPromotionShotGroup.create({
        data: {
          ...groupData,
          items: {
            create: segment.items.map((item) => ({
              itemIndex: item.itemIndex,
              title: item.title,
              prompt: item.prompt,
            })),
          },
        },
      })
      created.push({ segmentId: segment.segmentId, shotGroupId: createdGroup.id })
    }
  }

  return {
    ...preview,
    mode: 'commit',
    commit: { created, updated },
  }
}
