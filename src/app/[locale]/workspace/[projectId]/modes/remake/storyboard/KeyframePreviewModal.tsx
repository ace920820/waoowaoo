'use client'

import { useEffect, useState, useRef } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type {
  RemakeKeyframeSlot,
  RemakeKeyframeBatch,
  RemakeKeyframeCandidate,
} from '@/lib/remake-projects/keyframes/adapter'

type Props = {
  open: boolean
  onClose: () => void
  projectId: string
  slot: RemakeKeyframeSlot
  isOriginal?: boolean
  originalMediaUrl?: string | null
  batches: RemakeKeyframeBatch[]
  adoptedCandidateId: string | null
  canGenerate: boolean
  onRegenerate: (count: number) => void
  onAdopt: (candidate: RemakeKeyframeCandidate) => void
  onRestorePrevious: () => void
  generating?: boolean
  adoptionHistory?: Array<{ id: string; candidateId: string; timestamp: string }>
  promptText?: string | null
  generationParams?: Record<string, unknown>
}

function mediaUrl(projectId: string, mediaId: string | null | undefined) {
  return mediaId
    ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}`
    : null
}

export default function KeyframePreviewModal({
  open,
  onClose,
  projectId,
  slot,
  isOriginal = false,
  originalMediaUrl,
  batches,
  adoptedCandidateId,
  canGenerate,
  onRegenerate,
  onAdopt,
  onRestorePrevious,
  generating = false,
  adoptionHistory = [],
  promptText,
  generationParams,
}: Props) {
  const [candidateCount, setCandidateCount] = useState(1)
  const [showData, setShowData] = useState(false)
  const [viewedCandidateId, setViewedCandidateId] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const allCandidates = batches.flatMap((batch) =>
    batch.candidates.filter((candidate) => candidate.eligible),
  )

  const currentCandidate =
    allCandidates.find((candidate) => candidate.id === viewedCandidateId) ??
    allCandidates.find((candidate) => candidate.id === adoptedCandidateId) ??
    allCandidates[0] ??
    null

  const hasPreviousVersion = adoptionHistory.length > 1

  // Reset view when modal opens
  useEffect(() => {
    if (open) {
      setViewedCandidateId(adoptedCandidateId)
      setShowData(false)
      closeButtonRef.current?.focus()
    }
  }, [open, adoptedCandidateId, slot])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const currentImageUrl = isOriginal
    ? originalMediaUrl
    : currentCandidate?.mediaUrl

  const slotLabel = slot === 'start' ? 'Start' : slot === 'middle' ? 'Middle' : 'End'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${slotLabel} 关键帧预览`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部栏 */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
              {slotLabel}
            </span>
            <span className="text-sm text-slate-500">
              {isOriginal ? '原始帧' : '新画面'}
            </span>
            {!isOriginal && currentCandidate?.id === adoptedCandidateId ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                当前采用
              </span>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <AppIcon name="close" size={18} />
          </button>
        </div>

        {/* 主图片区 */}
        <div className="flex flex-1 overflow-hidden bg-slate-900">
          <div className="flex flex-1 items-center justify-center p-6">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt={`${slotLabel} ${isOriginal ? '原始帧' : '候选'}`}
                className="max-h-[60vh] max-w-full object-contain"
              />
            ) : (
              <p className="text-sm text-slate-400">无图片</p>
            )}
          </div>

          {/* 右侧候选列 */}
          {!isOriginal && batches.length > 0 ? (
            <div className="w-48 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">候选</p>
              <div className="space-y-3">
                {batches.map((batch, batchIndex) => (
                  <div key={batch.id}>
                    <p className="mb-1 text-[10px] text-slate-400">
                      批次 {batchIndex + 1} · {batch.candidates.length} 候选
                      {batch.referenceMediaIds?.length ? ` · ${batch.referenceMediaIds.length} 参考图` : ''}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {batch.candidates
                        .filter((candidate) => candidate.eligible)
                        .map((candidate) => {
                          const isViewed = viewedCandidateId === candidate.id
                          const isAdopted = candidate.id === adoptedCandidateId
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => setViewedCandidateId(candidate.id)}
                              className={`overflow-hidden rounded border-2 transition ${
                                isViewed
                                  ? 'border-indigo-500'
                                  : isAdopted
                                    ? 'border-emerald-400'
                                    : 'border-transparent'
                              }`}
                              aria-label={`候选 ${candidate.ordinal}`}
                            >
                              <div
                                className="bg-slate-200"
                                style={{ aspectRatio: '16 / 9' }}
                              >
                                {candidate.mediaUrl ? (
                                  <img
                                    src={candidate.mediaUrl}
                                    alt={`候选 ${candidate.ordinal}`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 底部操作条 */}
        {!isOriginal ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              {/* 下载 */}
              {currentCandidate?.mediaUrl ? (
                <a
                  href={currentCandidate.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <AppIcon name="download" size={16} />
                  下载
                </a>
              ) : null}

              {/* 恢复上一版本 */}
              {hasPreviousVersion ? (
                <button
                  type="button"
                  onClick={onRestorePrevious}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <AppIcon name="undo" size={16} />
                  恢复上一版本
                </button>
              ) : null}

              {/* 重新生成 */}
              {canGenerate ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRegenerate(candidateCount)}
                    disabled={generating}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <AppIcon name="refresh" size={16} />
                    {generating ? '生成中…' : '重新生成'}
                  </button>
                  <select
                    value={candidateCount}
                    onChange={(e) => setCandidateCount(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    aria-label="候选数量"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} 张
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {/* 查看数据 */}
              <button
                type="button"
                onClick={() => setShowData((s) => !s)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <AppIcon name="info" size={16} />
                查看数据
              </button>

              {/* 采用此版本 */}
              {currentCandidate && currentCandidate.id !== adoptedCandidateId ? (
                <button
                  type="button"
                  onClick={() => onAdopt(currentCandidate)}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <AppIcon name="check" size={16} />
                  采用此版本
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 数据面板 */}
        {showData && !isOriginal ? (
          <div className="max-h-40 overflow-y-auto border-t border-slate-100 bg-slate-50 p-4 text-sm">
            {(() => {
              const referenceMediaIds = batches.flatMap((batch) => batch.referenceMediaIds ?? [])
              const uniqueReferences = [...new Set(referenceMediaIds)]
              return uniqueReferences.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-slate-600">
                    参考图（已上传并引用 {uniqueReferences.length} 张）
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueReferences.map((mediaId) => (
                      <img
                        key={mediaId}
                        src={mediaUrl(projectId, mediaId) ?? ''}
                        alt={`参考图 ${mediaId}`}
                        className="h-16 w-24 rounded border border-slate-200 object-cover"
                      />
                    ))}
                  </div>
                </div>
              ) : null
            })()}
            {promptText ? (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold text-slate-600">图片 Prompt</p>
                <p className="whitespace-pre-wrap text-slate-700">{promptText}</p>
              </div>
            ) : null}
            {generationParams && Object.keys(generationParams).length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">生成参数</p>
                <pre className="overflow-x-auto text-xs text-slate-600">
                  {JSON.stringify(generationParams, null, 2)}
                </pre>
              </div>
            ) : null}
            {currentCandidate ? (
              <div className="mt-2 text-xs text-slate-500">
                批次: {currentCandidate.ordinal} · 候选: {currentCandidate.id}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
