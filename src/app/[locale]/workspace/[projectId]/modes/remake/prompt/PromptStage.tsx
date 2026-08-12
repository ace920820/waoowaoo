'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useAnalyzeRemakePrompt } from '@/lib/query/mutations/remake-prompt-mutations'
import { PromptImageTab } from './PromptImageTab'
import { PromptVideoTab } from './PromptVideoTab'
import './prompt-stage.css'

type Props = {
  projectId: string
  snapshot: RemakeSnapshot
  onEnterStoryboard?: () => void
  /** 外部控制的选中镜头 ID（跨阶段共享） */
  selectedShotId?: string | null
  /** 选中镜头变化时通知父组件 */
  onSelectedShotChange?: (shotId: string) => void
}
type Filter = 'all' | 'pending_review' | 'approved'
const slots = ['start', 'middle', 'end'] as const

function trackFor(tracks: PromptTrackSummary[] | undefined, targetKey: PromptTrackSummary['targetKey']) {
  return tracks?.find((track) => track.targetKey === targetKey) ?? null
}

function stateFor(track: PromptTrackSummary | null) {
  if (!track?.latestVersion) return 'idle'
  if (track.needsReview) return 'pending_review'
  return track.adoptedVersion ? 'approved' : 'pending_review'
}

function shotLabel(shot: { sequence: number | null }): string {
  return `镜头${String(shot.sequence ?? 1).padStart(2, '0')}`
}

export function PromptStage({ projectId, snapshot, onEnterStoryboard, selectedShotId, onSelectedShotChange }: Props) {
  const t = useTranslations('remakeWorkbench')
  const [internalSelectedShotId, setInternalSelectedShotId] = useState(selectedShotId ?? snapshot.shots[0]?.id ?? '')
  // 如果父组件传入了 selectedShotId，则以父组件为准（受控模式）
  const currentSelectedShotId = selectedShotId ?? internalSelectedShotId
  const setSelectedShotId = (id: string) => {
    setInternalSelectedShotId(id)
    onSelectedShotChange?.(id)
  }
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const analyze = useAnalyzeRemakePrompt(projectId)
  const selectedShot = snapshot.shots.find((shot) => shot.id === currentSelectedShotId) ?? snapshot.shots[0]
  const allTracks = snapshot.shots.flatMap((shot) => shot.promptTracks ?? [])
  const totalKeyframes = snapshot.shots.length * 3
  const analyzedKeyframes = snapshot.shots.flatMap((shot) => slots.map((slot) => trackFor(shot.promptTracks, `image:${slot}`))).filter((track) => Boolean(track?.latestVersion)).length
  const approvedPrompts = allTracks.filter((track) => Boolean(track.adoptedVersion)).length
  const pendingReview = allTracks.filter((track) => stateFor(track) === 'pending_review').length
  const running = snapshot.tasks.filter((task) => ['queued', 'processing', 'running'].includes(task.status) && task.type.includes('prompt')).length
  const filteredShots = useMemo(() => snapshot.shots.filter((shot) => {
    const matches = `${shot.sequence ?? ''} ${shot.stableKey}`.toLowerCase().includes(query.toLowerCase())
    if (!matches) return false
    const states = slots.map((slot) => stateFor(trackFor(shot.promptTracks, `image:${slot}`)))
    if (filter === 'pending_review') return states.includes('pending_review')
    if (filter === 'approved') return states.every((state) => state === 'approved')
    return true
  }), [filter, query, snapshot.shots])

  const analyzeVideo = () => analyze.mutate({ kind: 'video', operationKey: crypto.randomUUID() })

  if (!snapshot.source.mediaId && snapshot.shots.length === 0) return <section className="py-20 text-center text-slate-400">{t('noSource')}</section>
  if (!selectedShot) return <section className="py-20 text-center text-slate-400">{t('noPromptEligibleShot')}</section>

  return <section className="space-y-6 pb-12" data-testid="remake-prompt-stage">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Remake Prompt</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{t('promptTitle')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('promptSubtitle')}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">{t('shots')} {snapshot.shots.length}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t('imagePrompt')} {analyzedKeyframes} / {totalKeyframes}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t('approved')} {approvedPrompts} / {allTracks.length}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t('pendingReview')} {pendingReview}</span>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">{t('tasks')} {t('running')} {running}</span>
      </div>
    </header>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <aside className="lg:col-span-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="space-y-3 border-b border-slate-100 pb-3"><div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><AppIcon name="film" size={16} className="text-indigo-600" />{t('shotList')} ({filteredShots.length})</div><label className="relative block"><AppIcon name="search" size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchShots')} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-indigo-500" /></label><div className="flex flex-wrap gap-1 text-[11px]">{([['all', t('all')], ['pending_review', t('pendingReview')], ['approved', t('approved')]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={filter === value ? 'rounded-md bg-slate-900 px-2 py-1 font-medium text-white' : 'rounded-md bg-slate-100 px-2 py-1 text-slate-600'}>{label}</button>)}</div></div>
        <div className="mt-3 max-h-[650px] space-y-2.5 overflow-y-auto pr-1">{filteredShots.map((shot) => <ShotListItem key={shot.id} shot={shot} selected={shot.id === selectedShot.id} onClick={() => setSelectedShotId(shot.id)} />)}</div>
      </aside>

      <div className="lg:col-span-8 space-y-6">
        <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-white via-indigo-50/20 to-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">{shotLabel(selectedShot)}</span></div><p className="mt-1 text-xs text-slate-500">{String(selectedShot.timeRange?.start ?? '-')} - {String(selectedShot.timeRange?.end ?? '-')}</p></div><button type="button" disabled={analyze.isPending || !selectedShot.review?.promptEligible} onClick={analyzeVideo} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><AppIcon name="bolt" size={16} className="text-amber-300" />{t('analyzeVideo')}</button></div></div>
        <div><div className="mb-3 flex items-center justify-between"><h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><AppIcon name="layers" size={16} className="text-indigo-600" />{t('imagePrompt')} (Start / Middle / End)</h4><span className="text-xs text-slate-400">{t('imageProgress', { count: analyzedKeyframes })}</span></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><PromptImageTab projectId={projectId} shot={selectedShot} tasks={snapshot.tasks} /></div></div>
        <PromptVideoTab projectId={projectId} shot={selectedShot} task={snapshot.tasks.find((task) => task.type === 'remake_video_prompt_analyze' && ['queued', 'processing', 'running', 'failed'].includes(task.status)) ?? null} onAnalyzeVideo={analyzeVideo} isAnalyzing={analyze.isPending} />
        <div className="flex justify-end">
          <button type="button" onClick={onEnterStoryboard} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" data-testid="remake-enter-storyboard">进入分镜 <AppIcon name="arrowRight" size={14} /></button>
        </div>
      </div>
    </div>
  </section>
}


 function ShotListItem({ shot, selected, onClick }: { shot: RemakeSnapshot['shots'][number]; selected: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition-all ${selected ? 'border-indigo-400 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-400/30' : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'}`}><div className="mb-1.5 flex justify-between gap-2"><span className="line-clamp-2 text-xs font-bold text-slate-900">{shotLabel(shot)}</span><span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{String(shot.timeRange?.start ?? '-')}</span></div><div className="my-2 grid grid-cols-3 gap-1.5">{slots.map((slot) => shot.keyframes?.[slot]?.mediaUrl ? <img key={slot} src={shot.keyframes[slot].mediaUrl} alt="" className="aspect-video w-full rounded-md border border-slate-200 object-cover" /> : <div key={slot} className="aspect-video rounded-md border border-slate-200 bg-slate-50" />)}</div><div className="flex items-center gap-1 text-[10px] text-slate-500"><AppIcon name="check" size={12} className="text-emerald-500" />Prompt {shot.promptTracks?.filter((track) => Boolean(track.adoptedVersion)).length ?? 0}/4</div></button> }
