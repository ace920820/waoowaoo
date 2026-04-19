'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import GlassModalShell from '@/components/ui/primitives/GlassModalShell'
import { GlassButton } from '@/components/ui/primitives'
import { resolveErrorDisplay } from '@/lib/errors/display'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import {
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import { projectVideoPricingTiersByFixedSelections } from '@/lib/model-pricing/video-tier'
import {
  readShotGroupCapabilitySelection,
  type ShotGroupVideoGenerationOptions,
  type ShotGroupVideoMode,
  resolveShotGroupModeForModel,
  supportsShotGroupMultiReferenceModes,
} from '@/lib/shot-group/video-config'
import {
  useCreateProjectShotGroup,
  useProjectAssets,
  useGenerateProjectShotGroupImage,
  useDownloadRemoteBlob,
  useGenerateProjectShotGroupVideo,
  useSaveProjectVideoTailFrame,
  useTaskTargetStateMap,
  useUpdateProjectShotGroup,
  useUploadProjectShotGroupReferenceImage,
} from '@/lib/query/hooks'
import type { VideoModelOption } from '@/lib/novel-promotion/stages/video-stage-runtime/types'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type {
  Character,
  Location,
  NovelPromotionDialogueLanguage,
  NovelPromotionShotGroup,
  NovelPromotionShotGroupTemplateKey,
  NovelPromotionShotGroupVideoMode,
  Prop,
} from '@/types/project'
import {
  downloadFileFromUrl,
  extractVideoTailFrame,
} from './video-tail-frame-utils'
import { saveBlobAsFile } from '@/lib/download/saveBlobAsFile'
import {
  normalizeShotGroupDraftMetadata,
  parseShotGroupDraftMetadata,
  type ShotGroupAssetBindingReference,
  type ShotGroupDraftMetadata,
} from '@/lib/shot-group/draft-metadata'
import type { StoryboardMoodPreset } from '@/lib/storyboard-mood-presets'
import {
  createDefaultStoryboardModeSettings,
  DEFAULT_STORYBOARD_MODE_ID,
  normalizeStoryboardModeSettings,
  resolveStoryboardModeDefinition,
  STORYBOARD_MODE_STORAGE_EVENT,
  STORYBOARD_MODE_STORAGE_KEY,
  type ShotGroupStoryboardModeSettings,
} from '@/lib/shot-group/storyboard-mode-config'

interface ShotGroupVideoSectionProps {
  projectId: string
  episodeId: string
  shotGroups?: NovelPromotionShotGroup[]
  defaultVideoModel: string
  videoModelOptions?: VideoModelOption[]
  capabilityOverrides?: CapabilitySelections
  storyboardMoodPresets?: StoryboardMoodPreset[]
  projectDefaultMoodPresetId?: string | null
  episodeDefaultMoodPresetId?: string | null
  mode?: 'review' | 'video'
}

interface VideoDraftState {
  title: string
  templateKey: NovelPromotionShotGroupTemplateKey
  groupPrompt: string
  videoPrompt: string
  dialogueText: string
  embeddedDialogue: string
  mode: NovelPromotionShotGroupVideoMode
  generationOptions: ShotGroupVideoGenerationOptions
  includeDialogue: boolean
  dialogueLanguage: NovelPromotionDialogueLanguage
  videoModel: string
  pendingCompositeFile: File | null
}

interface ReviewDraftState {
  templateKey: NovelPromotionShotGroupTemplateKey
  referencePromptText: string
  compositePromptText: string
  storyboardModeId: string
  selectedLocationAsset: ShotGroupAssetBindingReference | null
  selectedCharacterAssets: ShotGroupAssetBindingReference[]
  selectedPropAssets: ShotGroupAssetBindingReference[]
  storyboardMoodPresetId: string
  customMood: string
}

function areAssetBindingReferencesEqual(
  left: ShotGroupAssetBindingReference | null | undefined,
  right: ShotGroupAssetBindingReference | null | undefined,
) {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.assetType === right.assetType
    && left.source === right.source
    && left.assetId === right.assetId
    && left.label === right.label
    && left.imageUrl === right.imageUrl
}

function areAssetBindingReferenceListsEqual(
  left: ShotGroupAssetBindingReference[] | undefined,
  right: ShotGroupAssetBindingReference[] | undefined,
) {
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false
  return (left ?? []).every((asset, index) => areAssetBindingReferencesEqual(asset, right?.[index]))
}

function areReviewDraftsEqual(left: ReviewDraftState | undefined, right: ReviewDraftState | undefined) {
  if (!left && !right) return true
  if (!left || !right) return false
  return areAssetBindingReferencesEqual(left.selectedLocationAsset, right.selectedLocationAsset)
    && areAssetBindingReferenceListsEqual(left.selectedCharacterAssets, right.selectedCharacterAssets)
    && areAssetBindingReferenceListsEqual(left.selectedPropAssets, right.selectedPropAssets)
    && left.templateKey === right.templateKey
    && left.referencePromptText === right.referencePromptText
    && left.compositePromptText === right.compositePromptText
    && left.storyboardModeId === right.storyboardModeId
    && left.storyboardMoodPresetId === right.storyboardMoodPresetId
    && left.customMood === right.customMood
}

const TEMPLATE_OPTIONS: Array<{ value: NovelPromotionShotGroupTemplateKey; label: string; helper: string }> = [
  { value: 'grid-4', label: '4 格', helper: '适合短节奏段落' },
  { value: 'grid-6', label: '6 格', helper: '适合转场推进' },
  { value: 'grid-9', label: '9 格', helper: '适合完整情绪段落' },
]
const SHOT_GROUP_VISIBLE_CAPABILITY_FIELDS = new Set(['duration', 'resolution', 'generateAudio'])
const SEEDED_DIALOGUE_HELPER_TEXT = '已从剧本草稿带入，可在生成前直接改写或清空。'
const EMPTY_DIALOGUE_HELPER_TEXT = '可选。留空时按当前生产单元的默认语音内容处理。'

function resolveStatusLabel(params: {
  hasComposite: boolean
  hasVideo: boolean
  isRunning: boolean
  isError: boolean
}) {
  if (!params.hasComposite) return '待上传'
  if (params.isRunning) return '生成中'
  if (params.isError) return '失败'
  if (params.hasVideo) return '已生成'
  return '待生成'
}

function resolveStatusClass(params: {
  hasComposite: boolean
  hasVideo: boolean
  isRunning: boolean
  isError: boolean
}) {
  if (!params.hasComposite) return 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
  if (params.isRunning) return 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
  if (params.isError) return 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
  if (params.hasVideo) return 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
  return 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
}

function resolveTemplateLabel(templateKey: NovelPromotionShotGroupTemplateKey | string) {
  return TEMPLATE_OPTIONS.find((option) => option.value === templateKey)?.label || templateKey
}

function buildDefaultTitle(templateKey: NovelPromotionShotGroupTemplateKey) {
  return `${resolveTemplateLabel(templateKey)}多镜头视频`
}

function normalizeDialogueLanguage(value: string | null | undefined): NovelPromotionDialogueLanguage {
  return value === 'en' || value === 'ja' ? value : 'zh'
}

function parseSavedVideoConfig(group: NovelPromotionShotGroup) {
  if (!group.videoReferencesJson) return {}
  try {
    const parsed = JSON.parse(group.videoReferencesJson) as Record<string, unknown>
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseGenerationOptionValue(rawValue: string, sample: CapabilityValue): CapabilityValue {
  if (typeof sample === 'number') return Number(rawValue)
  if (typeof sample === 'boolean') return rawValue === 'true'
  return rawValue
}

function toCapabilityFieldLabel(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function sanitizeFileSegment(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
}

function resolveVideoDownloadUrl(projectId: string, videoUrl: string) {
  if (videoUrl.startsWith('/api/')) return videoUrl
  return `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(videoUrl)}`
}

function toDraft(
  group: NovelPromotionShotGroup,
  defaultVideoModel: string,
  capabilityOverrides?: CapabilitySelections,
): VideoDraftState {
  const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
  const savedConfig = parseSavedVideoConfig(group)
  const savedModel = typeof savedConfig.videoModel === 'string' ? savedConfig.videoModel : null
  const videoModel = group.videoModel || savedModel || defaultVideoModel
  const savedGenerationOptions = savedConfig.generationOptions as Record<string, unknown> | undefined
  const embeddedDialogue = draftMetadata?.embeddedDialogue ?? ''
  return {
    title: group.title || buildDefaultTitle((group.templateKey || 'grid-9') as NovelPromotionShotGroupTemplateKey),
    templateKey: (group.templateKey || 'grid-9') as NovelPromotionShotGroupTemplateKey,
    groupPrompt: group.groupPrompt || '',
    videoPrompt: group.videoPrompt || '',
    dialogueText: draftMetadata?.dialogueOverrideText ?? embeddedDialogue,
    embeddedDialogue,
    mode: resolveShotGroupModeForModel({
      mode: group.videoMode ?? savedConfig.mode,
      omniReferenceEnabled: group.omniReferenceEnabled,
      smartMultiFrameEnabled: group.smartMultiFrameEnabled,
      modelKey: videoModel,
    }),
    generationOptions: {
      ...readShotGroupCapabilitySelection(capabilityOverrides, videoModel),
      ...((savedGenerationOptions && typeof savedGenerationOptions === 'object' && !Array.isArray(savedGenerationOptions))
        ? Object.fromEntries(
          Object.entries(savedGenerationOptions).filter(([, value]) =>
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
          ),
        )
        : {}),
      ...(typeof savedConfig.generateAudio === 'boolean'
        ? { generateAudio: savedConfig.generateAudio }
        : {}),
    },
    includeDialogue: Boolean(group.includeDialogue),
    dialogueLanguage: normalizeDialogueLanguage(group.dialogueLanguage),
    videoModel,
    pendingCompositeFile: null,
  }
}

export function resolveShotGroupDialogueHelperText(draft: Pick<VideoDraftState, 'embeddedDialogue'>) {
  return draft.embeddedDialogue.trim() ? SEEDED_DIALOGUE_HELPER_TEXT : EMPTY_DIALOGUE_HELPER_TEXT
}

export function resolveShotGroupDialogueOverrideText(params: {
  dialogueText: string
  embeddedDialogue: string | null | undefined
}) {
  const normalizedDialogueText = params.dialogueText.trim()
  const normalizedEmbeddedDialogue = params.embeddedDialogue?.trim() || ''

  if (!normalizedDialogueText) return null
  if (normalizedDialogueText === normalizedEmbeddedDialogue) return null
  return normalizedDialogueText
}

export function buildShotGroupVideoDraftMetadataPatch(params: {
  draft: Pick<VideoDraftState, 'dialogueText' | 'embeddedDialogue'>
  group: Pick<NovelPromotionShotGroup, 'videoReferencesJson'>
}) {
  const currentDraftMetadata = parseShotGroupDraftMetadata(params.group.videoReferencesJson)
  if (!currentDraftMetadata) return null

  return {
    dialogueOverrideText: resolveShotGroupDialogueOverrideText({
      dialogueText: params.draft.dialogueText,
      embeddedDialogue: params.draft.embeddedDialogue,
    }),
  } satisfies Partial<ShotGroupDraftMetadata>
}

function resolveMutationError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function buildPendingFilePreview(file: File | null) {
  if (!file) return null
  return URL.createObjectURL(file)
}

function pickLocationImageUrl(location: Location) {
  const selectedImage = location.selectedImageId
    ? location.images?.find((image) => image.id === location.selectedImageId)
    : location.images?.find((image) => image.isSelected) || location.images?.find((image) => image.imageUrl) || location.images?.[0]
  return selectedImage?.imageUrl ?? null
}

function pickCharacterImageUrl(character: Character) {
  const primaryAppearance = character.appearances?.find((appearance) => appearance.selectedIndex !== null)
    || character.appearances?.find((appearance) => appearance.imageUrl)
    || character.appearances?.[0]
  return primaryAppearance?.imageUrl ?? null
}

function pickPropImageUrl(prop: Prop) {
  const selectedImage = prop.selectedImageId
    ? prop.images?.find((image) => image.id === prop.selectedImageId)
    : prop.images?.find((image) => image.isSelected) || prop.images?.find((image) => image.imageUrl) || prop.images?.[0]
  return selectedImage?.imageUrl ?? null
}

function toLocationAssetReference(location: Location): ShotGroupAssetBindingReference {
  return {
    assetType: 'location',
    source: 'manual',
    assetId: location.id,
    label: location.name,
    imageUrl: pickLocationImageUrl(location),
  }
}

function toCharacterAssetReference(character: Character): ShotGroupAssetBindingReference {
  return {
    assetType: 'character',
    source: 'manual',
    assetId: character.id,
    label: character.name,
    imageUrl: pickCharacterImageUrl(character),
  }
}

function toPropAssetReference(prop: Prop): ShotGroupAssetBindingReference {
  return {
    assetType: 'prop',
    source: 'manual',
    assetId: prop.id,
    label: prop.name,
    imageUrl: pickPropImageUrl(prop),
  }
}

function createReviewDraft(group: NovelPromotionShotGroup): ReviewDraftState {
  const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
  return {
    templateKey: (group.templateKey || 'grid-9') as NovelPromotionShotGroupTemplateKey,
    referencePromptText: draftMetadata?.referencePromptText ?? draftMetadata?.narrativePrompt ?? '',
    compositePromptText: draftMetadata?.compositePromptText
      ?? group.videoPrompt?.trim()
      ?? group.groupPrompt?.trim()
      ?? draftMetadata?.narrativePrompt
      ?? '',
    storyboardModeId: draftMetadata?.storyboardModeId ?? DEFAULT_STORYBOARD_MODE_ID,
    selectedLocationAsset: draftMetadata?.selectedLocationAsset ?? null,
    selectedCharacterAssets: draftMetadata?.selectedCharacterAssets ?? [],
    selectedPropAssets: draftMetadata?.selectedPropAssets ?? [],
    storyboardMoodPresetId: draftMetadata?.storyboardMoodPresetId ?? '',
    customMood: draftMetadata?.customMood ?? '',
  }
}

export function syncReviewDraftsFromShotGroups(
  previous: Record<string, ReviewDraftState>,
  groups: NovelPromotionShotGroup[],
) {
  let changed = false
  const next: Record<string, ReviewDraftState> = {}

  for (const group of groups) {
    const seededDraft = createReviewDraft(group)
    const previousDraft = previous[group.id]
    const resolvedDraft = areReviewDraftsEqual(previousDraft, seededDraft)
      ? (previousDraft ?? seededDraft)
      : seededDraft

    next[group.id] = resolvedDraft

    if (!areReviewDraftsEqual(previousDraft, resolvedDraft)) {
      changed = true
    }
  }

  if (!changed && Object.keys(previous).length !== groups.length) {
    changed = true
  }

  return changed ? next : previous
}

function sourceBadgeLabel(source: ShotGroupAssetBindingReference['source']) {
  if (source === 'manual') return '手动覆盖'
  if (source === 'preselected') return '系统预选'
  return '剧本回退'
}

function renderBindingSummary(assets: ShotGroupAssetBindingReference[] | undefined | null, emptyLabel: string) {
  if (!assets || assets.length === 0) return emptyLabel
  return assets.map((asset) => `${asset.label}（${sourceBadgeLabel(asset.source)}）`).join('、')
}

function readStoryboardModesFromBrowser() {
  if (typeof window === 'undefined') return createDefaultStoryboardModeSettings()
  try {
    const rawValue = window.localStorage.getItem(STORYBOARD_MODE_STORAGE_KEY)
    if (!rawValue) return createDefaultStoryboardModeSettings()
    return normalizeStoryboardModeSettings(JSON.parse(rawValue) as Partial<ShotGroupStoryboardModeSettings>)
  } catch {
    return createDefaultStoryboardModeSettings()
  }
}

function resolveInheritedMoodPresetId(
  episodeDefaultMoodPresetId?: string | null,
  projectDefaultMoodPresetId?: string | null,
) {
  return episodeDefaultMoodPresetId || projectDefaultMoodPresetId || null
}

export function buildReviewDraftMetadata(
  group: NovelPromotionShotGroup,
  draft: ReviewDraftState,
  storyboardModes?: Partial<ShotGroupStoryboardModeSettings> | null,
  inheritedMoodPresetId?: string | null,
): ShotGroupDraftMetadata | null {
  const currentMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
  if (!currentMetadata) return null
  const selectedStoryboardMode = resolveStoryboardModeDefinition(storyboardModes, draft.storyboardModeId)

  return normalizeShotGroupDraftMetadata({
    ...currentMetadata,
    referencePromptText: draft.referencePromptText.trim() || null,
    compositePromptText: draft.compositePromptText.trim() || null,
    storyboardModeId: selectedStoryboardMode.id,
    storyboardModeLabel: selectedStoryboardMode.label,
    storyboardModePromptText: selectedStoryboardMode.promptText,
    selectedLocationAsset: draft.selectedLocationAsset,
    selectedCharacterAssets: draft.selectedCharacterAssets,
    selectedPropAssets: draft.selectedPropAssets,
    storyboardMoodPresetId: draft.storyboardMoodPresetId || inheritedMoodPresetId || null,
    customMood: draft.customMood.trim() || null,
  }, currentMetadata)
}

function resolveMoodPresetLabel(presets: StoryboardMoodPreset[], presetId: string | null | undefined) {
  if (!presetId) return '未设置'
  return presets.find((preset) => preset.id === presetId)?.label || '未设置'
}

export function buildReviewSavePayload(
  group: NovelPromotionShotGroup,
  draft: ReviewDraftState,
  storyboardModes?: Partial<ShotGroupStoryboardModeSettings> | null,
  inheritedMoodPresetId?: string | null,
) {
  const draftMetadata = buildReviewDraftMetadata(group, draft, storyboardModes, inheritedMoodPresetId)
  return {
    shotGroupId: group.id,
    templateKey: draft.templateKey,
    groupPrompt: draft.compositePromptText.trim() || null,
    videoPrompt: draft.compositePromptText.trim() || null,
    draftMetadata,
  }
}

function ShotGroupVideoReviewSection({
  projectId,
  episodeId,
  shotGroups = [],
  storyboardMoodPresets = [],
  projectDefaultMoodPresetId = null,
  episodeDefaultMoodPresetId = null,
}: Pick<ShotGroupVideoSectionProps, 'projectId' | 'episodeId' | 'shotGroups' | 'storyboardMoodPresets' | 'projectDefaultMoodPresetId' | 'episodeDefaultMoodPresetId'>) {
  const { data: projectAssets } = useProjectAssets(projectId)
  const updateMutation = useUpdateProjectShotGroup(projectId, episodeId)
  const uploadMutation = useUploadProjectShotGroupReferenceImage(projectId, episodeId)
  const generateMutation = useGenerateProjectShotGroupImage(projectId, episodeId)
  const referenceFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const compositeFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraftState>>({})
  const [storyboardModeSettings, setStoryboardModeSettings] = useState<ShotGroupStoryboardModeSettings>(() => createDefaultStoryboardModeSettings())
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [editingAssetGroupId, setEditingAssetGroupId] = useState<string | null>(null)
  const [promptViewer, setPromptViewer] = useState<{ title: string; prompt: string } | null>(null)
  const visibleShotGroups = useMemo(() => (
    shotGroups.filter((group) => {
      const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
      return group.groupPrompt?.trim() || group.videoPrompt?.trim() || draftMetadata
    })
  ), [shotGroups])

  useEffect(() => {
    setReviewDrafts((previous) => syncReviewDraftsFromShotGroups(previous, visibleShotGroups))
  }, [visibleShotGroups])

  useEffect(() => {
    const syncStoryboardModes = () => {
      setStoryboardModeSettings(readStoryboardModesFromBrowser())
    }

    syncStoryboardModes()
    if (typeof window === 'undefined') return

    window.addEventListener('storage', syncStoryboardModes)
    window.addEventListener(STORYBOARD_MODE_STORAGE_EVENT, syncStoryboardModes)
    return () => {
      window.removeEventListener('storage', syncStoryboardModes)
      window.removeEventListener(STORYBOARD_MODE_STORAGE_EVENT, syncStoryboardModes)
    }
  }, [])

  const updateReviewDraft = (groupId: string, updater: (current: ReviewDraftState) => ReviewDraftState) => {
    setReviewDrafts((previous) => ({
      ...previous,
      [groupId]: updater(previous[groupId] ?? {
        templateKey: 'grid-9',
        selectedLocationAsset: null,
        referencePromptText: '',
        compositePromptText: '',
        storyboardModeId: storyboardModeSettings.defaultModeId || DEFAULT_STORYBOARD_MODE_ID,
        selectedCharacterAssets: [],
        selectedPropAssets: [],
        storyboardMoodPresetId: '',
        customMood: '',
      }),
    }))
  }

  const persistReviewDraft = async (group: NovelPromotionShotGroup, draftOverride?: ReviewDraftState) => {
    const inheritedMoodPresetId = resolveInheritedMoodPresetId(
      episodeDefaultMoodPresetId,
      projectDefaultMoodPresetId,
    )
    const payload = buildReviewSavePayload(
      group,
      draftOverride ?? reviewDrafts[group.id] ?? createReviewDraft(group),
      storyboardModeSettings,
      inheritedMoodPresetId,
    )
    if (!payload.draftMetadata) return
    setSavingGroupId(group.id)
    try {
      await updateMutation.mutateAsync(payload)
    } finally {
      setSavingGroupId((current) => (current === group.id ? null : current))
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/75 p-4 space-y-4">
      <div className="rounded-3xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/40 p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--glass-tone-info-fg)]">
            多镜头确认
          </p>
          <h3 className="text-xl font-semibold text-[var(--glass-text-primary)]">
            草稿创建已完成，视频生成尚未开始
          </h3>
          <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">
            这些片段草稿来自当前剧集的片段结构。每个片段都是一个 15 秒视频生成单元，最多承载 9 个镜头；进入 videos 前，逐段确认组提示词、资产引用、辅助参考图和分镜参考表。
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            '草稿创建已完成，当前只做确认，不会自动开跑视频。',
            '每段都保留可直接编辑的组提示词，用于后续生成分镜参考表。',
            '辅助参考图作为母图，优先承接人物、场景、物品和场景氛围约束。',
            '分镜参考表会依据母图和组提示词继续生成，供 videos 阶段直接使用。',
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-3 text-xs leading-5 text-[var(--glass-text-secondary)]"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      {visibleShotGroups.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleShotGroups.map((group, index) => {
            const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
            const reviewDraft = reviewDrafts[group.id] ?? createReviewDraft(group)
            const selectedStoryboardMode = resolveStoryboardModeDefinition(storyboardModeSettings, reviewDraft.storyboardModeId)
            const inheritedMoodPresetId = resolveInheritedMoodPresetId(
              episodeDefaultMoodPresetId,
              projectDefaultMoodPresetId,
            )
            const liveDraftMetadata = buildReviewDraftMetadata(
              group,
              reviewDraft,
              storyboardModeSettings,
              inheritedMoodPresetId,
            ) ?? draftMetadata
            const hasAuxReference = Boolean(group.referenceImageUrl)
            const hasStoryboardBoard = Boolean(group.compositeImageUrl)
            const hasReference = hasAuxReference || hasStoryboardBoard
            const isPlaceholder = draftMetadata?.sourceStatus === 'placeholder'
            const isSavingReviewDraft = savingGroupId === group.id || updateMutation.isPending
            const isUploadingReference = uploadMutation.isPending && uploadMutation.variables?.shotGroupId === group.id
            const isGeneratingReference = generateMutation.isPending
              && generateMutation.variables?.shotGroupId === group.id
              && generateMutation.variables?.targetField === 'reference'
            const isGeneratingBoard = generateMutation.isPending
              && generateMutation.variables?.shotGroupId === group.id
              && (generateMutation.variables?.targetField === undefined || generateMutation.variables?.targetField === 'composite')
            const locationValue = reviewDraft.selectedLocationAsset?.assetId || ''
            const selectedCharacterIds = new Set(reviewDraft.selectedCharacterAssets.map((asset) => asset.assetId).filter(Boolean))
            const selectedPropIds = new Set(reviewDraft.selectedPropAssets.map((asset) => asset.assetId).filter(Boolean))
            const effectiveWarnings = liveDraftMetadata?.missingAssetWarnings ?? []
            const effectiveMoodPresetId = reviewDraft.storyboardMoodPresetId || inheritedMoodPresetId

            return (
              <article
                key={group.id}
                className="rounded-3xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[var(--glass-tone-info-bg)] px-2 py-1 text-xs text-[var(--glass-tone-info-fg)]">
                        片段 {draftMetadata?.segmentOrder || index + 1}
                      </span>
                      <span className="rounded-lg bg-[var(--glass-bg-muted)] px-2 py-1 text-xs text-[var(--glass-text-secondary)]">
                        15 秒视频生成单元
                      </span>
                      <span className="rounded-lg bg-[var(--glass-bg-muted)] px-2 py-1 text-xs text-[var(--glass-text-secondary)]">
                        最多 9 个镜头
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-[var(--glass-text-primary)]">
                      {group.title || `片段 ${index + 1}`}
                    </h4>
                    <p className="text-xs text-[var(--glass-text-tertiary)]">
                      场景：{draftMetadata?.sceneLabel || '待补充'} · 槽位 {(group.items || []).length || draftMetadata?.expectedShotCount || 0} 个
                    </p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium',
                      hasReference
                        ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                        : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]',
                    ].join(' ')}
                  >
                    {hasStoryboardBoard ? '参考表已就绪，可继续确认' : '参考未确认，需先补齐'}
                  </span>
                </div>

                {isPlaceholder ? (
                  <div className="rounded-2xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)]/70 px-3 py-3 text-sm leading-6 text-[var(--glass-tone-warning-fg)]">
                    该片段槽位已预留，但提示词/参考输入仍不完整。请先修复后再进入视频生成。
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                    <div className="mb-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)] md:items-start">
                      <label className="space-y-2">
                        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">分镜表模板</span>
                        <select
                          value={reviewDraft.templateKey}
                          onChange={(event) => updateReviewDraft(group.id, (current) => ({
                            ...current,
                            templateKey: event.target.value as NovelPromotionShotGroupTemplateKey,
                          }))}
                          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                        >
                          {TEMPLATE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs leading-5 text-[var(--glass-text-tertiary)]">
                        当前模板决定最终输出是 `2×2 / 3×2 / 3×3`。默认建议保持 `9 格`，这样才能与“经典九宫格”等分镜模式保持一致，仅靠提示词里的“3×3 / 9 个分镜”不能覆盖底层模板设置。
                      </div>
                    </div>
                    <div className="text-xs font-medium text-[var(--glass-text-secondary)]">辅助参考图提示词</div>
                    <textarea
                      value={reviewDraft.referencePromptText}
                      onChange={(event) => updateReviewDraft(group.id, (current) => ({
                        ...current,
                        referencePromptText: event.target.value,
                      }))}
                      rows={6}
                      placeholder="输入用于生成辅助参考图（母图）的提示词。"
                      className="mt-2 w-full resize-y rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-3 text-sm leading-6 text-[var(--glass-text-primary)] outline-none"
                    />
                    <div className="mt-2 text-xs text-[var(--glass-text-tertiary)]">
                      这段提示词只用于生成辅助参考图（母图），用来锁定人物、场景、物品和整体气氛。
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                      <label className="space-y-2">
                        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">分镜模式</span>
                        <select
                          value={selectedStoryboardMode.id}
                          onChange={(event) => updateReviewDraft(group.id, (current) => ({
                            ...current,
                            storyboardModeId: event.target.value,
                          }))}
                          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                        >
                          {storyboardModeSettings.modes.map((mode) => (
                            <option key={mode.id} value={mode.id}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs leading-5 text-[var(--glass-text-tertiary)]">
                        <div className="font-medium text-[var(--glass-text-secondary)]">{selectedStoryboardMode.label}</div>
                        <div className="mt-1 line-clamp-5 whitespace-pre-wrap">
                          {selectedStoryboardMode.promptText}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs font-medium text-[var(--glass-text-secondary)]">剧情内容</div>
                    <textarea
                      value={reviewDraft.compositePromptText}
                      onChange={(event) => updateReviewDraft(group.id, (current) => ({
                        ...current,
                        compositePromptText: event.target.value,
                      }))}
                      rows={6}
                      placeholder="输入这一段片段真正发生的剧情内容。"
                      className="mt-2 w-full resize-y rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-3 text-sm leading-6 text-[var(--glass-text-primary)] outline-none"
                    />
                    <div className="mt-2 text-xs text-[var(--glass-text-tertiary)]">
                      生成分镜参考表时，系统会自动把“分镜模式提示词”与这里的“剧情内容”拼接后再提交。剧情相关文本会保持干净，便于后续在 videos 阶段复用。
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/75 p-3 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                      <span className="text-xs font-medium text-[var(--glass-text-secondary)]">场景</span>
                      <select
                        value={locationValue}
                        onChange={(event) => {
                          const nextLocation = projectAssets?.locations.find((item) => item.id === event.target.value) || null
                          updateReviewDraft(group.id, (current) => ({
                            ...current,
                            selectedLocationAsset: nextLocation ? toLocationAssetReference(nextLocation) : null,
                          }))
                        }}
                        className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                      >
                        <option value="">跟随系统预选 / 剧本回退</option>
                        {(projectAssets?.locations ?? []).map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        当前：{renderBindingSummary(liveDraftMetadata?.effectiveLocationAsset ? [liveDraftMetadata.effectiveLocationAsset] : [], '未绑定场景，可继续生成')}
                      </div>
                    </label>

                    <label className="space-y-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                      <span className="text-xs font-medium text-[var(--glass-text-secondary)]">分镜氛围预设</span>
                      <select
                        value={effectiveMoodPresetId || ''}
                        onChange={(event) => updateReviewDraft(group.id, (current) => ({
                          ...current,
                          storyboardMoodPresetId: event.target.value,
                        }))}
                        className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                      >
                        <option value="">
                          {effectiveMoodPresetId
                            ? `跟随默认氛围预设（${resolveMoodPresetLabel(storyboardMoodPresets, effectiveMoodPresetId)}）`
                            : '跟随默认氛围预设 / 不设置'}
                        </option>
                        {storyboardMoodPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={reviewDraft.customMood}
                        onChange={(event) => updateReviewDraft(group.id, (current) => ({
                          ...current,
                          customMood: event.target.value,
                        }))}
                        placeholder="自定义氛围，例如：潮湿压迫、霓虹冷光、空气紧绷"
                        className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                      />
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        当前：{reviewDraft.storyboardMoodPresetId
                          ? `手动设置为 ${resolveMoodPresetLabel(storyboardMoodPresets, reviewDraft.storyboardMoodPresetId)}`
                          : effectiveMoodPresetId
                            ? `跟随默认氛围预设 ${resolveMoodPresetLabel(storyboardMoodPresets, effectiveMoodPresetId)}`
                            : '未设置氛围预设'}
                      </div>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">角色</span>
                        <span className="text-[11px] text-[var(--glass-text-tertiary)]">手动选择会覆盖系统预选</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(projectAssets?.characters ?? []).map((character) => {
                          const isSelected = selectedCharacterIds.has(character.id)
                          return (
                            <button
                              key={character.id}
                              type="button"
                              onClick={() => updateReviewDraft(group.id, (current) => ({
                                ...current,
                                selectedCharacterAssets: isSelected
                                  ? current.selectedCharacterAssets.filter((asset) => asset.assetId !== character.id)
                                  : [...current.selectedCharacterAssets, toCharacterAssetReference(character)],
                              }))}
                              className={[
                                'rounded-full border px-3 py-1.5 text-xs transition',
                                isSelected
                                  ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/70 text-[var(--glass-tone-info-fg)]'
                                  : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]',
                              ].join(' ')}
                            >
                              {character.name}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        当前：{renderBindingSummary(liveDraftMetadata?.effectiveCharacterAssets, '未绑定角色，可继续生成')}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">物品</span>
                        <span className="text-[11px] text-[var(--glass-text-tertiary)]">缺失时仍允许继续生成</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(projectAssets?.props ?? []).map((prop) => {
                          const isSelected = selectedPropIds.has(prop.id)
                          return (
                            <button
                              key={prop.id}
                              type="button"
                              onClick={() => updateReviewDraft(group.id, (current) => ({
                                ...current,
                                selectedPropAssets: isSelected
                                  ? current.selectedPropAssets.filter((asset) => asset.assetId !== prop.id)
                                  : [...current.selectedPropAssets, toPropAssetReference(prop)],
                              }))}
                              className={[
                                'rounded-full border px-3 py-1.5 text-xs transition',
                                isSelected
                                  ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/70 text-[var(--glass-tone-info-fg)]'
                                  : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]',
                              ].join(' ')}
                            >
                              {prop.name}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        当前：{renderBindingSummary(liveDraftMetadata?.effectivePropAssets, '未绑定物品，可继续生成')}
                      </div>
                    </div>
                  </div>

                  {effectiveWarnings.length > 0 ? (
                    <div className="rounded-2xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)]/70 px-3 py-3 text-sm leading-6 text-[var(--glass-tone-warning-fg)]">
                      缺少 {effectiveWarnings.map((warning) => warning.assetType === 'location' ? '场景' : warning.assetType === 'character' ? '角色' : '物品').join('、')} 绑定，当前卡片仍可继续生成。
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-[var(--glass-text-primary)]">参考确认</div>
                      <div className="text-xs text-[var(--glass-text-tertiary)]">
                        先确认或替换参考图/参考板，再继续进入 videos。
                      </div>
                    </div>
                    <div className="text-xs text-[var(--glass-text-tertiary)]">
                      当前：{hasReference ? '已存在参考图或参考板' : '还没有确认参考图'}
                    </div>
                  </div>
                  <input
                    ref={(node) => {
                      referenceFileInputRefs.current[group.id] = node
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      void (async () => {
                        await persistReviewDraft(group)
                        uploadMutation.mutate({
                          file,
                          shotGroupId: group.id,
                          labelText: group.title || `片段 ${index + 1} 参考图`,
                          targetField: 'reference',
                        })
                      })()
                      event.currentTarget.value = ''
                    }}
                  />
                  <input
                    ref={(node) => {
                      compositeFileInputRefs.current[group.id] = node
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      void (async () => {
                        await persistReviewDraft(group)
                        uploadMutation.mutate({
                          file,
                          shotGroupId: group.id,
                          labelText: group.title || `片段 ${index + 1} 分镜参考表`,
                          targetField: 'composite',
                        })
                      })()
                      event.currentTarget.value = ''
                    }}
                  />
                  <div className="grid gap-3 lg:grid-cols-2">
                    {[
                      {
                        key: 'reference',
                        title: '辅助参考图',
                        helper: '母图会综合人物、场景、物品和当前片段的大致内容，用作后续生成分镜参考表的基础参考。',
                        imageUrl: group.referenceImageUrl,
                        emptyLabel: '还没有辅助参考图',
                        uploadLabel: hasAuxReference ? '替换辅助参考图' : '上传辅助参考图',
                        onUpload: () => referenceFileInputRefs.current[group.id]?.click(),
                        onOpen: () => {
                          if (typeof window !== 'undefined' && group.referenceImageUrl) {
                            window.open(group.referenceImageUrl, '_blank', 'noopener,noreferrer')
                          }
                        },
                        onRemove: () => updateMutation.mutateAsync({
                          shotGroupId: group.id,
                          referenceImageUrl: null,
                        }),
                      },
                      {
                        key: 'composite',
                        title: '分镜参考表',
                        helper: '九宫格分镜图会依据母图和组提示词生成，作为 videos 阶段的多镜头片段视觉输入。',
                        imageUrl: group.compositeImageUrl,
                        emptyLabel: '还没有分镜参考表',
                        uploadLabel: hasStoryboardBoard ? '替换分镜参考表' : '上传分镜参考表',
                        onUpload: () => compositeFileInputRefs.current[group.id]?.click(),
                        onOpen: () => {
                          if (typeof window !== 'undefined' && group.compositeImageUrl) {
                            window.open(group.compositeImageUrl, '_blank', 'noopener,noreferrer')
                          }
                        },
                        onRemove: () => updateMutation.mutateAsync({
                          shotGroupId: group.id,
                          compositeImageUrl: null,
                        }),
                      },
                    ].map((panel) => (
                      <div
                        key={panel.key}
                        className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-3"
                      >
                        <div className="mb-3">
                          <div className="text-sm font-medium text-[var(--glass-text-primary)]">{panel.title}</div>
                          <div className="mt-1 text-xs leading-5 text-[var(--glass-text-tertiary)]">{panel.helper}</div>
                        </div>
                        <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                          {panel.imageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={panel.imageUrl}
                                alt={`${group.title || `片段 ${index + 1}`} ${panel.title}`}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 flex flex-wrap content-start gap-2 bg-black/55 p-3 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={panel.onOpen}
                                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white"
                                >
                                  查看大图
                                </button>
                                {panel.key === 'composite' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void (async () => {
                                        await persistReviewDraft(group)
                                        generateMutation.mutate({ shotGroupId: group.id })
                                      })()
                                    }}
                                    className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white"
                                  >
                                    重新生成
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={panel.onUpload}
                                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white"
                                >
                                  替换上传
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingAssetGroupId(group.id)}
                                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white"
                                >
                                  编辑资产引用
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void panel.onRemove()
                                  }}
                                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white"
                                >
                                  移除当前引用
                                </button>
                              </div>
                              {((panel.key === 'reference' && isGeneratingReference) || (panel.key === 'composite' && isGeneratingBoard)) ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
                                  <div className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-sm font-medium text-white">
                                    {panel.key === 'reference' ? '正在重新生成辅助参考图...' : '正在重新生成分镜参考表...'}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--glass-text-tertiary)]">
                              {(panel.key === 'reference' && isGeneratingReference) || (panel.key === 'composite' && isGeneratingBoard)
                                ? (panel.key === 'reference' ? '正在生成辅助参考图...' : '正在生成分镜参考表...')
                                : panel.emptyLabel}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={panel.onUpload}
                            disabled={isUploadingReference || isGeneratingReference || isGeneratingBoard || isSavingReviewDraft}
                            className="inline-flex items-center justify-center rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-xs font-medium text-[var(--glass-text-primary)]"
                          >
                            {panel.uploadLabel}
                          </button>
                          {panel.key === 'reference' ? (
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  await persistReviewDraft(group)
                                  generateMutation.mutate({ shotGroupId: group.id, targetField: 'reference' })
                                })()
                              }}
                              disabled={isUploadingReference || isGeneratingReference || isGeneratingBoard || isSavingReviewDraft}
                              className="inline-flex items-center justify-center rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-xs font-medium text-[var(--glass-text-primary)]"
                            >
                              {isGeneratingReference ? '处理中...' : hasAuxReference ? '重新生成辅助参考图' : '生成辅助参考图'}
                            </button>
                          ) : null}
                          {panel.key === 'composite' ? (
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  await persistReviewDraft(group)
                                  generateMutation.mutate({ shotGroupId: group.id, targetField: 'composite' })
                                })()
                              }}
                              disabled={!hasAuxReference || isUploadingReference || isGeneratingReference || isGeneratingBoard || isSavingReviewDraft}
                              className="inline-flex items-center justify-center rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-xs font-medium text-[var(--glass-text-primary)]"
                            >
                              {isGeneratingBoard ? '处理中...' : hasStoryboardBoard ? '重新生成分镜参考表' : '生成分镜参考表'}
                            </button>
                          ) : null}
                        </div>
                        {((panel.key === 'reference'
                          ? draftMetadata?.submittedReferencePrompt
                          : draftMetadata?.submittedCompositePrompt)) ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setPromptViewer({
                                  title: panel.key === 'reference' ? '辅助参考图最终提示词' : '分镜参考表最终提示词',
                                  prompt: panel.key === 'reference'
                                    ? (draftMetadata?.submittedReferencePrompt || '')
                                    : (draftMetadata?.submittedCompositePrompt || ''),
                                })}
                                className="text-xs font-medium text-[var(--glass-tone-info-fg)] underline underline-offset-4"
                              >
                                显示提示词
                              </button>
                            </div>
                          ) : null}
                        {panel.key === 'composite' && !hasAuxReference ? (
                          <div className="mt-2 text-xs leading-5 text-[var(--glass-tone-warning-fg)]">
                            请先上传或生成辅助参考图。当前分镜参考表生成链路会把辅助参考图作为唯一图像参考输入；没有母图时，角色身份、画风和镜头布局都容易失控。
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void persistReviewDraft(group)
                      }}
                      disabled={isSavingReviewDraft}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs font-medium text-[var(--glass-text-secondary)]"
                    >
                      {isSavingReviewDraft ? '保存中...' : '保存片段设置'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAssetGroupId((current) => current === group.id ? null : group.id)}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs font-medium text-[var(--glass-text-secondary)]"
                    >
                      {editingAssetGroupId === group.id ? '收起资产引用' : '编辑资产引用'}
                    </button>
                  </div>
                  {editingAssetGroupId === group.id ? (
                    <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-3 text-xs leading-6 text-[var(--glass-text-secondary)]">
                      你可以在上方直接调整场景、角色、物品、分镜氛围预设和自定义氛围。保存后，这些资产引用会沿用到后续参考板生成。
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/60 px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">
          当前还没有可确认的多镜头片段草稿。
        </div>
      )}

      <GlassModalShell
        open={Boolean(promptViewer)}
        onClose={() => setPromptViewer(null)}
        title={promptViewer?.title}
        description="这里展示的是系统最终提交给模型的完整提示词，便于排查和调整。"
        size="lg"
      >
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-4 text-xs leading-6 text-[var(--glass-text-primary)]">
          {promptViewer?.prompt || ''}
        </pre>
      </GlassModalShell>
    </section>
  )
}

function buildShotGroupPayload(draft: VideoDraftState, episodeId?: string) {
  const effectivePrompt = draft.videoPrompt.trim() || draft.groupPrompt.trim() || null
  const dialogueOverrideText = resolveShotGroupDialogueOverrideText({
    dialogueText: draft.dialogueText,
    embeddedDialogue: draft.embeddedDialogue,
  })
  const generateAudio = typeof draft.generationOptions.generateAudio === 'boolean'
    ? draft.generationOptions.generateAudio
    : false
  return {
    ...(episodeId ? { episodeId } : {}),
    title: draft.title.trim() || buildDefaultTitle(draft.templateKey),
    templateKey: draft.templateKey,
    groupPrompt: effectivePrompt,
    videoPrompt: effectivePrompt,
    generateAudio,
    includeDialogue: Boolean(dialogueOverrideText || draft.embeddedDialogue.trim() || draft.includeDialogue),
    dialogueLanguage: draft.dialogueLanguage,
    mode: draft.mode,
    videoModel: draft.videoModel || null,
    generationOptions: draft.generationOptions,
  }
}

function getDraftMissingCapabilityFields(params: {
  draft: VideoDraftState
  resolvedVideoModelOptions: VideoModelOption[]
  capabilityOverrides?: CapabilitySelections
}) {
  const selectedVideoModelOption = params.resolvedVideoModelOptions.find((option) => option.value === params.draft.videoModel)
  const pricingTiers = projectVideoPricingTiersByFixedSelections({
    tiers: selectedVideoModelOption?.videoPricingTiers ?? [],
    fixedSelections: { generationMode: 'normal' },
  })
  const capabilityDefinitions = resolveEffectiveVideoCapabilityDefinitions({
    videoCapabilities: selectedVideoModelOption?.capabilities?.video,
    pricingTiers,
  })
  const capabilityFields = resolveEffectiveVideoCapabilityFields({
    definitions: capabilityDefinitions,
    pricingTiers,
    selection: {
      ...readShotGroupCapabilitySelection(params.capabilityOverrides, params.draft.videoModel),
      ...params.draft.generationOptions,
    },
  })
  return capabilityFields
    .filter((field) => SHOT_GROUP_VISIBLE_CAPABILITY_FIELDS.has(field.field))
    .filter((field) => field.options.length === 0 || field.value === undefined)
    .map((field) => field.field)
}

function renderVideoConfigFields(params: {
  draft: VideoDraftState
  resolvedVideoModelOptions: VideoModelOption[]
  capabilityOverrides?: CapabilitySelections
  onChange: (updater: (draft: VideoDraftState) => VideoDraftState) => void
}) {
  const { draft, resolvedVideoModelOptions, capabilityOverrides, onChange } = params
  const selectedVideoModelOption = resolvedVideoModelOptions.find((option) => option.value === draft.videoModel)
    || resolvedVideoModelOptions[0]
  const pricingTiers = projectVideoPricingTiersByFixedSelections({
    tiers: selectedVideoModelOption?.videoPricingTiers ?? [],
    fixedSelections: {
      generationMode: 'normal',
    },
  })
  const capabilityDefinitions = resolveEffectiveVideoCapabilityDefinitions({
    videoCapabilities: selectedVideoModelOption?.capabilities?.video,
    pricingTiers,
  })
  const normalizedGenerationOptions = normalizeVideoGenerationSelections({
    definitions: capabilityDefinitions,
    pricingTiers,
    selection: {
      ...readShotGroupCapabilitySelection(capabilityOverrides, selectedVideoModelOption?.value || ''),
      ...draft.generationOptions,
    },
  })
  const capabilityFields = resolveEffectiveVideoCapabilityFields({
    definitions: capabilityDefinitions,
    pricingTiers,
    selection: normalizedGenerationOptions,
  }).filter((field) => SHOT_GROUP_VISIBLE_CAPABILITY_FIELDS.has(field.field))
  const missingCapabilityFields = capabilityFields
    .filter((field) => field.options.length === 0 || field.value === undefined)
    .map((field) => field.field)
  const supportsAdvancedReferenceModes = supportsShotGroupMultiReferenceModes(selectedVideoModelOption?.value || draft.videoModel)

  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-[var(--glass-text-primary)]">高级生成参数</div>
        <div className="text-xs text-[var(--glass-text-tertiary)]">
          这里直接复用单镜头视频的模型能力配置方式。核心参数统一收敛为时长、分辨率和音频开关。
        </div>
      </div>

      <label className="space-y-1 text-sm text-[var(--glass-text-secondary)] block">
        <span>视频提示词</span>
        <textarea
          value={draft.videoPrompt}
          onChange={(event) => onChange((current) => ({ ...current, videoPrompt: event.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
          placeholder="例如：镜头从全景慢慢推入角色，动作和情绪连续，空间关系清晰，电影感稳定。"
        />
      </label>

      <label className="space-y-1 text-sm text-[var(--glass-text-secondary)] block">
        <span>台词 / 说话内容</span>
        <textarea
          value={draft.dialogueText}
          onChange={(event) => onChange((current) => ({ ...current, dialogueText: event.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
          placeholder="例如：角色低声说“先别回头”，或留空以沿用默认语音内容。"
        />
        <p className="text-xs text-[var(--glass-text-tertiary)]">
          {resolveShotGroupDialogueHelperText(draft)}
        </p>
      </label>

      <div className="space-y-3 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
        <div className="text-sm font-medium text-[var(--glass-text-primary)]">视频模型</div>
        <ModelCapabilityDropdown
          compact
          models={resolvedVideoModelOptions}
          value={selectedVideoModelOption?.value || draft.videoModel || undefined}
          onModelChange={(modelKey) => {
            const nextOption = resolvedVideoModelOptions.find((option) => option.value === modelKey)
            const nextPricingTiers = projectVideoPricingTiersByFixedSelections({
              tiers: nextOption?.videoPricingTiers ?? [],
              fixedSelections: { generationMode: 'normal' },
            })
            const nextDefinitions = resolveEffectiveVideoCapabilityDefinitions({
              videoCapabilities: nextOption?.capabilities?.video,
              pricingTiers: nextPricingTiers,
            })
            onChange((current) => {
              const nextMode = resolveShotGroupModeForModel({
                mode: current.mode,
                modelKey,
              })
              return {
                ...current,
                videoModel: modelKey,
                mode: nextMode,
                generationOptions: normalizeVideoGenerationSelections({
                  definitions: nextDefinitions,
                  pricingTiers: nextPricingTiers,
                  selection: {
                    ...readShotGroupCapabilitySelection(capabilityOverrides, modelKey),
                    ...current.generationOptions,
                  },
                }),
              }
            })
          }}
          capabilityFields={capabilityFields.map((field) => ({
            field: field.field,
            label: toCapabilityFieldLabel(field.field),
            options: field.options,
            disabledOptions: capabilityDefinitions
              .find((definition) => definition.field === field.field)
              ?.options.filter((option) => !field.options.includes(option)),
          }))}
          capabilityOverrides={normalizedGenerationOptions}
          onCapabilityChange={(field, rawValue, sample) => {
            onChange((current) => ({
              ...current,
              generationOptions: normalizeVideoGenerationSelections({
                definitions: capabilityDefinitions,
                pricingTiers,
                selection: {
                  ...current.generationOptions,
                  [field]: parseGenerationOptionValue(rawValue, sample),
                },
                pinnedFields: [field],
              }),
            }))
          }}
          placeholder="选择视频模型"
        />
        {missingCapabilityFields.length > 0 ? (
          <div className="rounded-xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-warning-fg)]">
            当前模型还有未完成的视频能力配置：{missingCapabilityFields.join('、')}
          </div>
        ) : null}
      </div>

      {supportsAdvancedReferenceModes ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-[var(--glass-text-primary)]">参考模式</div>
          <div className="grid gap-2 md:grid-cols-2">
            {([
              {
                value: 'omni-reference',
                title: 'Omni reference mode',
                description: '默认模式，只围绕 composite storyboard 作为统一视觉参考。',
              },
              {
                value: 'smart-multi-frame',
                title: 'Smart multi-frame mode',
                description: '严格按槽位顺序推进，多帧衔接更强。',
              },
            ] as Array<{ value: ShotGroupVideoMode; title: string; description: string }>).map((option) => {
              const isSelected = draft.mode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange((current) => ({ ...current, mode: option.value }))}
                  className={[
                    'rounded-xl border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/70'
                      : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]',
                  ].join(' ')}
                >
                  <div className="text-sm font-medium text-[var(--glass-text-primary)]">{option.title}</div>
                  <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{option.description}</div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
          当前模型仅支持 composite storyboard 单参考输入，不提供 Omni reference / Smart multi-frame 切换。
        </div>
      )}

      <label className="space-y-1 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-secondary)]">
        <span>台词语言</span>
        <select
          value={draft.dialogueLanguage}
          onChange={(event) => onChange((current) => ({
            ...current,
            dialogueLanguage: event.target.value as NovelPromotionDialogueLanguage,
          }))}
          className="w-full bg-transparent text-sm text-[var(--glass-text-primary)] outline-none"
        >
          <option value="zh">中文</option>
          <option value="en">英文</option>
          <option value="ja">日文</option>
        </select>
      </label>

      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
        当前：音频 {normalizedGenerationOptions.generateAudio === true ? '开启（固定无背景音乐）' : '关闭'}；对白 {draft.dialogueText.trim() ? '已编辑' : draft.embeddedDialogue.trim() ? '沿用剧本草稿' : '留空'}；模式 {supportsAdvancedReferenceModes ? (draft.mode === 'smart-multi-frame' ? 'Smart multi-frame' : 'Omni reference') : 'Composite storyboard'}。
      </div>
    </div>
  )
}

function VideoShotGroupSection({
  projectId,
  episodeId,
  shotGroups = [],
  defaultVideoModel,
  videoModelOptions = [],
  capabilityOverrides,
}: ShotGroupVideoSectionProps) {
  const createMutation = useCreateProjectShotGroup(projectId, episodeId)
  const updateMutation = useUpdateProjectShotGroup(projectId, episodeId)
  const uploadMutation = useUploadProjectShotGroupReferenceImage(projectId, episodeId)
  const generateMutation = useGenerateProjectShotGroupVideo(projectId, episodeId)
  const saveTailFrameMutation = useSaveProjectVideoTailFrame(projectId, episodeId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()

  const [drafts, setDrafts] = useState<Record<string, VideoDraftState>>({})
  const [createDraft, setCreateDraft] = useState<VideoDraftState>({
    title: '',
    templateKey: 'grid-9',
    groupPrompt: '',
    videoPrompt: '',
    dialogueText: '',
    embeddedDialogue: '',
    mode: 'omni-reference',
    generationOptions: readShotGroupCapabilitySelection(capabilityOverrides, defaultVideoModel),
    includeDialogue: false,
    dialogueLanguage: 'zh',
    videoModel: defaultVideoModel,
    pendingCompositeFile: null,
  })
  const [isCreatingInline, setIsCreatingInline] = useState(false)
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [generatingGroupId, setGeneratingGroupId] = useState<string | null>(null)
  const [savingTailFrameGroupId, setSavingTailFrameGroupId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [groupErrors, setGroupErrors] = useState<Record<string, string | null>>({})
  const [groupPendingPreviewUrls, setGroupPendingPreviewUrls] = useState<Record<string, string>>({})
  const [createPendingPreviewUrl, setCreatePendingPreviewUrl] = useState<string | null>(null)
  const [createShotGroupId, setCreateShotGroupId] = useState<string | null>(null)
  const compositeFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const createFileInputRef = useRef<HTMLInputElement | null>(null)
  const groupPendingPreviewUrlsRef = useRef<Record<string, string>>({})
  const createPendingPreviewUrlRef = useRef<string | null>(null)

  const resolvedVideoModelOptions = useMemo(
    () => (videoModelOptions.length > 0 ? videoModelOptions : [{ value: defaultVideoModel, label: defaultVideoModel }]),
    [defaultVideoModel, videoModelOptions],
  )

  const taskStatesQuery = useTaskTargetStateMap(projectId, shotGroups.map((group) => ({
    targetType: 'NovelPromotionShotGroup',
    targetId: group.id,
    types: ['video_shot_group'],
  })), { enabled: shotGroups.length > 0 })
  const taskStates = useMemo(() => taskStatesQuery.data || [], [taskStatesQuery.data])

  const taskStateById = useMemo(() => {
    const next = new Map<string, (typeof taskStates)[number]>()
    for (const state of taskStates) {
      next.set(state.targetId, state)
    }
    return next
  }, [taskStates])

  useEffect(() => {
    setDrafts((previous) => {
      const next = { ...previous }
      for (const group of shotGroups) {
        const existing = next[group.id]
        const fallback = toDraft(group, defaultVideoModel, capabilityOverrides)
        const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
        next[group.id] = existing
          ? {
            ...existing,
            title: group.title || existing.title,
            templateKey: (group.templateKey || existing.templateKey) as NovelPromotionShotGroupTemplateKey,
            groupPrompt: group.groupPrompt || '',
            videoPrompt: group.videoPrompt || existing.videoPrompt,
            dialogueText: draftMetadata?.dialogueOverrideText
              ?? draftMetadata?.embeddedDialogue
              ?? existing.dialogueText,
            embeddedDialogue: draftMetadata?.embeddedDialogue ?? existing.embeddedDialogue,
            mode: resolveShotGroupModeForModel({
              ...group,
              modelKey: group.videoModel || existing.videoModel || defaultVideoModel,
            }),
            generationOptions: existing.generationOptions,
            includeDialogue: Boolean(group.includeDialogue),
            dialogueLanguage: normalizeDialogueLanguage(group.dialogueLanguage),
            videoModel: group.videoModel || existing.videoModel || defaultVideoModel,
          }
          : fallback
      }
      return next
    })
  }, [capabilityOverrides, defaultVideoModel, shotGroups])

  useEffect(() => {
    setCreateDraft((previous) => ({
      ...previous,
      videoModel: previous.videoModel || defaultVideoModel,
      generationOptions: Object.keys(previous.generationOptions).length > 0
        ? previous.generationOptions
        : readShotGroupCapabilitySelection(capabilityOverrides, previous.videoModel || defaultVideoModel),
    }))
  }, [capabilityOverrides, defaultVideoModel])

  useEffect(() => {
    setGroupPendingPreviewUrls((previous) => {
      let changed = false
      const next = { ...previous }
      for (const group of shotGroups) {
        if (group.compositeImageUrl && next[group.id]) {
          URL.revokeObjectURL(next[group.id])
          delete next[group.id]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [shotGroups])

  useEffect(() => {
    groupPendingPreviewUrlsRef.current = groupPendingPreviewUrls
  }, [groupPendingPreviewUrls])

  useEffect(() => {
    createPendingPreviewUrlRef.current = createPendingPreviewUrl
  }, [createPendingPreviewUrl])

  useEffect(() => () => {
    for (const url of Object.values(groupPendingPreviewUrlsRef.current)) {
      URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => () => {
    if (createPendingPreviewUrlRef.current) {
      URL.revokeObjectURL(createPendingPreviewUrlRef.current)
    }
  }, [])

  const updateGroupDraft = (groupId: string, updater: (draft: VideoDraftState) => VideoDraftState) => {
    setDrafts((previous) => {
      const current = previous[groupId]
      if (!current) return previous
      return {
        ...previous,
        [groupId]: updater(current),
      }
    })
  }

  const ensureCreateShotGroupId = async (draft: VideoDraftState) => {
    if (createShotGroupId) return createShotGroupId
    const created = await createMutation.mutateAsync({
      episodeId,
      ...buildShotGroupPayload(draft),
    }) as { shotGroup?: { id?: string } }
    const shotGroupId = created?.shotGroup?.id
    if (!shotGroupId) {
      throw new Error('创建多镜头视频草稿失败')
    }
    setCreateShotGroupId(shotGroupId)
    return shotGroupId
  }

  const resetCreateDraftState = () => {
    setCreateShotGroupId(null)
    setCreateDraft((previous) => ({
      ...previous,
      title: '',
      groupPrompt: '',
      videoPrompt: '',
      dialogueText: '',
      embeddedDialogue: '',
      mode: 'omni-reference',
      generationOptions: readShotGroupCapabilitySelection(capabilityOverrides, previous.videoModel || defaultVideoModel),
      includeDialogue: false,
      dialogueLanguage: 'zh',
      pendingCompositeFile: null,
    }))
    setCreatePendingPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    if (createFileInputRef.current) createFileInputRef.current.value = ''
  }

  const persistGroupDraft = async (group: NovelPromotionShotGroup, draft: VideoDraftState) => {
    const groupId = group.id
    const nextTitle = draft.title.trim() || buildDefaultTitle(draft.templateKey)
    await updateMutation.mutateAsync({
      shotGroupId: groupId,
      ...buildShotGroupPayload({
        ...draft,
        title: nextTitle,
      }),
      draftMetadata: buildShotGroupVideoDraftMetadataPatch({ draft, group }),
    })

    if (draft.pendingCompositeFile) {
      await uploadMutation.mutateAsync({
        file: draft.pendingCompositeFile,
        shotGroupId: groupId,
        targetField: 'composite',
      })
      setGroupPendingPreviewUrls((previous) => {
        if (!previous[groupId]) return previous
        const next = { ...previous }
        URL.revokeObjectURL(next[groupId])
        delete next[groupId]
        return next
      })
      updateGroupDraft(groupId, (current) => ({ ...current, title: nextTitle, pendingCompositeFile: null }))
    } else {
      updateGroupDraft(groupId, (current) => ({ ...current, title: nextTitle }))
    }
  }

  const handleSaveGroup = async (groupId: string) => {
    const draft = drafts[groupId]
    const group = shotGroups.find((entry) => entry.id === groupId)
    if (!draft || !group) return
    setGroupErrors((previous) => ({ ...previous, [groupId]: null }))
    setSavingGroupId(groupId)
    try {
      await persistGroupDraft(group, draft)
    } catch (error) {
      setGroupErrors((previous) => ({
        ...previous,
        [groupId]: resolveMutationError(error, '保存多镜头视频草稿失败'),
      }))
    } finally {
      setSavingGroupId(null)
    }
  }

  const handleGenerateGroup = async (groupId: string, hasServerComposite: boolean) => {
    const draft = drafts[groupId]
    const group = shotGroups.find((entry) => entry.id === groupId)
    if (!draft || !group) return
    if (!hasServerComposite && !draft.pendingCompositeFile) {
      setGroupErrors((previous) => ({ ...previous, [groupId]: '请先上传分镜参考表。' }))
      return
    }

    setGroupErrors((previous) => ({ ...previous, [groupId]: null }))
    setGeneratingGroupId(groupId)
    try {
      await persistGroupDraft(group, draft)
      await generateMutation.mutateAsync({
        shotGroupId: groupId,
        videoModel: draft.videoModel || defaultVideoModel,
        mode: draft.mode,
        generationOptions: draft.generationOptions,
      })
    } catch (error) {
      setGroupErrors((previous) => ({
        ...previous,
        [groupId]: resolveMutationError(error, '生成多镜头视频失败'),
      }))
    } finally {
      setGeneratingGroupId(null)
    }
  }

  const handleCreateAndGenerate = async () => {
    if (!createDraft.pendingCompositeFile) {
      setCreateError('请先选择一张 4 / 6 / 9 格分镜参考表。')
      return
    }

    setCreateError(null)
    setIsCreatingInline(true)
    try {
      const nextTitle = createDraft.title.trim() || buildDefaultTitle(createDraft.templateKey)
      const shotGroupId = await ensureCreateShotGroupId(createDraft)

      await uploadMutation.mutateAsync({
        file: createDraft.pendingCompositeFile,
        shotGroupId,
        targetField: 'composite',
      })
      await updateMutation.mutateAsync({
        shotGroupId,
        ...buildShotGroupPayload({
          ...createDraft,
          title: nextTitle,
        }),
      })
      await generateMutation.mutateAsync({
        shotGroupId,
        videoModel: createDraft.videoModel || defaultVideoModel,
        mode: createDraft.mode,
        generationOptions: createDraft.generationOptions,
      })

      resetCreateDraftState()
    } catch (error) {
      setCreateError(resolveMutationError(error, '创建并生成多镜头视频失败'))
    } finally {
      setIsCreatingInline(false)
    }
  }

  const handleSaveTailFrame = async (group: NovelPromotionShotGroup) => {
    if (!group.videoUrl) {
      setGroupErrors((previous) => ({ ...previous, [group.id]: '当前没有可提取的多镜头视频。' }))
      return
    }

    setGroupErrors((previous) => ({ ...previous, [group.id]: null }))
    setSavingTailFrameGroupId(group.id)
    try {
      const proxiedVideoUrl = `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(group.videoUrl)}`
      const file = await extractVideoTailFrame(proxiedVideoUrl)
      await saveTailFrameMutation.mutateAsync({
        sourceType: 'shot-group',
        sourceId: group.id,
        file,
      })
    } catch (error) {
      setGroupErrors((previous) => ({
        ...previous,
        [group.id]: resolveMutationError(error, '保存多镜头视频尾帧失败'),
      }))
    } finally {
      setSavingTailFrameGroupId(null)
    }
  }

  const handleDownloadVideo = async (group: NovelPromotionShotGroup, segmentNumber: number) => {
    if (!group.videoUrl) {
      setGroupErrors((previous) => ({ ...previous, [group.id]: '当前没有可下载的多镜头视频。' }))
      return
    }

    setGroupErrors((previous) => ({ ...previous, [group.id]: null }))
    try {
      const blob = await downloadRemoteBlobMutation.mutateAsync(resolveVideoDownloadUrl(projectId, group.videoUrl))
      const fileName = `${String(segmentNumber).padStart(3, '0')}_${sanitizeFileSegment(group.title, 'shot-group')}.mp4`
      saveBlobAsFile(blob, fileName)
    } catch (error) {
      setGroupErrors((previous) => ({
        ...previous,
        [group.id]: resolveMutationError(error, '下载多镜头视频失败'),
      }))
    }
  }

  const visibleShotGroups = shotGroups.filter((group) => group.id !== createShotGroupId)

  return (
    <section className="glass-surface p-4 space-y-4">
      <div className="flex items-center gap-2 text-[var(--glass-text-primary)]">
        <AppIcon name="film" className="h-4 w-4 text-[var(--glass-tone-info-fg)]" />
        <div>
          <h3 className="text-sm font-semibold">本集多个多镜头片段</h3>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
            每个多镜头片段都必须先有一张分镜参考表，才能生成对应视频。单镜头视频流程保持不变，这里只管理本集的多镜头片段。
          </p>
        </div>
      </div>

      <article className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[var(--glass-text-primary)]">新增一个多镜头片段</div>
          <p className="text-xs text-[var(--glass-text-tertiary)]">
            选择 4 / 6 / 9 格模板，上传 composite storyboard，并按单镜头同款视频能力配置后一步提交生成。
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
              <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                <span>模板</span>
                <select
                  value={createDraft.templateKey}
                  onChange={(event) => setCreateDraft((previous) => ({
                    ...previous,
                    templateKey: event.target.value as NovelPromotionShotGroupTemplateKey,
                  }))}
                  className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                >
                  {TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                <span>草稿标题</span>
                <input
                  value={createDraft.title}
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, title: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                  placeholder={buildDefaultTitle(createDraft.templateKey)}
                />
              </label>
            </div>

            {renderVideoConfigFields({
              draft: createDraft,
              resolvedVideoModelOptions,
              capabilityOverrides,
              onChange: (updater) => setCreateDraft((previous) => updater(previous)),
            })}
          </div>

          <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/40 p-4 space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--glass-text-primary)]">分镜参考表</div>
              <div className="text-xs text-[var(--glass-text-tertiary)]">
                上传已经合成好的 4 / 6 / 9 格参考图。图片会直接作为多镜头视频的分镜参考表输入，不会再经过额外包装。
              </div>
            </div>

            <input
              ref={createFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                setCreatePendingPreviewUrl((previous) => {
                  if (previous) URL.revokeObjectURL(previous)
                  return buildPendingFilePreview(file)
                })
                setCreateDraft((previous) => ({ ...previous, pendingCompositeFile: file }))
              }}
            />

            <div className="overflow-hidden rounded-xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
              {createPendingPreviewUrl ? (
                <div className="space-y-2 p-3">
                  <img
                    src={createPendingPreviewUrl}
                    alt="待上传分镜参考表预览"
                    className="h-[220px] w-full rounded-xl object-cover"
                  />
                  <div className="text-center text-xs text-[var(--glass-text-secondary)]">{createDraft.pendingCompositeFile?.name}</div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-[var(--glass-text-tertiary)]">还没有选择分镜参考表</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <GlassButton size="sm" variant="ghost" onClick={() => createFileInputRef.current?.click()}>
                <AppIcon name="upload" className="h-3.5 w-3.5" />
                <span>{createDraft.pendingCompositeFile ? '更换分镜参考表' : '上传分镜参考表'}</span>
              </GlassButton>
              {createDraft.pendingCompositeFile ? (
                <GlassButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreateDraft((previous) => ({ ...previous, pendingCompositeFile: null }))
                    setCreatePendingPreviewUrl((previous) => {
                      if (previous) URL.revokeObjectURL(previous)
                      return null
                    })
                    if (createFileInputRef.current) createFileInputRef.current.value = ''
                  }}
                >
                  <AppIcon name="close" className="h-3.5 w-3.5" />
                  <span>清空</span>
                </GlassButton>
              ) : null}
            </div>

            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
              没有分镜参考表就不能生成这个多镜头片段的视频。该流程只围绕 composite storyboard 作为视觉参考。
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <GlassButton
            size="sm"
            onClick={handleCreateAndGenerate}
            disabled={
              isCreatingInline
              || !createDraft.pendingCompositeFile
              || !createDraft.videoModel
              || getDraftMissingCapabilityFields({
                draft: createDraft,
                resolvedVideoModelOptions,
                capabilityOverrides,
              }).length > 0
            }
          >
            <AppIcon name="film" className="h-3.5 w-3.5" />
            <span>{isCreatingInline ? '提交中...' : '创建并开始生成'}</span>
          </GlassButton>
          <span className="text-xs text-[var(--glass-text-tertiary)]">
            系统会自动创建这个多镜头片段、上传分镜参考表，并连续提交视频任务。
          </span>
        </div>

        {createError ? (
          <div className="rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
            {createError}
          </div>
        ) : null}
      </article>

      {visibleShotGroups.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--glass-text-primary)]">本集已有 {visibleShotGroups.length} 个多镜头片段</div>
              <div className="text-xs text-[var(--glass-text-tertiary)]">
                按片段分别管理分镜参考表、提示词、模型和视频结果。每个片段都独立生成，互不覆盖。
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {visibleShotGroups.map((group) => {
              const draft = drafts[group.id] || toDraft(group, defaultVideoModel, capabilityOverrides)
              const segmentNumber = shotGroups.findIndex((item) => item.id === group.id) + 1
              const hasCompositeInput = Boolean(group.compositeImageUrl || draft.pendingCompositeFile)
              const missingCapabilityFields = getDraftMissingCapabilityFields({
                draft,
                resolvedVideoModelOptions,
                capabilityOverrides,
              })
              const isSaving = savingGroupId === group.id
              const isGenerating = generatingGroupId === group.id
              const isSavingTailFrame = savingTailFrameGroupId === group.id
              const taskState = taskStateById.get(group.id) || null
              const inlineState = taskState
                ? resolveTaskPresentationState({
                  phase: taskState.phase,
                  intent: taskState.intent,
                  resource: 'video',
                  hasOutput: Boolean(group.videoUrl),
                })
                : null
              const errorDisplay = taskState?.lastError ? resolveErrorDisplay(taskState.lastError) : null
              const statusLabel = resolveStatusLabel({
                hasComposite: Boolean(group.compositeImageUrl),
                hasVideo: Boolean(group.videoUrl),
                isRunning: Boolean(inlineState?.isRunning),
                isError: Boolean(inlineState?.isError),
              })
              const statusClass = resolveStatusClass({
                hasComposite: Boolean(group.compositeImageUrl),
                hasVideo: Boolean(group.videoUrl),
                isRunning: Boolean(inlineState?.isRunning),
                isError: Boolean(inlineState?.isError),
              })
              const pendingPreviewUrl = groupPendingPreviewUrls[group.id] || null
              const previewUrl = pendingPreviewUrl || group.compositeImageUrl || null
              const generationBlockedReason = !hasCompositeInput
                ? '请先为这个多镜头片段上传分镜参考表，才能生成视频。'
                : missingCapabilityFields.length > 0
                  ? `请先完成视频能力配置：${missingCapabilityFields.join('、')}`
                  : null

              return (
                <article key={group.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-[var(--glass-tone-info-bg)] px-2 py-1 text-xs text-[var(--glass-tone-info-fg)]">多镜头片段 {segmentNumber}</span>
                        <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">{draft.title || group.title}</h4>
                        <span className={["rounded-lg px-2 py-1 text-xs", statusClass].join(' ')}>{statusLabel}</span>
                      </div>
                      <p className="text-xs text-[var(--glass-text-tertiary)]">
                        模板：{resolveTemplateLabel(draft.templateKey)} · 槽位 {(group.items || []).length} 个 · 分镜参考表：{group.compositeImageUrl ? '已就绪' : draft.pendingCompositeFile ? '待保存上传' : '缺失'}
                      </p>
                    </div>
                    <TaskStatusInline state={inlineState} className="[&_svg]:text-[var(--glass-tone-info-fg)]" />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <div className="text-xs text-[var(--glass-text-tertiary)]">当前分镜参考表</div>
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                          alt={`${group.title} 分镜参考表`}
                          className="h-[180px] w-full rounded-2xl object-cover border border-[var(--glass-stroke-base)]"
                        />
                      ) : (
                        <div className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-3 text-center text-xs text-[var(--glass-text-tertiary)]">
                          还没有分镜参考表，当前不能生成这个多镜头片段的视频。
                        </div>
                      )}

                      <input
                        ref={(node) => {
                          compositeFileInputRefs.current[group.id] = node
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null
                          setGroupPendingPreviewUrls((previous) => {
                            const next = { ...previous }
                            if (next[group.id]) URL.revokeObjectURL(next[group.id])
                            const preview = buildPendingFilePreview(file)
                            if (preview) {
                              next[group.id] = preview
                            } else {
                              delete next[group.id]
                            }
                            return next
                          })
                          updateGroupDraft(group.id, (current) => ({ ...current, pendingCompositeFile: file }))
                          event.currentTarget.value = ''
                        }}
                      />

                      <div className="space-y-2">
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          onClick={() => compositeFileInputRefs.current[group.id]?.click()}
                          disabled={isSaving || isGenerating}
                        >
                          <AppIcon name="upload" className="h-3.5 w-3.5" />
                          <span>{draft.pendingCompositeFile || group.compositeImageUrl ? '更换分镜参考表' : '上传分镜参考表'}</span>
                        </GlassButton>
                        <div className="text-[11px] text-[var(--glass-text-tertiary)]">
                          {draft.pendingCompositeFile ? `待保存上传：${draft.pendingCompositeFile.name}` : '这张图会直接作为该片段的视频分镜参考表。'}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
                        <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                          <span>版式</span>
                          <select
                            value={draft.templateKey}
                            onChange={(event) => updateGroupDraft(group.id, (current) => ({
                              ...current,
                              templateKey: event.target.value as NovelPromotionShotGroupTemplateKey,
                            }))}
                            className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                          >
                            {TEMPLATE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                          <span>草稿标题</span>
                          <input
                            value={draft.title}
                            onChange={(event) => updateGroupDraft(group.id, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))}
                            className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                            placeholder={buildDefaultTitle(draft.templateKey)}
                          />
                        </label>
                      </div>

                      {renderVideoConfigFields({
                        draft,
                        resolvedVideoModelOptions,
                        capabilityOverrides,
                        onChange: (updater) => updateGroupDraft(group.id, updater),
                      })}

                      {generationBlockedReason ? (
                        <div className="rounded-xl border border-[var(--glass-tone-warning-border)] bg-[var(--glass-tone-warning-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-warning-fg)]">
                          {generationBlockedReason}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                          这个多镜头片段的分镜参考表已就绪，可以保存设置后直接生成或重新生成视频。
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveGroup(group.id)}
                          disabled={isSaving || isGenerating}
                        >
                          <AppIcon name="check" className="h-3.5 w-3.5" />
                          <span>{isSaving ? '保存中...' : '保存当前设置'}</span>
                        </GlassButton>
                          <GlassButton
                            size="sm"
                            onClick={() => handleGenerateGroup(group.id, Boolean(group.compositeImageUrl))}
                            disabled={isSaving || isGenerating || !hasCompositeInput || !draft.videoModel || missingCapabilityFields.length > 0}
                          >
                          <AppIcon name="film" className="h-3.5 w-3.5" />
                            <span>{isGenerating ? '提交中...' : (group.videoUrl ? '重新生成视频' : '生成视频')}</span>
                          </GlassButton>
                        {!hasCompositeInput ? <span className="text-xs text-[var(--glass-text-tertiary)]">按钮已禁用：缺少分镜参考表。</span> : null}
                      </div>

                      {groupErrors[group.id] ? (
                        <div className="rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
                          {groupErrors[group.id]}
                        </div>
                      ) : null}

                      {errorDisplay ? (
                        <div className="rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
                          {errorDisplay.message}
                        </div>
                      ) : null}

                      {group.videoUrl ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
                            <AppIcon name="play" className="h-3.5 w-3.5" />
                            <span>最近一次多镜头视频结果</span>
                          </div>
                          <video
                            key={group.videoUrl}
                            src={group.videoUrl}
                            controls
                            className="w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-black/30"
                          />
                          <div className="flex flex-wrap gap-2">
                            <GlassButton
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleDownloadVideo(group, segmentNumber)}
                            >
                              <AppIcon name="download" className="h-3.5 w-3.5" />
                              <span>下载视频</span>
                            </GlassButton>
                            <GlassButton
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleSaveTailFrame(group)}
                              disabled={isSavingTailFrame}
                            >
                              <AppIcon name="image" className="h-3.5 w-3.5" />
                              <span>{isSavingTailFrame ? '提取中...' : '提取并保存尾帧'}</span>
                            </GlassButton>
                            {group.savedTailFrameUrl ? (
                              <GlassButton
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadFileFromUrl(group.savedTailFrameUrl!, `shot-group-${segmentNumber}-tail-frame.png`)}
                              >
                                <AppIcon name="download" className="h-3.5 w-3.5" />
                                <span>下载已保存尾帧</span>
                              </GlassButton>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-[var(--glass-text-tertiary)]">
                            尾帧会保存到当前多镜头片段，不会写回任何单镜头 panel。
                          </div>
                          {group.savedTailFrameUrl ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
                                <AppIcon name="image" className="h-3.5 w-3.5" />
                                <span>已保存尾帧</span>
                              </div>
                              <img
                                src={group.savedTailFrameUrl}
                                alt={`${group.title} 已保存尾帧`}
                                className="w-full rounded-2xl border border-[var(--glass-stroke-base)] object-cover"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-4 py-6 text-sm text-[var(--glass-text-tertiary)]">
                          多镜头视频结果会独立显示在这里，不会回写到任何单镜头 panel。
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default function ShotGroupVideoSection(props: ShotGroupVideoSectionProps) {
  if (props.mode === 'review') {
      return (
      <ShotGroupVideoReviewSection
        projectId={props.projectId}
        episodeId={props.episodeId}
        shotGroups={props.shotGroups}
        storyboardMoodPresets={props.storyboardMoodPresets}
        projectDefaultMoodPresetId={props.projectDefaultMoodPresetId}
        episodeDefaultMoodPresetId={props.episodeDefaultMoodPresetId}
      />
    )
  }

  return <VideoShotGroupSection {...props} />
}
