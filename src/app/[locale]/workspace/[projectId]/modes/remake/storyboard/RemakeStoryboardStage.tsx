'use client'

import { useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { adaptRemakeShots, REMAKE_KEYFRAME_SLOTS, type RemakeKeyframeSlot, type RemakeKeyframeCandidate, type RemakeShotView } from '@/lib/remake-projects/keyframes/adapter'
import { useAdoptRemakeKeyframe, useGenerateRemakeKeyframe, useSelectRemakeKeyframe } from '@/lib/query/mutations/remake-keyframe-mutations'
import { RemakeProductionTools } from '../RemakeProductionTools'

// The original StoryboardStageShell, ImageSection, ImageSectionCandidateMode, and
// CandidateSelector remain unchanged. This adapter feeds their established
// capability semantics through Remake-owned Shot facts without Novel entities.

function mediaUrl(projectId: string, mediaId: string | null | undefined) {
  return mediaId ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}` : null
}

export default function RemakeStoryboardStage({ projectId, snapshot }: { projectId: string; snapshot: RemakeSnapshot }) {
  const shots = useMemo(() => adaptRemakeShots(snapshot), [snapshot])
  const [selectedShotId, setSelectedShotId] = useState(shots[0]?.id ?? '')
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0]
  return <section className="space-y-6 pb-16" data-testid="remake-storyboard-stage">
    <RemakeProductionTools projectId={projectId} />
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Remake Storyboard</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">分镜</h2>
      <p className="mt-1 text-sm text-slate-500">保留原始动作证据，在明确选择后生成新的画面版本。</p>
    </header>
    {shots.length === 0 ? <EmptyState text="暂无可用 Shot" /> : <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="Shot 列表">
        {shots.map((shot) => <button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={`w-full rounded-lg border p-3 text-left ${selectedShot?.id === shot.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}><strong>{shot.label}</strong><span className="mt-1 block text-xs text-slate-500">{shot.stableId}</span></button>)}
      </aside>
      {selectedShot ? <ShotBlock projectId={projectId} shot={selectedShot} /> : null}
    </div>}
  </section>
}

function ShotBlock({ projectId, shot }: { projectId: string; shot: RemakeShotView }) {
  const select = useSelectRemakeKeyframe(projectId)
  const generate = useGenerateRemakeKeyframe(projectId)
  const adopt = useAdoptRemakeKeyframe(projectId)
  const [model, setModel] = useState('')
  const [count, setCount] = useState(1)
  const [viewed, setViewed] = useState<Record<string, string>>({})
  const [compare, setCompare] = useState<{ left: RemakeKeyframeCandidate | null; right: RemakeKeyframeCandidate | null }>({ left: null, right: null })
  const [pendingAdoption, setPendingAdoption] = useState<{ trackId: string; candidate: RemakeKeyframeCandidate } | null>(null)
  const selectedCount = REMAKE_KEYFRAME_SLOTS.filter((slot) => shot.slots[slot].selectedForGeneration).length
  const announce = select.isPending || generate.isPending || adopt.isPending ? '正在更新服务器事实…' : `${selectedCount} 个生成槽位已选择`

  const adoptCandidate = () => {
    if (!pendingAdoption?.trackId) return
    void adopt.mutateAsync({ trackId: pendingAdoption.trackId, candidateId: pendingAdoption.candidate.id }).finally(() => setPendingAdoption(null))
  }

  return <article className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`remake-shot-${shot.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h3 className="text-lg font-bold text-slate-900">{shot.label} · {shot.stableId}</h3><p className="text-xs text-slate-500">Revision {shot.revision ?? '-'} · 原始证据不可覆盖</p></div><span aria-live="polite" className="text-xs text-slate-500">{announce}</span></div>
    <section aria-labelledby={`${shot.id}-original`}><h4 id={`${shot.id}-original`} className="mb-3 text-sm font-bold text-slate-800">原始动作参考</h4><div className="grid grid-cols-1 gap-3 md:grid-cols-3">{REMAKE_KEYFRAME_SLOTS.map((slot) => <OriginalCard key={slot} shot={shot} slot={slot} onSelect={(checked) => { if (!shot.slots[slot].eligible) return; select.mutate({ shotId: shot.id, slot, selectedForGeneration: checked }) }} />)}</div><div className={`mt-3 rounded-lg border p-3 text-xs ${shot.actionSheet.status === 'current' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><strong>分镜动作表：</strong> {shot.actionSheet.status === 'current' ? '当前 revision 可用' : shot.actionSheet.status === 'missing' ? '等待当前 revision 的原始帧确认' : '尚未确认'}<span className="ml-2">辅助动作参考，不是可采用的新画面。</span></div></section>
    <section aria-labelledby={`${shot.id}-new`}><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h4 id={`${shot.id}-new`} className="text-sm font-bold text-slate-800">新画面参考</h4><p className="text-xs text-slate-500">采用的图片将作为下一阶段的视频主画面参考。</p></div><div className="flex gap-2"><label className="text-xs text-slate-600">模型<input aria-label="图片模型" value={model} onChange={(event) => setModel(event.target.value)} placeholder="输入已配置模型" className="ml-1 w-36 rounded border border-slate-300 px-2 py-1" /></label><label className="text-xs text-slate-600">候选数量<select aria-label="候选数量" value={count} onChange={(event) => setCount(Number(event.target.value))} className="ml-1 rounded border border-slate-300 px-2 py-1">{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></div>{selectedCount === 0 ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">请选择至少一个已批准的图片 Prompt 后生成。</p> : <div className="space-y-4">{REMAKE_KEYFRAME_SLOTS.filter((slot) => shot.slots[slot].selectedForGeneration).map((slot) => <SlotCard key={slot} projectId={projectId} shot={shot} slot={slot} viewed={viewed[slot] ?? null} onView={(candidateId) => setViewed((current) => ({ ...current, [slot]: candidateId }))} onCompare={(candidate) => setCompare((current) => ({ left: current.left ?? candidate, right: current.left ? candidate : current.right }))} onGenerate={() => { if (!model.trim()) return; void generate.mutateAsync({ shotId: shot.id, slot, operationKey: crypto.randomUUID(), count, model: model.trim() }) }} onAdopt={(candidate) => { const trackId = shot.slots[slot].id; if (trackId) setPendingAdoption({ trackId, candidate }) }} generating={generate.isPending} />)}</div>}</section>
    {compare.left && compare.right ? <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" aria-label="候选比较"><div className="mb-2 flex items-center justify-between"><strong className="text-sm text-indigo-900">双图比较</strong><button type="button" onClick={() => setCompare({ left: null, right: null })} className="text-xs text-indigo-700">关闭</button></div><div className="grid grid-cols-2 gap-3">{[compare.left, compare.right].map((candidate) => <div key={candidate?.id} className="overflow-hidden rounded-lg bg-white">{candidate ? <img src={mediaUrl(projectId, candidate.mediaId) ?? ''} alt={`候选 ${candidate.ordinal}`} className="aspect-video w-full object-cover" /> : null}<p className="p-2 text-xs text-slate-600">候选 {candidate?.ordinal}</p></div>)}</div></section> : null}
    <ConfirmDialog show={Boolean(pendingAdoption)} title="确认采用此版本" message="当前采用版本会被替换，旧版本仍会保留在历史中。" confirmText="采用此版本" cancelText="取消" type="info" onConfirm={adoptCandidate} onCancel={() => setPendingAdoption(null)} />
  </article>
}

function OriginalCard({ shot, slot, onSelect }: { shot: RemakeShotView; slot: RemakeKeyframeSlot; onSelect: (checked: boolean) => void }) {
  const frame = shot.original[slot]
  const state = shot.slots[slot]
  return <div className="rounded-lg border border-slate-200 p-2"><div className="overflow-hidden rounded bg-slate-100" style={{ aspectRatio: '16 / 9' }}>{frame.mediaUrl ? <img src={frame.mediaUrl} alt={`${shot.label} 原始 ${slot}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">原始帧缺失</div>}</div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">{slot === 'start' ? 'Start' : slot === 'middle' ? 'Middle' : 'End'}</span><label className="flex min-h-11 items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={state.selectedForGeneration} disabled={!state.eligible} onChange={(event) => onSelect(event.target.checked)} />用于生成</label></div>{!state.eligible ? <p className="mt-1 text-[11px] text-amber-700">{state.reason}</p> : null}</div>
}

function SlotCard({ projectId, shot, slot, viewed, onView, onCompare, onGenerate, onAdopt, generating }: { projectId: string; shot: RemakeShotView; slot: RemakeKeyframeSlot; viewed: string | null; onView: (id: string) => void; onCompare: (candidate: RemakeKeyframeCandidate) => void; onGenerate: () => void; onAdopt: (candidate: RemakeKeyframeCandidate) => void; generating: boolean }) {
  const state = shot.slots[slot]
  const candidates = state.batches.flatMap((batch) => batch.candidates.filter((candidate) => candidate.eligible))
  const current = candidates.find((candidate) => candidate.id === (viewed ?? state.adoptedCandidateId)) ?? state.adoptedCandidate ?? candidates[0] ?? null
  return <div className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><strong className="text-sm text-slate-800">{slot.toUpperCase()} 生成槽位</strong><button type="button" disabled={generating} onClick={onGenerate} className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{candidates.length ? '重新生成' : '生成关键帧'}</button></div><div className="mt-3 overflow-hidden rounded bg-slate-100" style={{ aspectRatio: '16 / 9' }}>{current?.mediaId ? <img src={mediaUrl(projectId, current.mediaId) ?? ''} alt={`${slot} 当前预览`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">暂无候选</div>}</div>{state.adoptedCandidateId ? <p className="mt-2 text-xs text-emerald-700">当前采用：候选 {current?.ordinal ?? '-'}</p> : null}<div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`${slot} 候选版本`}>{state.batches.map((batch) => <div key={batch.id} className="flex gap-2 rounded border border-slate-100 p-2">{batch.candidates.map((candidate) => <button key={candidate.id} type="button" role="radio" aria-checked={viewed === candidate.id || (!viewed && state.adoptedCandidateId === candidate.id)} onClick={() => { onView(candidate.id); onCompare(candidate) }} className="w-20 text-left"><span className={`block overflow-hidden rounded border ${viewed === candidate.id || state.adoptedCandidateId === candidate.id ? 'border-indigo-500' : 'border-slate-200'}`} style={{ aspectRatio: '16 / 9' }}>{candidate.mediaId ? <img src={mediaUrl(projectId, candidate.mediaId) ?? ''} alt={`候选 ${candidate.ordinal}`} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px]">缺失</span>}</span><span className="mt-1 block text-[10px] text-slate-600">候选 {candidate.ordinal}</span><span className="sr-only">{candidate.id}</span></button>)}</div>)}</div>{current && current.id !== state.adoptedCandidateId ? <button type="button" onClick={() => onAdopt(current)} className="mt-3 min-h-11 rounded border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700">采用此版本</button> : null}</div>
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500"><AppIcon name="film" size={24} className="mx-auto mb-2" />{text}</div> }
