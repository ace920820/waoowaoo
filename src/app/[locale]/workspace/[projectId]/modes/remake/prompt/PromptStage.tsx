'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useAnalyzeRemakePrompt } from '@/lib/query/mutations/remake-prompt-mutations'
import { RemakeShotOverview, shotLabel } from '../ShotOverview'
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
const slots = ['start', 'middle', 'end'] as const

function trackFor(tracks: PromptTrackSummary[] | undefined, targetKey: PromptTrackSummary['targetKey']) {
  return tracks?.find((track) => track.targetKey === targetKey) ?? null
}

function stateFor(track: PromptTrackSummary | null) {
  if (!track?.latestVersion) return 'idle'
  if (track.needsReview) return 'pending_review'
  return track.adoptedVersion ? 'approved' : 'pending_review'
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
  const analyze = useAnalyzeRemakePrompt(projectId)
  const selectedShot = snapshot.shots.find((shot) => shot.id === currentSelectedShotId) ?? snapshot.shots[0]
  const allTracks = snapshot.shots.flatMap((shot) => shot.promptTracks ?? [])
  const totalKeyframes = snapshot.shots.length * 3
  const analyzedKeyframes = snapshot.shots.flatMap((shot) => slots.map((slot) => trackFor(shot.promptTracks, `image:${slot}`))).filter((track) => Boolean(track?.latestVersion)).length
  const approvedPrompts = allTracks.filter((track) => Boolean(track.adoptedVersion)).length
  const pendingReview = allTracks.filter((track) => stateFor(track) === 'pending_review').length
  const running = snapshot.tasks.filter((task) => ['queued', 'processing', 'running'].includes(task.status) && task.type.includes('prompt')).length
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
      <div className="lg:col-span-4">
        <RemakeShotOverview
          shots={snapshot.shots}
          selectedShotId={selectedShot.id}
          onSelectShot={setSelectedShotId}
        />
      </div>

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

