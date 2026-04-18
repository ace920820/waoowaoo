'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
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
  normalizeShotGroupVideoMode,
} from '@/lib/shot-group/video-config'
import {
  useCreateProjectShotGroup,
  useGenerateProjectShotGroupVideo,
  useSaveProjectVideoTailFrame,
  useTaskTargetStateMap,
  useUpdateProjectShotGroup,
  useUploadProjectShotGroupReferenceImage,
} from '@/lib/query/hooks'
import type { VideoModelOption } from '@/lib/novel-promotion/stages/video-stage-runtime/types'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type {
  NovelPromotionDialogueLanguage,
  NovelPromotionShotGroup,
  NovelPromotionShotGroupTemplateKey,
  NovelPromotionShotGroupVideoMode,
} from '@/types/project'
import {
  downloadFileFromUrl,
  extractVideoTailFrame,
} from './video-tail-frame-utils'

interface ShotGroupVideoSectionProps {
  projectId: string
  episodeId: string
  shotGroups?: NovelPromotionShotGroup[]
  defaultVideoModel: string
  videoModelOptions?: VideoModelOption[]
  capabilityOverrides?: CapabilitySelections
}

interface VideoDraftState {
  title: string
  templateKey: NovelPromotionShotGroupTemplateKey
  groupPrompt: string
  videoPrompt: string
  mode: NovelPromotionShotGroupVideoMode
  generationOptions: ShotGroupVideoGenerationOptions
  includeDialogue: boolean
  dialogueLanguage: NovelPromotionDialogueLanguage
  videoModel: string
  pendingCompositeFile: File | null
}

const TEMPLATE_OPTIONS: Array<{ value: NovelPromotionShotGroupTemplateKey; label: string; helper: string }> = [
  { value: 'grid-4', label: '4 格', helper: '适合短节奏段落' },
  { value: 'grid-6', label: '6 格', helper: '适合转场推进' },
  { value: 'grid-9', label: '9 格', helper: '适合完整情绪段落' },
]
const SHOT_GROUP_VISIBLE_CAPABILITY_FIELDS = new Set(['duration', 'resolution', 'generateAudio'])

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

function resolveDialogueLanguageLabel(language: NovelPromotionDialogueLanguage) {
  if (language === 'en') return '英文'
  if (language === 'ja') return '日文'
  return '中文'
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

function toDraft(
  group: NovelPromotionShotGroup,
  defaultVideoModel: string,
  capabilityOverrides?: CapabilitySelections,
): VideoDraftState {
  const savedConfig = parseSavedVideoConfig(group)
  const savedModel = typeof savedConfig.videoModel === 'string' ? savedConfig.videoModel : null
  const videoModel = group.videoModel || savedModel || defaultVideoModel
  const savedGenerationOptions = savedConfig.generationOptions as Record<string, unknown> | undefined
  return {
    title: group.title || buildDefaultTitle((group.templateKey || 'grid-4') as NovelPromotionShotGroupTemplateKey),
    templateKey: (group.templateKey || 'grid-4') as NovelPromotionShotGroupTemplateKey,
    groupPrompt: group.groupPrompt || '',
    videoPrompt: group.videoPrompt || '',
    mode: normalizeShotGroupVideoMode({
      mode: group.videoMode ?? savedConfig.mode,
      omniReferenceEnabled: group.omniReferenceEnabled,
      smartMultiFrameEnabled: group.smartMultiFrameEnabled,
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

function resolveMutationError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function buildPendingFilePreview(file: File | null) {
  if (!file) return null
  return URL.createObjectURL(file)
}

function buildShotGroupPayload(draft: VideoDraftState, episodeId?: string) {
  const effectivePrompt = draft.videoPrompt.trim() || draft.groupPrompt.trim() || null
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
    includeDialogue: draft.includeDialogue,
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
            onChange((current) => ({
              ...current,
              videoModel: modelKey,
              generationOptions: normalizeVideoGenerationSelections({
                definitions: nextDefinitions,
                pricingTiers: nextPricingTiers,
                selection: {
                  ...readShotGroupCapabilitySelection(capabilityOverrides, modelKey),
                  ...current.generationOptions,
                },
              }),
            }))
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

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-secondary)]">
          <span>包含台词</span>
          <input
            type="checkbox"
            checked={draft.includeDialogue}
            onChange={(event) => onChange((current) => ({ ...current, includeDialogue: event.target.checked }))}
            className="h-4 w-4"
          />
        </label>

        <label className="space-y-1 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-secondary)]">
          <span>台词语言</span>
          <select
            value={draft.dialogueLanguage}
            disabled={!draft.includeDialogue}
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
      </div>

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

      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
        当前：音频 {normalizedGenerationOptions.generateAudio === true ? '开启（固定无背景音乐）' : '关闭'}；对白 {draft.includeDialogue ? `开启（${resolveDialogueLanguageLabel(draft.dialogueLanguage)}）` : '关闭'}；模式 {draft.mode === 'smart-multi-frame' ? 'Smart multi-frame' : 'Omni reference'}。
      </div>
    </div>
  )
}

export default function ShotGroupVideoSection({
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

  const [drafts, setDrafts] = useState<Record<string, VideoDraftState>>({})
  const [createDraft, setCreateDraft] = useState<VideoDraftState>({
    title: '',
    templateKey: 'grid-9',
    groupPrompt: '',
    videoPrompt: '',
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
        next[group.id] = existing
          ? {
            ...existing,
            title: group.title || existing.title,
            templateKey: (group.templateKey || existing.templateKey) as NovelPromotionShotGroupTemplateKey,
            groupPrompt: group.groupPrompt || '',
            videoPrompt: group.videoPrompt || existing.videoPrompt,
            mode: normalizeShotGroupVideoMode(group),
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

  const persistGroupDraft = async (groupId: string, draft: VideoDraftState) => {
    const nextTitle = draft.title.trim() || buildDefaultTitle(draft.templateKey)
    await updateMutation.mutateAsync({
      shotGroupId: groupId,
      ...buildShotGroupPayload({
        ...draft,
        title: nextTitle,
      }),
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
    if (!draft) return
    setGroupErrors((previous) => ({ ...previous, [groupId]: null }))
    setSavingGroupId(groupId)
    try {
      await persistGroupDraft(groupId, draft)
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
    if (!draft) return
    if (!hasServerComposite && !draft.pendingCompositeFile) {
      setGroupErrors((previous) => ({ ...previous, [groupId]: '请先上传分镜参考表。' }))
      return
    }

    setGroupErrors((previous) => ({ ...previous, [groupId]: null }))
    setGeneratingGroupId(groupId)
    try {
      await persistGroupDraft(groupId, draft)
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
