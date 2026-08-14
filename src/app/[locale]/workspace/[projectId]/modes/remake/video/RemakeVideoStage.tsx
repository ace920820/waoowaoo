'use client'

import React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useProjectAssets, useProjectData, useRefreshRemakeProject, useUserModels } from '@/lib/query/hooks'
import { adaptRemakeShots } from '@/lib/remake-projects/keyframes/adapter'
import {
  buildOrderedVideoReferences,
  DEFAULT_SELECTED_VIDEO_REFERENCES,
  mapRemakeVideoInputs,
  videoSubmissionReadiness,
  type SelectedVideoReferences,
} from '@/lib/remake-projects/keyframes/video-inputs'
import { RemakeProductionTools } from '../RemakeProductionTools'
import { RemakeShotOverview } from '../ShotOverview'
import { RemakeVideoUnitPanel } from './RemakeVideoUnitPanel'
import { buildShotToUnitMap } from '@/lib/remake-projects/unit/adapter'
import {
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import type { CapabilityValue, VideoCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import { deriveDefaultVideoDuration } from '@/lib/remake-projects/video/duration'
import {
  readShotGroupCapabilitySelection,
} from '@/lib/shot-group/video-config'

const VISIBLE_CAPABILITY_FIELDS = ['duration', 'resolution', 'generateAudio'] as const

function mediaUrl(projectId: string, mediaId: string | null | undefined) {
  return mediaId
    ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}`
    : null
}

function toCapabilityFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    duration: '时长',
    resolution: '分辨率',
    generateAudio: '生成音频',
    seed: '随机种子',
    fps: '帧率',
  }
  return labels[field] ?? field
}

function parseGenerationOptionValue(raw: string | boolean, sample: CapabilityValue): CapabilityValue {
  if (typeof sample === 'boolean') return Boolean(raw)
  if (typeof sample === 'number') return Number(raw)
  return String(raw)
}

function apiErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const body = data as { message?: unknown; details?: unknown; error?: { message?: unknown; details?: unknown } }
  if (typeof body.error?.message === 'string' && body.error.message.trim()) return body.error.message
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  if (typeof body.details === 'string' && body.details.trim()) return body.details
  if (typeof body.error?.details === 'string' && body.error.details.trim()) return body.error.details
  return fallback
}

export default function RemakeVideoStage({
  projectId,
  snapshot,
  selectedShotId,
  onSelectedShotChange,
}: {
  projectId: string
  snapshot: RemakeSnapshot
  /** 外部控制的选中镜头 ID（跨阶段共享） */
  selectedShotId?: string | null
  /** 选中镜头变化时通知父组件 */
  onSelectedShotChange?: (shotId: string) => void
}) {
  const shots = useMemo(() => adaptRemakeShots(snapshot), [snapshot])
  const cards = useMemo(
    () => shots.map((shot) => ({ shot, input: mapRemakeVideoInputs(shot) })),
    [shots],
  )
  const [internalSelectedShotId, setInternalSelectedShotId] = useState(selectedShotId ?? shots[0]?.id ?? '')
  const currentSelectedShotId = selectedShotId ?? internalSelectedShotId
  const setSelectedShotId = (id: string) => {
    setInternalSelectedShotId(id)
    onSelectedShotChange?.(id)
  }
  const selectedShot = shots.find((shot) => shot.id === currentSelectedShotId) ?? shots[0]
  const selectedCard = cards.find((card) => card.shot.id === selectedShot?.id) ?? cards[0]
  const adoptedCount = cards.reduce(
    (total, card) => total + card.input.mainImages.length,
    0,
  )

  const projectQuery = useProjectData(projectId)
  const modelsQuery = useUserModels()
  const refresh = useRefreshRemakeProject(projectId)

  const projectConfig = (projectQuery.data?.novelPromotionData ?? {}) as Record<string, unknown>
  const defaultVideoModel = typeof projectConfig.videoModel === 'string' ? projectConfig.videoModel : ''
  const capabilityOverrides = projectConfig.capabilityOverrides as Record<string, unknown> | undefined

  const videoModelOptions = useMemo(() => {
    const videoModels = modelsQuery.data?.video ?? []
    return videoModels.map((model) => ({
      value: model.value,
      label: model.label,
      provider: model.provider,
      providerName: model.providerName,
      capabilities: model.capabilities,
      videoPricingTiers: model.videoPricingTiers,
    }))
  }, [modelsQuery.data])

  // Latest remake_video_generate task per shot, so the card can surface the
  // running/failed result instead of silently doing nothing.
  const videoTaskByShot = useMemo(() => {
    const byShot = new Map<string, RemakeSnapshot['tasks'][number]>()
    for (const task of snapshot.tasks) {
      if (task.type !== 'remake_video_generate') continue
      const current = byShot.get(task.targetId)
      if (!current || task.createdAt > current.createdAt) byShot.set(task.targetId, task)
    }
    return byShot
  }, [snapshot.tasks])

  // Unit mode state (D-14/D-15): manual selection, any combination,
  // check order = submit order. No homogeneity logic anywhere (D-03 cancelled).
  const [unitMode, setUnitMode] = useState(false)
  const [selectedUnitShotIds, setSelectedUnitShotIds] = useState<string[]>([])
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null)
  const [unitError, setUnitError] = useState<string | null>(null)
  const shotToUnit = useMemo(() => buildShotToUnitMap(snapshot), [snapshot])

  const enterUnitMode = useCallback(() => {
    setUnitMode(true)
    setSelectedUnitShotIds([])
    setActiveUnitId(null)
  }, [])

  const exitUnitMode = useCallback(() => {
    setUnitMode(false)
    setSelectedUnitShotIds([])
    setActiveUnitId(null)
  }, [])

  const toggleUnitShotSelection = useCallback((shotId: string) => {
    setSelectedUnitShotIds((current) => {
      if (current.includes(shotId)) return current.filter((id) => id !== shotId)
      return [...current, shotId]
    })
  }, [])

  const jumpToUnit = useCallback((unitId: string) => {
    setUnitMode(true)
    setActiveUnitId(unitId)
  }, [])

  // 已选镜头的累计时长（问题 1：多选后显示总时长）
  const selectedUnitDuration = useMemo(() => {
    return selectedUnitShotIds.reduce((total, shotId) => {
      const shot = shots.find((entry) => entry.id === shotId)
      return total + (shot?.durationSeconds ?? 0)
    }, 0)
  }, [selectedUnitShotIds, shots])

  return (
    <section
      className="space-y-6 pb-16"
      data-testid="remake-video-stage"
    >
      <RemakeProductionTools projectId={projectId} />

      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Remake Video
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">成片</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">
            已采用画面 {adoptedCount}/{shots.length * 3}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Video Prompt：
            {cards.some((card) => card.input.videoPrompt === 'approved')
              ? '已批准'
              : cards.some((card) => card.input.videoPrompt === 'needs_review')
                ? '需复核'
                : '缺失'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            动作表：
            {cards.some((card) => card.input.actionSheet.status === 'current')
              ? '当前'
              : '缺失'}
          </span>
          <button
            type="button"
            onClick={unitMode ? exitUnitMode : enterUnitMode}
            data-testid="unit-mode-toggle"
            className={`rounded-full px-3 py-1 transition-colors ${
              unitMode
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
            }`}
          >
            {unitMode ? '退出合并 unit 模式' : '合并 unit 模式'}
          </button>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          暂无可生成的 Video 镜头。
        </div>
      ) : activeUnitId ? (
        <RemakeVideoUnitPanel
          projectId={projectId}
          snapshot={snapshot}
          unitId={activeUnitId}
          onExit={() => setActiveUnitId(null)}
        />
      ) : unitMode ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <p className="text-sm font-medium text-violet-900">选择要合并为 unit 的镜头</p>
            <p className="mt-1 text-xs text-violet-700">
              可任意组合（不要求相邻），按勾选顺序生成。已选择 {selectedUnitShotIds.length} 个镜头
              {selectedUnitShotIds.length > 0 && ` · 累计时长 ${selectedUnitDuration.toFixed(1)}s`}。
            </p>
            {selectedUnitShotIds.length >= 2 && (
              <button
                type="button"
                data-testid="enter-unit-view"
                onClick={() => {
                  void (async () => {
                    const res = await fetch(
                      `/api/remake-projects/${encodeURIComponent(projectId)}/units`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          memberShotRevisionIds: selectedUnitShotIds
                            .map((shotId) => {
                              const shot = snapshot.shots.find((entry) => entry.id === shotId)
                              if (!shot?.revisions?.length) return null
                              // 优先取当前 revision（revision === shot.currentRevision），
                              // 否则回退到第一个 active —— 避免把旧 sourceRevision 的
                              // revision 传给服务端导致 MEMBER_NOT_CURRENT / INVALID_PARAMS。
                              const current = shot.revisions.find(
                                (revision) =>
                                  revision.revision === shot.currentRevision &&
                                  revision.lifecycleState === 'active',
                              )
                              if (current) return current.id
                              return (
                                shot.revisions.find(
                                  (revision) => revision.lifecycleState === 'active',
                                )?.id ?? null
                              )
                            })
                            .filter((id): id is string => Boolean(id)),
                        }),
                      },
                    )
                    if (!res.ok) {
                      const data = await res.json().catch(() => null)
                      throw new Error(apiErrorMessage(data, '创建 unit 失败'))
                    }
                    const data = (await res.json()) as { unit: { id: string } }
                    await refresh()
                    setActiveUnitId(data.unit.id)
                  })().catch((err) => {
                    console.error(err)
                    setUnitError(String(err instanceof Error ? err.message : err))
                  })
                }}
                className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
              >
                进入 unit 视图（{selectedUnitShotIds.length} 个镜头）
              </button>
            )}
            {unitError && (
              <p className="mt-2 text-xs text-red-600">{unitError}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shots.map((shot) => {
              const inUnit = shotToUnit.has(shot.id)
              const checkIndex = selectedUnitShotIds.indexOf(shot.id)
              return (
                <button
                  key={shot.id}
                  type="button"
                  data-testid={`unit-shot-option-${shot.id}`}
                  onClick={() => toggleUnitShotSelection(shot.id)}
                  className={`relative overflow-hidden rounded-xl border text-left transition-colors ${
                    checkIndex >= 0
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${inUnit ? 'opacity-40' : ''}`}
                >
                  {checkIndex >= 0 && (
                    <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                      {checkIndex + 1}
                    </span>
                  )}
                  <div className="relative aspect-video w-full bg-slate-100">
                    {shot.original.middle.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shot.original.middle.mediaUrl}
                        alt={shot.label ?? `镜头${shot.sequence ?? '?'}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        无中间帧
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-slate-800">
                      {shot.label ?? `镜头${shot.sequence ?? '?'}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{shot.durationSeconds.toFixed(1)}s</p>
                    {inUnit ? (
                      <p className="mt-1 text-xs font-medium text-violet-600">已加入其他 unit</p>
                    ) : (
                      shot.durationSeconds < 4 && (
                        <p className="mt-1 text-xs text-amber-600">
                          镜头过短（&lt; 最短档），建议并入相邻镜头或接受拉长
                        </p>
                      )
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <RemakeShotOverview
              shots={snapshot.shots}
              selectedShotId={selectedShot?.id ?? ''}
              onSelectShot={setSelectedShotId}
            />
          </div>
          <div className="min-w-0 lg:col-span-8">
            {selectedCard ? (
              <VideoShotCard
                key={selectedCard.shot.id}
                projectId={projectId}
                sourceMediaUrl={snapshot.source.mediaUrl}
                shot={selectedCard.shot}
                input={selectedCard.input}
                defaultVideoModel={defaultVideoModel}
                videoModelOptions={videoModelOptions}
                capabilityOverrides={capabilityOverrides}
                generationTask={videoTaskByShot.get(selectedCard.shot.id) ?? null}
                onGenerated={refresh}
                unitId={shotToUnit.get(selectedCard.shot.id) ?? null}
                onJumpToUnit={jumpToUnit}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

type VideoModelOption = {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: unknown
  videoPricingTiers?: unknown
}

function VideoShotCard({
  projectId,
  sourceMediaUrl,
  shot,
  input,
  defaultVideoModel,
  videoModelOptions,
  capabilityOverrides,
  generationTask,
  onGenerated,
  unitId,
  onJumpToUnit,
}: {
  projectId: string
  sourceMediaUrl: string | null
  shot: ReturnType<typeof adaptRemakeShots>[number]
  input: ReturnType<typeof mapRemakeVideoInputs>
  defaultVideoModel: string
  videoModelOptions: VideoModelOption[]
  capabilityOverrides: Record<string, unknown> | undefined
  generationTask: RemakeSnapshot['tasks'][number] | null
  onGenerated: () => void
  /** 该镜头所属 unit id（D-18：由 unit 交付时非 null） */
  unitId?: string | null
  /** 跳回 unit 视图（D-18） */
  onJumpToUnit?: (unitId: string) => void
}) {
  const projectAssets = useProjectAssets(projectId)
  const assetsData = projectAssets.data ?? null

  const [selected, setSelected] = useState<SelectedVideoReferences>(
    DEFAULT_SELECTED_VIDEO_REFERENCES,
  )
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [pendingAdoptVersionId, setPendingAdoptVersionId] = useState<string | null>(null)

  // Video prompt editing state
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptEditText, setPromptEditText] = useState(shot.videoPrompt.coreText ?? '')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  // Sync prompt text when shot changes
  useEffect(() => {
    setPromptEditText(shot.videoPrompt.coreText ?? '')
    setEditingPrompt(false)
    setPromptError(null)
  }, [shot.id, shot.videoPrompt.coreText])

  const handleSavePrompt = useCallback(async () => {
    if (!shot.videoPrompt.trackId || !promptEditText.trim()) return
    setSavingPrompt(true)
    setPromptError(null)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/prompts/tracks/${encodeURIComponent(shot.videoPrompt.trackId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'human_edit_and_adopt',
            coreText: promptEditText.trim(),
          }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.details || '保存失败')
      }
      setEditingPrompt(false)
      onGenerated()
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingPrompt(false)
    }
  }, [shot.videoPrompt.trackId, promptEditText, projectId, onGenerated])

  // Model + capability state
  const [selectedModel, setSelectedModel] = useState(defaultVideoModel)
  useEffect(() => {
    if (defaultVideoModel && !selectedModel) {
      setSelectedModel(defaultVideoModel)
    }
  }, [defaultVideoModel, selectedModel])

  const selectedModelOption = useMemo(
    () => videoModelOptions.find((opt) => opt.value === selectedModel),
    [videoModelOptions, selectedModel],
  )

  const capabilityDefinitions = useMemo(() => {
    try {
      return resolveEffectiveVideoCapabilityDefinitions({
        videoCapabilities: (selectedModelOption?.capabilities as { video?: VideoCapabilities } | undefined)?.video,
        pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      })
    } catch {
      return []
    }
  }, [selectedModelOption])

  const visibleCapabilityFields = useMemo(
    () => resolveEffectiveVideoCapabilityFields({ definitions: capabilityDefinitions })
      .filter((field) => VISIBLE_CAPABILITY_FIELDS.includes(field.field as typeof VISIBLE_CAPABILITY_FIELDS[number])),
    [capabilityDefinitions],
  )

  const [generationOptions, setGenerationOptions] = useState<Record<string, CapabilityValue>>({})

  // Normalize options when model changes (D-09)
  useEffect(() => {
    if (!selectedModel || capabilityDefinitions.length === 0) return
    const projectDefaults = readShotGroupCapabilitySelection(
      { video: capabilityOverrides ?? {} } as never,
      selectedModel,
    )
    const defaultDuration = deriveDefaultVideoDuration(
      shot.durationSeconds,
      capabilityDefinitions,
    )
    const normalized = normalizeVideoGenerationSelections({
      definitions: capabilityDefinitions,
      pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      selection: {
        ...projectDefaults,
        duration: defaultDuration,
      },
    })
    setGenerationOptions(normalized)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, capabilityDefinitions.length])

  const handleModelChange = useCallback((modelKey: string) => {
    setSelectedModel(modelKey)
    setErrorMsg(null)
  }, [])

  const handleCapabilityChange = useCallback((field: string, rawValue: string | boolean) => {
    if (!capabilityDefinitions.length) return
    const fieldDef = capabilityDefinitions.find((d) => d.field === field)
    const sample = fieldDef?.options?.[0] ?? ''
    const parsedValue = parseGenerationOptionValue(rawValue, sample as CapabilityValue)
    const normalized = normalizeVideoGenerationSelections({
      definitions: capabilityDefinitions,
      pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      selection: { ...generationOptions, [field]: parsedValue },
      pinnedFields: [field],
    })
    setGenerationOptions(normalized)
  }, [capabilityDefinitions, generationOptions, selectedModelOption])

  const orderedRefs = useMemo(
    () => buildOrderedVideoReferences(input, selected, assetsData),
    [input, selected, assetsData],
  )
  const characterAudioAvailable = input.assetBindings.characters.some((assetId) =>
    assetsData?.characters.some((character) => character.id === assetId && Boolean(character.customVoiceUrl)),
  )
  const readinessReasons = useMemo(() => {
    const reasons = videoSubmissionReadiness(input, selected)
    if (!selectedModel) {
      reasons.push('请选择视频模型')
    }
    return reasons
  }, [input, selected, selectedModel])
  const canSubmit = readinessReasons.length === 0

  const toggleSlot = useCallback((slot: 'start' | 'middle' | 'end') => {
    setSelected((prev) => ({
      ...prev,
      slots: prev.slots.includes(slot)
        ? prev.slots.filter((s) => s !== slot)
        : [...prev.slots, slot],
    }))
  }, [])

  const toggleActionSheet = useCallback(() => {
    setSelected((prev) => ({ ...prev, includeActionSheet: !prev.includeActionSheet }))
  }, [])

  const toggleAssetCategory = useCallback((
    field: 'includeCharacterImages' | 'includeLocationImage' | 'includePropImages' | 'includeCharacterAudio',
  ) => {
    setSelected((prev) => ({ ...prev, [field]: !prev[field] }))
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/remake-projects/${encodeURIComponent(projectId)}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          shotId: shot.id,
          operationKey: `gen-${Date.now()}`,
          selectedSlots: selected.slots,
          includeActionSheet: selected.includeActionSheet,
          includeCharacterImages: selected.includeCharacterImages,
          includeLocationImage: selected.includeLocationImage,
          includePropImages: selected.includePropImages,
          includeCharacterAudio: selected.includeCharacterAudio,
          shotDurationSeconds: shot.durationSeconds,
          model: selectedModel,
          options: generationOptions,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(apiErrorMessage(data, '生成失败'))
      }
      onGenerated()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败'
      setErrorMsg(msg)
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, projectId, shot.id, shot.durationSeconds, selected.slots, selected.includeActionSheet, selected.includeCharacterImages, selected.includeLocationImage, selected.includePropImages, selected.includeCharacterAudio, selectedModel, generationOptions, onGenerated])

  // --- Version data ---
  const track = shot.videoGeneration.track
  const adoptedVersionId = track?.adoptedVersionId ?? null
  const allVersions = useMemo(() => {
    const batches = track?.batches ?? []
    return batches.flatMap((batch) => batch.versions)
      .sort((a, b) => {
        // Newest-first by batch index (higher index = newer = later in array)
        const batchA = batches.find((b) => b.versions.some((v) => v.id === a.id))
        const batchB = batches.find((b) => b.versions.some((v) => v.id === b.id))
        const idxA = batches.indexOf(batchA!)
        const idxB = batches.indexOf(batchB!)
        if (idxA !== idxB) return idxB - idxA
        return b.ordinal - a.ordinal
      })
  }, [track])

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    adoptedVersionId || allVersions[0]?.id || null,
  )

  // Keep selection valid when versions change
  useEffect(() => {
    if (selectedVersionId && allVersions.some((v) => v.id === selectedVersionId)) return
    setSelectedVersionId(adoptedVersionId || allVersions[0]?.id || null)
  }, [adoptedVersionId, allVersions, selectedVersionId])

  const selectedVersion = allVersions.find((v) => v.id === selectedVersionId) || null

  // Sync note text with selected version
  useEffect(() => {
    setNoteText(selectedVersion?.note ?? '')
  }, [selectedVersion?.id, selectedVersion?.note])

  const [playingKind, setPlayingKind] = useState<'original' | 'generated'>('original')

  const handleSaveNote = useCallback(async () => {
    if (!selectedVersion || !track?.id) return
    setSavingNote(true)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/video/tracks/${encodeURIComponent(track.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'note',
            versionId: selectedVersion.id,
            note: noteText,
          }),
        },
      )
      if (!res.ok) throw new Error('保存失败')
      onGenerated()
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingNote(false)
    }
  }, [selectedVersion, track?.id, projectId, noteText, onGenerated])

  const handleAdopt = useCallback(async (versionId: string, confirmReplace = false) => {
    if (!track?.id) return
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/video/tracks/${encodeURIComponent(track.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'adopt',
            versionId,
            confirmReplace,
          }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data?.details?.includes('CONFIRM_REQUIRED')) {
          setPendingAdoptVersionId(versionId)
          setConfirmingReplace(true)
          return
        }
        throw new Error(data.error || data.details || '操作失败')
      }
      setConfirmingReplace(false)
      setPendingAdoptVersionId(null)
      onGenerated()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }, [track?.id, projectId, onGenerated])

  const handleReconfirm = useCallback(async (versionId: string) => {
    if (!track?.id) return
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/video/tracks/${encodeURIComponent(track.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reconfirm',
            versionId,
          }),
        },
      )
      if (!res.ok) throw new Error('重新确认失败')
      onGenerated()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }, [track?.id, projectId, onGenerated])

  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`video-shot-${shot.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">{shot.label}</h3>
          {unitId ? (
            <p className="text-xs font-medium text-violet-600" data-testid="delivered-by-unit">
              由 unit 交付（本镜头不单独生成视频）
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                时长 {shot.durationSeconds.toFixed(1)} 秒 · 手动选择参考，生成新视频版本
                {shot.durationSeconds < 4 && adoptedVersionId && (
                  <span
                    className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                    data-testid="stretched-badge"
                  >
                    拉长到最短档
                  </span>
                )}
              </p>
              {shot.durationSeconds < 4 && !adoptedVersionId && (
                <p className="mt-1 text-xs text-amber-700" data-testid="short-shot-hint">
                  镜头过短（&lt; 最短档），建议并入相邻镜头或接受拉长
                </p>
              )}
            </>
          )}
        </div>
        {unitId ? (
          <button
            type="button"
            onClick={() => onJumpToUnit?.(unitId)}
            data-testid="jump-to-unit"
            className="rounded px-4 py-2 text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100"
          >
            查看所属 unit
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleGenerate}
            data-testid="generate-button"
            className={`min-h-11 rounded px-4 py-2 text-xs font-semibold ${
              canSubmit && !submitting
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-200 text-slate-500'
            }`}
          >
            {submitting ? '生成中…' : '视频生成'}
          </button>
        )}
      </div>

      {readinessReasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
          {readinessReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {errorMsg && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="generate-error">
          {errorMsg}
        </div>
      )}

      {generationTask && (generationTask.status === 'queued' || generationTask.status === 'processing' || generationTask.status === 'running') && (
        <div
          className="mt-2 flex items-center gap-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800"
          data-testid="video-task-running"
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
          视频生成中…（任务已提交，完成后会自动出现在版本历史）
        </div>
      )}

      {generationTask?.status === 'failed' && (
        <div
          className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          data-testid="video-task-failed"
        >
          <p className="font-semibold">
            视频生成失败{generationTask.errorCode ? `（${generationTask.errorCode}）` : ''}
          </p>
          {generationTask.errorMessage ? (
            <p className="mt-1 break-words text-red-600">{generationTask.errorMessage}</p>
          ) : (
            <p className="mt-1 text-red-600">生成任务失败，请稍后重试，或检查视频模型配置。</p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Left column: inputs */}
        <div className="space-y-4">
          <InputGroup
            title="主画面参考（采用的新画面）"
            description="点击选择模型实际收到的关键帧，顺序固定为 Start → Middle → End。"
          >
            <div className="grid grid-cols-3 gap-2">
              {(['start', 'middle', 'end'] as const).map((slot) => {
                const image = input.mainImages.find((img) => img.slot === slot)
                const isSelected = selected.slots.includes(slot)
                const isMissing = !image
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => !isMissing && toggleSlot(slot)}
                    disabled={isMissing}
                    data-testid={`ref-slot-${slot}`}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={`overflow-hidden rounded border text-left transition ${
                      isMissing
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
                        : isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {image ? (
                      <img
                        src={mediaUrl(projectId, image.mediaId) ?? undefined}
                        alt={slot}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
                        未采用
                      </div>
                    )}
                    <div className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-600">
                      {slot === 'start' ? 'Start 起始帧' : slot === 'middle' ? 'Middle 中间帧' : 'End 结尾帧'}
                    </div>
                  </button>
                )
              })}
            </div>
          </InputGroup>

          <InputGroup
            title="参考素材（场景 / 物品 / 角色 / 音色）"
            description="绑定到本镜头的资产库素材，按 Omni reference 固定优先级进入 content[]（图片最多 9 张、音频最多 3 段）。"
          >
            <div className="space-y-2">
              {[
                {
                  key: 'includeCharacterImages' as const,
                  label: '角色形象图',
                  available: input.assetBindings.characters.length > 0,
                  hint: input.assetBindings.characters.length > 0
                    ? `${input.assetBindings.characters.length} 个已绑定角色`
                    : '未绑定角色资产',
                },
                {
                  key: 'includeLocationImage' as const,
                  label: '场景设定图',
                  available: Boolean(input.assetBindings.scene),
                  hint: input.assetBindings.scene ? '已绑定场景' : '未绑定场景资产',
                },
                {
                  key: 'includePropImages' as const,
                  label: '物品设定图',
                  available: input.assetBindings.props.length > 0,
                  hint: input.assetBindings.props.length > 0
                    ? `${input.assetBindings.props.length} 个已绑定物品`
                    : '未绑定物品资产',
                },
                {
                  key: 'includeCharacterAudio' as const,
                  label: '角色音色',
                  available: characterAudioAvailable,
                  hint: characterAudioAvailable ? '已有角色音色' : '未绑定含音色的角色',
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${
                    item.available
                      ? 'border-slate-200 bg-white'
                      : 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50'
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="text-[10px] text-slate-400">{item.hint}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={item.available && selected[item.key]}
                    disabled={!item.available}
                    onChange={() => toggleAssetCategory(item.key)}
                    data-testid={`ref-asset-${item.key}`}
                  />
                </label>
              ))}
            </div>
          </InputGroup>

          <InputGroup
            title="Video Prompt"
            description={`当前采用版本。${input.videoPrompt === 'needs_review' ? '上游变化后需复核。' : ''}`}
          >
            {shot.videoPrompt.trackId && shot.videoPrompt.coreText ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium rounded px-2 py-0.5 ${
                    input.videoPrompt === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : input.videoPrompt === 'needs_review'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {input.videoPrompt === 'approved' ? '已批准' : input.videoPrompt === 'needs_review' ? '需复核' : '缺失'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingPrompt((v) => !v)}
                    data-testid="edit-prompt-button"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {editingPrompt ? '收起' : '编辑'}
                  </button>
                </div>
                {editingPrompt ? (
                  <div className="space-y-2">
                    <textarea
                      value={promptEditText}
                      onChange={(e) => setPromptEditText(e.target.value)}
                      data-testid="prompt-edit-textarea"
                      rows={6}
                      className="w-full rounded border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSavePrompt}
                        disabled={savingPrompt || !promptEditText.trim()}
                        data-testid="save-prompt-button"
                        className={`rounded px-3 py-1.5 text-xs font-medium ${
                          savingPrompt || !promptEditText.trim()
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {savingPrompt ? '保存中...' : '保存并采用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPromptEditText(shot.videoPrompt.coreText ?? '')
                          setEditingPrompt(false)
                        }}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        取消
                      </button>
                    </div>
                    {promptError && (
                      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {promptError}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    {shot.videoPrompt.coreText}
                  </p>
                )}
              </div>
            ) : (
              <Missing text="暂无已采用的 Video Prompt" />
            )}
          </InputGroup>

          <InputGroup
            title="生成参数"
            description="默认使用项目配置，本次修改不影响项目默认值。"
          >
            {/* Model selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">视频模型</label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                data-testid="model-select"
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none"
              >
                {videoModelOptions.length === 0 ? (
                  <option value="">加载中...</option>
                ) : (
                  videoModelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Capability fields */}
            {visibleCapabilityFields.length > 0 && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                {visibleCapabilityFields.map((field) => {
                  const currentValue = generationOptions[field.field]
                  const isBoolean = field.options.length === 2 &&
                    field.options.every((o) => typeof o === 'boolean')
                  return (
                    <div key={field.field} className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">
                        {toCapabilityFieldLabel(field.field)}
                      </label>
                      {isBoolean ? (
                        <label className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(currentValue)}
                            onChange={(e) => handleCapabilityChange(field.field, e.target.checked)}
                            data-testid={`capability-${field.field}`}
                          />
                          <span>{Boolean(currentValue) ? '开启' : '关闭'}</span>
                        </label>
                      ) : (
                        <select
                          value={String(currentValue ?? '')}
                          onChange={(e) => handleCapabilityChange(field.field, e.target.value)}
                          data-testid={`capability-${field.field}`}
                          className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                        >
                          {field.options.map((opt) => (
                            <option key={String(opt)} value={String(opt)}>
                              {typeof opt === 'boolean' ? (opt ? '开启' : '关闭') : String(opt)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </InputGroup>
        </div>

        {/* Right column: preview + playback */}
        <div className="space-y-4">
          {/* Actual input preview */}
          <InputGroup
            title="实际输入预览（提交给模型）"
            description="按固定顺序展示，与模型实际收到的图片完全一致。"
          >
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              data-testid="toggle-preview"
              className="flex w-full items-center justify-between text-xs text-indigo-600 hover:text-indigo-700"
            >
              <span>{orderedRefs.length} 项参考素材 · 点击{showPreview ? '收起' : '展开'}</span>
              <AppIcon name={showPreview ? 'chevronUp' : 'chevronDown'} size={14} />
            </button>
            {showPreview && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                {orderedRefs.length === 0 ? (
                  <Missing text="尚未选择任何参考素材" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {orderedRefs.map((ref) => (
                      <div
                        key={`${ref.role}-${ref.ordinal}`}
                        className="flex flex-col items-center"
                        title={ref.usage}
                      >
                        <div className="relative">
                          <span className="absolute -left-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                            {ref.ordinal}
                          </span>
                          {ref.mediaType === 'audio' ? (
                            <div className="flex h-16 w-24 items-center justify-center rounded border border-slate-200 bg-slate-50">
                              <AppIcon name="mic" size={20} className="text-slate-400" />
                            </div>
                          ) : (() => {
                            const refSrc = ref.mediaUrl || mediaUrl(projectId, ref.mediaId)
                            return refSrc ? (
                              <img
                                src={refSrc}
                                alt={ref.label}
                                className="h-16 w-24 rounded border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-24 items-center justify-center rounded border border-slate-200 bg-slate-50">
                                <AppIcon name="image" size={20} className="text-slate-400" />
                              </div>
                            )
                          })()}
                        </div>
                        <span className="mt-1 max-w-24 truncate text-[10px] text-slate-600">
                          {ref.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </InputGroup>

          {/* Playback */}
          <div className="border-t border-slate-100 pt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">原始视频</p>
                <div
                  className={`overflow-hidden rounded border ${
                    playingKind === 'original'
                      ? 'border-indigo-500 ring-2 ring-indigo-200'
                      : 'border-slate-200'
                  }`}
                  data-playing-kind="original"
                >
                  {sourceMediaUrl ? (
                    <video
                      src={sourceMediaUrl}
                      controls
                      className="aspect-video w-full bg-black"
                      onClick={() => setPlayingKind('original')}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                      暂无原始视频
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  生成版本
                  {selectedVersion?.invalidated ? (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                      需复核
                    </span>
                  ) : null}
                </p>
                <div
                  className={`overflow-hidden rounded border ${
                    playingKind === 'generated'
                      ? 'border-indigo-500 ring-2 ring-indigo-200'
                      : 'border-slate-200'
                  }`}
                  data-playing-kind="generated"
                >
                  {selectedVersion?.mediaUrl ? (
                    <video
                      src={selectedVersion.mediaUrl}
                      controls
                      className="aspect-video w-full bg-black"
                      onClick={() => setPlayingKind('generated')}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                      暂无生成版本
                    </div>
                  )}
                </div>
              </div>
            </div>

            {allVersions.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  版本历史（共 {allVersions.length} 个，最新在前）
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allVersions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      data-testid={`version-${version.id}`}
                      data-adopted={version.id === adoptedVersionId ? 'true' : 'false'}
                      className={`relative flex-shrink-0 overflow-hidden rounded border transition ${
                        version.id === selectedVersionId
                          ? 'border-indigo-500 ring-2 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-video w-32 bg-slate-900">
                        {version.mediaUrl ? (
                          <video
                            src={version.mediaUrl}
                            className="h-full w-full object-cover"
                            muted
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            生成中
                          </div>
                        )}
                      </div>
                      {version.id === adoptedVersionId && (
                        <span className="absolute right-1 top-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-white">
                          当前
                        </span>
                      )}
                      {version.invalidated && (
                        <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">
                          复核
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Note + action area */}
            {selectedVersion && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">审核备注</label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    data-testid="version-note"
                    rows={2}
                    placeholder="记录审核意见（可选）"
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    data-testid="save-note-button"
                    className="mt-1 rounded px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {savingNote ? '保存中...' : '保存备注'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedVersion.id !== adoptedVersionId && (
                    <button
                      type="button"
                      onClick={() => handleAdopt(selectedVersion.id)}
                      data-testid="adopt-button"
                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      采用此版本
                    </button>
                  )}
                  {selectedVersion.id === adoptedVersionId && selectedVersion.invalidated && (
                    <button
                      type="button"
                      onClick={() => handleReconfirm(selectedVersion.id)}
                      data-testid="reconfirm-button"
                      className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      重新确认（继续采用）
                    </button>
                  )}
                  {selectedVersion.id === adoptedVersionId && !selectedVersion.invalidated && (
                    <span className="rounded bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800">
                      当前采用版本
                    </span>
                  )}
                </div>

                {/* Replace confirmation dialog */}
                {confirmingReplace && pendingAdoptVersionId && (
                  <div
                    data-testid="adopt-confirm-dialog"
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"
                  >
                    <p className="font-medium text-amber-800">
                      确认替换当前采用版本？
                    </p>
                    <p className="mt-1 text-amber-700">
                      替换后原采用版本将保留在历史中，可随时回溯。
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingReplace(false)
                          setPendingAdoptVersionId(null)
                        }}
                        className="rounded border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdopt(pendingAdoptVersionId, true)}
                        data-testid="confirm-replace-button"
                        className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                      >
                        确认替换
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Sheet */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-800">动作表参考</h4>
                <p className="text-[11px] text-slate-500">
                  原始三帧纵向拼接，Start → Middle → End 从上到下
                </p>
              </div>
              {input.actionSheet.status === 'current' && input.actionSheet.mediaId ? (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.includeActionSheet}
                    onChange={toggleActionSheet}
                    data-testid="ref-action-sheet"
                  />
                  <span>包含</span>
                </label>
              ) : null}
            </div>
            {input.actionSheet.status === 'current' && input.actionSheet.mediaId ? (
              <div className="flex justify-center">
                <div className="relative w-2/5 overflow-hidden rounded border border-slate-200">
                  <img
                    src={mediaUrl(projectId, input.actionSheet.mediaId) ?? undefined}
                    alt="动作表"
                    className="w-full object-cover"
                    data-testid="action-sheet-image"
                  />
                </div>
              </div>
            ) : (
              <p className="rounded border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                {input.actionSheet.status === 'missing' ? '动作表缺失' : '等待生成中...'}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function InputGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      <p className="mb-3 text-xs text-slate-500">{description}</p>
      {children}
    </section>
  )
}

function Missing({ text }: { text: string }) {
  return (
    <p className="rounded border border-dashed border-slate-300 p-4 text-xs text-slate-500">
      {text}
    </p>
  )
}
