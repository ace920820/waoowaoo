'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useProjectData, useRefreshRemakeProject, useUserModels } from '@/lib/query/hooks'
import { adaptRemakeShots } from '@/lib/remake-projects/keyframes/adapter'
import {
  buildOrderedVideoReferences,
  mapRemakeVideoInputs,
  videoSubmissionReadiness,
  type SelectedVideoReferences,
} from '@/lib/remake-projects/keyframes/video-inputs'
import { RemakeProductionTools } from '../RemakeProductionTools'
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

export default function RemakeVideoStage({
  projectId,
  snapshot,
}: {
  projectId: string
  snapshot: RemakeSnapshot
}) {
  const shots = useMemo(() => adaptRemakeShots(snapshot), [snapshot])
  const cards = useMemo(
    () => shots.map((shot) => ({ shot, input: mapRemakeVideoInputs(shot) })),
    [shots],
  )
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
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          暂无可生成的 Video 镜头。
        </div>
      ) : (
        <div className="space-y-5">
          {cards.map(({ shot, input }) => (
            <VideoShotCard
              key={shot.id}
              projectId={projectId}
              shot={shot}
              input={input}
              defaultVideoModel={defaultVideoModel}
              videoModelOptions={videoModelOptions}
              capabilityOverrides={capabilityOverrides}
              onGenerated={refresh}
            />
          ))}
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
  shot,
  input,
  defaultVideoModel,
  videoModelOptions,
  capabilityOverrides,
  onGenerated,
}: {
  projectId: string
  shot: ReturnType<typeof adaptRemakeShots>[number]
  input: ReturnType<typeof mapRemakeVideoInputs>
  defaultVideoModel: string
  videoModelOptions: VideoModelOption[]
  capabilityOverrides: Record<string, unknown> | undefined
  onGenerated: () => void
}) {
  const [selected, setSelected] = useState<SelectedVideoReferences>({
    slots: [],
    includeActionSheet: false,
  })
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
    () => buildOrderedVideoReferences(input, selected),
    [input, selected],
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
          shotDurationSeconds: shot.durationSeconds,
          model: selectedModel,
          options: generationOptions,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.details || '生成失败')
      }
      onGenerated()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败'
      setErrorMsg(msg)
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, projectId, shot.id, shot.durationSeconds, selected.slots, selected.includeActionSheet, selectedModel, generationOptions, onGenerated])

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
          <p className="text-xs text-slate-500">
            时长 {shot.durationSeconds.toFixed(1)} 秒 · 手动选择参考，生成新视频版本
          </p>
        </div>
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
      </div>

      {readinessReasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
          {readinessReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {errorMsg && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
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
                        src={mediaUrl(projectId, image.mediaId) || ''}
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
            title="动作表参考（可选）"
            description="原始三帧纵向拼接图，Start → Middle → End，从上到下。"
          >
            {input.actionSheet.status === 'current' && input.actionSheet.mediaId ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded border border-slate-200">
                  <img
                    src={mediaUrl(projectId, input.actionSheet.mediaId) || ''}
                    alt="动作表"
                    className="w-full object-cover"
                    data-testid="action-sheet-image"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.includeActionSheet}
                    onChange={toggleActionSheet}
                    data-testid="ref-action-sheet"
                  />
                  <span>包含动作表（附加参考输入）</span>
                </label>
              </div>
            ) : (
              <Missing text={`动作表状态：${input.actionSheet.status === 'missing' ? '缺失' : '等待生成中...'}`} />
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
              <span>{orderedRefs.length} 张参考图 · 点击{showPreview ? '收起' : '展开'}</span>
              <AppIcon name={showPreview ? 'chevronUp' : 'chevronDown'} size={14} />
            </button>
            {showPreview && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                {orderedRefs.length === 0 ? (
                  <Missing text="尚未选择任何参考图片" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {orderedRefs.map((ref) => (
                      <div key={`${ref.role}-${ref.ordinal}`} className="flex flex-col items-center">
                        <div className="relative">
                          <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                            {ref.ordinal}
                          </span>
                          <img
                            src={mediaUrl(projectId, ref.mediaId) || ''}
                            alt={ref.label}
                            className="h-16 w-24 rounded border border-slate-200 object-cover"
                          />
                        </div>
                        <span className="mt-1 text-[10px] text-slate-600">
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
                  <video
                    src=""
                    controls
                    className="aspect-video w-full bg-black"
                    onClick={() => setPlayingKind('original')}
                  />
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
