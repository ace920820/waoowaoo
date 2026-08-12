'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import {
  adaptRemakeShots,
  REMAKE_KEYFRAME_SLOTS,
  buildTwoRowLayout,
  type RemakeKeyframeSlot,
  type RemakeKeyframeCandidate,
  type RemakeShotView,
} from '@/lib/remake-projects/keyframes/adapter'
import {
  useAdoptRemakeKeyframe,
  useGenerateRemakeKeyframe,
  useSelectRemakeKeyframe,
} from '@/lib/query/mutations/remake-keyframe-mutations'
import { RemakeProductionTools } from '../RemakeProductionTools'
import ShotSemanticsPanel from './ShotSemanticsPanel'
import KeyframePreviewModal from './KeyframePreviewModal'

function mediaUrl(projectId: string, mediaId: string | null | undefined) {
  return mediaId ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}` : null
}

/**
 * Prompt 状态角标 —— 参考 prompt 分析页的状态配色
 */
function PromptStatusBadge({ status }: { status: 'approved' | 'missing' | 'needs_review' }) {
  const config = (() => {
    switch (status) {
      case 'approved':
        return { label: '已批准', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' }
      case 'needs_review':
        return { label: '待审核', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' }
      case 'missing':
      default:
        return { label: '未分析', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }
    }
  })()

  return (
    <div
      className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.bg} ${config.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  )
}

export default function RemakeStoryboardStage({ projectId, snapshot, selectedShotId, onSelectedShotChange, onNavigateToPrompt }: {
  projectId: string
  snapshot: RemakeSnapshot
  /** 外部控制的选中镜头 ID（跨阶段共享） */
  selectedShotId?: string | null
  /** 选中镜头变化时通知父组件 */
  onSelectedShotChange?: (shotId: string) => void
  /** 切换到 Prompt 页（与顶部标签一致，客户端导航并保持选中镜头） */
  onNavigateToPrompt?: () => void
}) {
  const shots = useMemo(() => adaptRemakeShots(snapshot), [snapshot])
  const [internalSelectedShotId, setInternalSelectedShotId] = useState(selectedShotId ?? shots[0]?.id ?? '')
  const currentSelectedShotId = selectedShotId ?? internalSelectedShotId
  const setSelectedShotId = (id: string) => {
    setInternalSelectedShotId(id)
    onSelectedShotChange?.(id)
  }
  const selectedShot = shots.find((shot) => shot.id === currentSelectedShotId) ?? shots[0]

  return (
    <section className="space-y-6 pb-16" data-testid="remake-storyboard-stage">
      <RemakeProductionTools projectId={projectId} />
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Remake Storyboard</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">分镜</h2>
        <p className="mt-1 text-sm text-slate-500">保留原始动作证据，在明确选择后生成新的画面版本。</p>
      </header>
      {shots.length === 0 ? (
        <EmptyState text="暂无可用 Shot" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="Shot 列表">
            {shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => setSelectedShotId(shot.id)}
                className={`w-full rounded-lg border p-3 text-left ${
                  selectedShot?.id === shot.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'
                }`}
              >
                <strong>{shot.label}</strong>
                <span className="mt-1 block text-xs text-slate-500">{shot.stableId}</span>
              </button>
            ))}
          </aside>
          {selectedShot ? <ShotBlock projectId={projectId} shot={selectedShot} onNavigateToPrompt={onNavigateToPrompt} /> : null}
        </div>
      )}
    </section>
  )
}

function ShotBlock({ projectId, shot, onNavigateToPrompt }: { projectId: string; shot: RemakeShotView; onNavigateToPrompt?: () => void }) {
  const select = useSelectRemakeKeyframe(projectId)
  const generate = useGenerateRemakeKeyframe(projectId)
  const adopt = useAdoptRemakeKeyframe(projectId)
  const [counts, setCounts] = useState<Record<RemakeKeyframeSlot, number>>({
    start: 1,
    middle: 1,
    end: 1,
  })
  // 根据 prompt 状态计算默认选中的槽位：第一个已批准 → 第一个待审核 → 第一个（start）
  function computeDefaultSlot(s: RemakeShotView): RemakeKeyframeSlot {
    const statuses = s.imagePromptStatus
    const approved = REMAKE_KEYFRAME_SLOTS.find((slot) => statuses[slot] === 'approved')
    if (approved) return approved
    const pending = REMAKE_KEYFRAME_SLOTS.find((slot) => statuses[slot] === 'needs_review')
    if (pending) return pending
    return 'start'
  }
  const [selectedSourceSlot, setSelectedSourceSlot] = useState<RemakeKeyframeSlot>(() => computeDefaultSlot(shot))

  // 切换镜头时，根据新镜头的 prompt 状态重新选中默认槽位
  useEffect(() => {
    setSelectedSourceSlot(computeDefaultSlot(shot))
  }, [shot.id])
  const [pendingSlot, setPendingSlot] = useState<RemakeKeyframeSlot | null>(null)
  const [hints, setHints] = useState<Record<RemakeKeyframeSlot, string | null>>({
    start: null,
    middle: null,
    end: null,
  })
  const [viewedCandidate, setViewedCandidate] = useState<Record<RemakeKeyframeSlot, string | null>>({
    start: null,
    middle: null,
    end: null,
  })
  const [localSelected, setLocalSelected] = useState<Record<RemakeKeyframeSlot, boolean>>({
    start: shot.slots.start.selectedForGeneration,
    middle: shot.slots.middle.selectedForGeneration,
    end: shot.slots.end.selectedForGeneration,
  })
  const [compare, setCompare] = useState<{
    left: RemakeKeyframeCandidate | null
    right: RemakeKeyframeCandidate | null
  }>({ left: null, right: null })
  const [previewSlot, setPreviewSlot] = useState<RemakeKeyframeSlot | null>(null)
  const [pendingAdoption, setPendingAdoption] = useState<{
    trackId: string
    candidate: RemakeKeyframeCandidate
  } | null>(null)
  const selectedCount = REMAKE_KEYFRAME_SLOTS.filter(
    (slot) => localSelected[slot],
  ).length
  const announce =
    select.isPending || generate.isPending || adopt.isPending
      ? '正在更新服务器事实…'
      : `${selectedCount} 个生成槽位已选择`

  const columns = buildTwoRowLayout(shot)

  const handleGenerate = (slot: RemakeKeyframeSlot, countOverride?: number) => {
    if (!localSelected[slot]) {
      setHints((prev) => ({ ...prev, [slot]: '未选择生成槽位，请先勾选「用于生成」' }))
      return
    }
    setHints((prev) => ({ ...prev, [slot]: null }))
    setPendingSlot(slot)
    void generate
      .mutateAsync({
        shotId: shot.id,
        slot,
        operationKey: crypto.randomUUID(),
        count: countOverride ?? counts[slot],
      })
      .catch(() =>
        setHints((prev) => ({
          ...prev,
          [slot]: '生成失败，请稍后重试或检查分镜图片模型配置',
        })),
      )
      .finally(() => setPendingSlot(null))
  }

  const adoptCandidate = () => {
    if (!pendingAdoption?.trackId) return
    void adopt
      .mutateAsync({ trackId: pendingAdoption.trackId, candidateId: pendingAdoption.candidate.id })
      .finally(() => setPendingAdoption(null))
  }

  // 服务器事实回包后，用权威值校准本地乐观状态；切换 Shot 时重置。
  useEffect(() => {
    setLocalSelected({
      start: shot.slots.start.selectedForGeneration,
      middle: shot.slots.middle.selectedForGeneration,
      end: shot.slots.end.selectedForGeneration,
    })
    // shot 切换时才重置；槽位状态在下方点击时乐观更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id])

  return (
    <article
      className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`remake-shot-${shot.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {shot.label} · {shot.stableId}
          </h3>
          <p className="text-xs text-slate-500">Revision {shot.revision ?? '-'} · 原始证据不可覆盖</p>
        </div>
        <span aria-live="polite" className="text-xs text-slate-500">
          {announce}
        </span>
      </div>

      {/* 2 × 3 分镜工作区 */}
      <TwoRowGrid
        projectId={projectId}
        shot={shot}
        columns={columns}
        selectedSlot={selectedSourceSlot}
        onSelectSlot={setSelectedSourceSlot}
        onToggleGenerate={(slot, checked) => {
          if (!shot.slots[slot].eligible) return
          setLocalSelected((prev) => ({ ...prev, [slot]: checked }))
          select.mutate({ shotId: shot.id, slot, selectedForGeneration: checked })
        }}
        onGenerate={handleGenerate}
        generating={generate.isPending}
        pendingSlot={pendingSlot}
        counts={counts}
        onCountChange={(slot, value) => setCounts((prev) => ({ ...prev, [slot]: value }))}
        hints={hints}
        selectedForGeneration={localSelected}
        viewedCandidate={viewedCandidate}
        onViewCandidate={(slot, candidateId) =>
          setViewedCandidate((prev) => ({ ...prev, [slot]: candidateId }))
        }
        onViewData={(slot) => setPreviewSlot(slot)}
      />

      {/* 动作表 */}
      <div
        className={`rounded-lg border p-3 text-xs ${
          shot.actionSheet.status === 'current'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        <strong>分镜动作表：</strong>{' '}
        {shot.actionSheet.status === 'current'
          ? '当前 revision 可用'
          : shot.actionSheet.status === 'missing'
            ? '等待当前 revision 的原始帧确认'
            : '尚未确认'}
        <span className="ml-2">辅助动作参考，不是可采用的新画面。</span>
      </div>

      {/* 语义层 — 随当前选中帧刷新 */}
      <ShotSemanticsPanel projectId={projectId} shot={shot} activeSlot={selectedSourceSlot} onNavigateToPrompt={onNavigateToPrompt} />

      {/* 比较区（保留） */}
      {compare.left || compare.right ? (
        <section aria-labelledby={`${shot.id}-compare`}>
          <h4 id={`${shot.id}-compare`} className="mb-3 text-sm font-bold text-slate-800">
            比较
          </h4>
          <div className="grid gap-3 md:grid-cols-2">
            {(['left', 'right'] as const).map((side) => {
              const candidate = compare[side]
              return (
                <div key={side} className="rounded-lg border border-slate-200 p-2">
                  <p className="mb-1 text-xs font-semibold text-slate-600">
                    {side === 'left' ? '左' : '右'}
                  </p>
                  {candidate?.mediaId ? (
                    <img
                      src={mediaUrl(projectId, candidate.mediaId) ?? ''}
                      alt={`候选 ${candidate.ordinal}`}
                      className="aspect-video w-full rounded object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                      未选择
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setCompare({ left: null, right: null })}
            className="mt-2 text-xs text-slate-500 hover:text-slate-700"
          >
            关闭比较
          </button>
        </section>
      ) : null}

      <KeyframePreviewModal
        open={previewSlot !== null}
        onClose={() => setPreviewSlot(null)}
        slot={previewSlot ?? 'start'}
        batches={previewSlot ? shot.slots[previewSlot].batches : []}
        adoptedCandidateId={previewSlot ? shot.slots[previewSlot].adoptedCandidateId ?? null : null}
        canGenerate={previewSlot ? shot.slots[previewSlot].selectedForGeneration : false}
        onRegenerate={(count) => {
          if (previewSlot) handleGenerate(previewSlot, count)
        }}
        onAdopt={(candidate) => {
          const trackId = previewSlot ? shot.slots[previewSlot].id : null
          if (trackId) setPendingAdoption({ trackId, candidate })
        }}
        onRestorePrevious={() => {}}
        generating={generate.isPending}
        promptText={previewSlot ? shot.imagePrompts[previewSlot]?.coreText ?? null : null}
      />


      <ConfirmDialog
        show={Boolean(pendingAdoption)}
        title="确认采用此版本"
        message="当前采用版本会被替换，旧版本仍会保留在历史中。"
        confirmText="采用此版本"
        cancelText="取消"
        type="info"
        onConfirm={adoptCandidate}
        onCancel={() => setPendingAdoption(null)}
      />
    </article>
  )
}

function TwoRowGrid({
  projectId,
  shot,
  columns,
  selectedSlot,
  onSelectSlot,
  onToggleGenerate,
  onGenerate,
  generating,
  pendingSlot,
  counts,
  onCountChange,
  hints,
  selectedForGeneration,
  viewedCandidate,
  onViewCandidate,
  onViewData,
}: {
  projectId: string
  shot: RemakeShotView
  columns: ReturnType<typeof buildTwoRowLayout>
  selectedSlot: RemakeKeyframeSlot
  onSelectSlot: (slot: RemakeKeyframeSlot) => void
  onToggleGenerate: (slot: RemakeKeyframeSlot, checked: boolean) => void
  onGenerate: (slot: RemakeKeyframeSlot) => void
  generating: boolean
  pendingSlot: RemakeKeyframeSlot | null
  counts: Record<RemakeKeyframeSlot, number>
  onCountChange: (slot: RemakeKeyframeSlot, value: number) => void
  hints: Record<RemakeKeyframeSlot, string | null>
  selectedForGeneration: Record<RemakeKeyframeSlot, boolean>
  viewedCandidate: Record<RemakeKeyframeSlot, string | null>
  onViewCandidate: (slot: RemakeKeyframeSlot, candidateId: string) => void
  onViewData: (slot: RemakeKeyframeSlot) => void
}) {
  return (
    <div data-testid="two-row-grid">
      {/* 列标题行 */}
      <div className="mb-2 grid grid-cols-3 gap-3" data-testid="two-row-header-row">
        {columns.map((column) => (
          <div key={column.slot} className="text-center text-xs font-semibold text-slate-500">
            {column.slot === 'start' ? 'Start' : column.slot === 'middle' ? 'Middle' : 'End'}
          </div>
        ))}
      </div>

      {/* 原始动作参考行 */}
      <div data-testid="two-row-original-row" className="mb-1 grid grid-cols-3 gap-3">
        {columns.map((column) => {
          const isSelected = selectedSlot === column.slot
          const slotState = shot.slots[column.slot]
          const handleFrameClick = () => onSelectSlot(column.slot)
          return (
            <div
              key={column.slot}
              data-testid={`two-row-column-${column.slot}`}
              className={`rounded-lg border-2 p-2 transition ${
                isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white'
              }`}
            >
              <button
                type="button"
                data-testid={`original-frame-${column.slot}`}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={handleFrameClick}
                className="block w-full text-left"
              >
                <div className="relative overflow-hidden rounded bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                  {column.original.mediaUrl ? (
                    <img
                      src={column.original.mediaUrl}
                      alt={`${shot.label} 原始 ${column.slot}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      原始帧缺失
                    </div>
                  )}
                  {/* Prompt 状态角标 */}
                  <PromptStatusBadge status={shot.imagePromptStatus[column.slot]} />
                </div>
              </button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  {column.slot === 'start' ? 'Start' : column.slot === 'middle' ? 'Middle' : 'End'}
                </span>
                <label className="flex min-h-11 items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    data-testid={`select-for-generation-${column.slot}`}
                    checked={selectedForGeneration[column.slot]}
                    disabled={!slotState.eligible}
                    onChange={(event) => onToggleGenerate(column.slot, event.target.checked)}
                  />
                  用于生成
                </label>
              </div>
              {!slotState.eligible ? (
                <p className="mt-1 text-[11px] text-amber-700">{slotState.reason}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 新画面参考行 */}
      <div data-testid="two-row-new-row" className="grid grid-cols-3 gap-3">
        {columns.map((column) => {
          const slotState = shot.slots[column.slot]
          const candidates = slotState.batches.flatMap((batch) =>
            batch.candidates.filter((candidate) => candidate.eligible),
          )
          const adopted = slotState.adoptedCandidate
          const isEmpty = !adopted?.mediaId && !candidates[0]?.mediaId
          const isGenerating = generating && pendingSlot === column.slot
          const activeCandidateId = viewedCandidate[column.slot] ?? adopted?.id ?? candidates[0]?.id ?? null
          const displayed =
            candidates.find((candidate) => candidate.id === activeCandidateId) ??
            adopted ??
            candidates[0]
          return (
            <div
              key={column.slot}
              data-testid={`new-frame-card-${column.slot}`}
              className={`rounded-lg border p-2 ${
                adopted?.mediaId
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : isEmpty
                    ? 'border-dashed border-slate-300 bg-slate-50'
                    : 'border-slate-200 bg-white'
              } group relative overflow-hidden`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">新画面</span>
                {adopted?.mediaId ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    当前采用
                  </span>
                ) : null}
              </div>
              <div className="relative overflow-hidden rounded bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                {displayed?.mediaId ? (
                  <img
                    src={mediaUrl(projectId, displayed.mediaId) ?? ''}
                    alt={`${column.slot} 候选 ${displayed.ordinal}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[10px] text-slate-400">
                    <AppIcon name="imagePreview" size={20} />
                    <span>{selectedForGeneration[column.slot] ? '待生成' : '未选择生成'}</span>
                    <button
                      type="button"
                      data-testid={`generate-${column.slot}`}
                      onClick={() => onGenerate(column.slot)}
                      disabled={generating}
                      className="rounded bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isGenerating ? '生成中…' : '生成图片'}
                    </button>
                  </div>
                )}
                {isGenerating ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium text-indigo-700">
                    生成中…
                  </div>
                ) : null}
              </div>
              {candidates.length > 0 ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">候选</span>
                  {candidates.map((candidate) => {
                    const isActive = candidate.id === activeCandidateId
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={`候选 ${candidate.ordinal}`}
                        onClick={() => onViewCandidate(column.slot, candidate.id)}
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-semibold transition ${
                          isActive
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-indigo-300'
                        }`}
                      >
                        {candidate.ordinal}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {column.newFrame?.batchCount ?? 0} 批 / {column.newFrame?.candidateCount ?? 0} 候选
                </span>
                {!isEmpty ? (
                  <button
                    type="button"
                    onClick={() => onViewData(column.slot)}
                    disabled={generating}
                    className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    查看数据
                  </button>
                ) : null}
              </div>
              {hints[column.slot] ? (
                <p role="alert" className="mt-1 text-[10px] text-amber-600">
                  {hints[column.slot]}
                </p>
              ) : null}

              {/* 悬浮浮窗：候选数量 + 生成/重新生成 + 查看数据 */}
              <div className="static z-10 mt-2 flex w-max items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-1.5 py-1 shadow-sm sm:absolute sm:bottom-1.5 sm:left-1/2 sm:mt-0 sm:-translate-x-1/2 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto">
                <label className="flex items-center gap-0.5 text-[10px] text-slate-600">
                  张数
                  <select
                    aria-label="候选数量"
                    value={counts[column.slot]}
                    onChange={(event) => onCountChange(column.slot, Number(event.target.value))}
                    className="rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                  >
                    {[1, 2, 3, 4].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  data-testid={`regenerate-${column.slot}`}
                  onClick={() => onGenerate(column.slot)}
                  disabled={generating}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isGenerating ? '生成中…' : isEmpty ? '生成' : '重新生成'}
                </button>
                <button
                  type="button"
                  onClick={() => onViewData(column.slot)}
                  disabled={generating}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  查看数据
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
      <AppIcon name="film" size={24} className="mx-auto mb-2" />
      {text}
    </div>
  )
}
