'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useRemakePromptTrack } from '@/lib/query/hooks/useRemakeProject'
import { useApproveAndAdoptRemakePrompt, useSaveRemakePromptVersion } from '@/lib/query/mutations/remake-prompt-mutations'
import { getPromptTaskState } from './prompt-review-state'

type Props = { projectId: string; shot: RemakeSnapshot['shots'][number]; task: RemakeSnapshot['tasks'][number] | null; onAnalyzeVideo: () => void; isAnalyzing: boolean }
function videoTrack(tracks: PromptTrackSummary[] | undefined) { return tracks?.find((track) => track.targetKey === 'video') ?? null }

export function PromptVideoTab({ projectId, shot, task, onAnalyzeVideo, isAnalyzing }: Props) {
  // project-level video analysis is intentionally triggered from this card via the supplied callback.
  const t = useTranslations('remakeWorkbench')
  const track = videoTrack(shot.promptTracks)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [adoptedVersionId, setAdoptedVersionId] = useState<string | null>(null)
  const detail = useRemakePromptTrack(projectId, track?.id ?? null, track?.latestVersion ? [track.latestVersion.id] : [])
  const save = useSaveRemakePromptVersion(projectId, track?.id ?? '')
  const approve = useApproveAndAdoptRemakePrompt(projectId, track?.id ?? '')
  const version = detail.data?.selected[0] ?? null
  const isAdopted = Boolean(version && (track?.adoptedVersion?.id === version.id || adoptedVersionId === version.id))
  const state = isAdopted ? 'approved' : getPromptTaskState(task?.status, track)
  const status = state === 'idle' ? t('notAnalyzed') : state === 'pending' ? t('pendingReview') : t(state)
  const isWorking = state === 'queued' || state === 'running'
  const failureMessage = state === 'failed' ? task?.errorMessage || t('analysisFailedHint') : null
  const copy = () => { if (version?.coreText) void navigator.clipboard.writeText(version.coreText) }
  const approveVersion = () => {
    if (!version) return
    approve.mutate(version.id, { onSuccess: () => setAdoptedVersionId(version.id) })
  }
  const statusClass = state === 'approved' ? 'bg-emerald-50 text-emerald-700' : state === 'pending' || state === 'needsReview' ? 'bg-amber-50 text-amber-800' : state === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'

  return <article className="rounded-xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/20 p-5 shadow-sm">
    <header className="flex items-center justify-between border-b border-indigo-100/80 pb-4"><div className="flex items-center gap-2"><span className="rounded-lg bg-indigo-600 p-1.5 text-white"><AppIcon name="video" size={16} /></span><h3 className="text-sm font-bold text-slate-900">{t('videoPrompt')} <span className="font-normal text-slate-400">({t('shot')} #{shot.sequence ?? '-'})</span></h3></div><em className={`rounded-full px-2 py-1 text-xs not-italic ${statusClass}`}>{status}</em></header>
    <div className="mt-4 space-y-4">{isWorking ? <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 text-xs text-indigo-900"><AppIcon name="loader" size={24} className="animate-spin text-indigo-600" />{t('running')}</div> : !track?.latestVersion ? <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white/80 p-4"><div className="flex items-center justify-between"><div className="text-xs text-slate-600"><strong className="block text-slate-800">{t('videoProjectActionHint')}</strong><span>{t('coreEvent')}</span></div><button type="button" disabled={isAnalyzing} onClick={onAnalyzeVideo} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><AppIcon name="play" size={14} />{t('analyzeVideo')}</button></div>{failureMessage ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-700">{failureMessage}</p> : null}</div> : <><div><div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-700"><span>{t('coreEvent')} (v{track.latestVersion.versionNumber})</span><button type="button" onClick={copy} className="inline-flex items-center gap-1 text-slate-500"><AppIcon name="copy" size={12} />{t('copy')}</button></div>{editing ? <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-24 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs" /> : <p className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-700">{version?.coreText ?? t('loadingVersion')}</p>}</div>{track.needsReview ? <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('needsReviewHint')}</p> : null}</>}</div>
    <footer className="mt-4 flex items-center justify-between border-t border-indigo-100/80 pt-3"><button type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600"><AppIcon name="history" size={14} className="text-indigo-600" />{t('versionHistory')}</button>{track?.latestVersion ? <div className="flex gap-2">{editing ? <button type="button" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate({ sourceVersionId: version?.id, coreText: draft.trim() }, { onSuccess: () => setEditing(false) })} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs"><AppIcon name="check" size={14} />{t('saveAsNewVersion')}</button> : <button type="button" onClick={() => { setDraft(version?.coreText ?? ''); setEditing(true) }} className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs">{t('edit')}</button>}<button type="button" disabled={!version || track.needsReview || approve.isPending || isAdopted} onClick={approveVersion} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs text-white disabled:opacity-50"><AppIcon name="check" size={14} />{isAdopted ? t('adopted') : t('approveAndAdopt')}</button></div> : null}</footer>
  </article>
}
