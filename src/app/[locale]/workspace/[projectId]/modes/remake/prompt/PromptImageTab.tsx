'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useRemakePromptTrack } from '@/lib/query/hooks/useRemakeProject'
import { useAnalyzeRemakePrompt, useApproveAndAdoptRemakePrompt, useSaveRemakePromptVersion } from '@/lib/query/mutations/remake-prompt-mutations'
import { getPromptTaskState } from './prompt-review-state'

type Slot = 'start' | 'middle' | 'end'
type Props = { projectId: string; shot: RemakeSnapshot['shots'][number]; tasks: RemakeSnapshot['tasks'] }
const slots: Slot[] = ['start', 'middle', 'end']

function trackFor(tracks: PromptTrackSummary[] | undefined, slot: Slot) {
  return tracks?.find((track) => track.targetKey === `image:${slot}`) ?? null
}

export function findImagePromptTask(tasks: Props['tasks'], track: PromptTrackSummary | null, shotId: string) {
  return tasks.find((task) => task.targetId === track?.id) ?? tasks.find((task) => task.targetId === shotId && task.type === 'remake_image_prompt_analyze') ?? null
}

export function PromptImageTab({ projectId, shot, tasks }: Props) {
  return <>{slots.map((slot) => <ImagePromptPanel key={`${shot.id}-${slot}`} projectId={projectId} shot={shot} slot={slot} task={findImagePromptTask(tasks, trackFor(shot.promptTracks, slot), shot.id)} />)}</>
}

function ImagePromptPanel({ projectId, shot, slot, task }: { projectId: string; shot: Props['shot']; slot: Slot; task: ReturnType<typeof findImagePromptTask> }) {
  const t = useTranslations('remakeWorkbench')
  const track = trackFor(shot.promptTracks, slot)
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const selectedIds = comparisonIds.length === 2 ? comparisonIds : [viewedVersionId ?? track?.latestVersion?.id].filter((id): id is string => Boolean(id))
  const detail = useRemakePromptTrack(projectId, track?.id ?? null, selectedIds)
  const analyze = useAnalyzeRemakePrompt(projectId)
  const save = useSaveRemakePromptVersion(projectId, track?.id ?? '')
  const approve = useApproveAndAdoptRemakePrompt(projectId, track?.id ?? '')
  const version = detail.data?.selected[0] ?? null
  const [draftCore, setDraftCore] = useState('')
  const [draftNegative, setDraftNegative] = useState('')
  const state = getPromptTaskState(task?.status, track)
  const isWorking = state === 'queued' || state === 'running'
  const frame = shot.keyframes?.[slot]
  const status = state === 'idle' ? t('notAnalyzed') : state === 'pending' ? t('pendingReview') : t(state)
  const beginEdit = () => {
    setDraftCore(version?.coreText ?? '')
    setDraftNegative(version?.negativeConstraints.join('\n') ?? '')
    setEditing(true)
  }
  const chooseForComparison = (versionId: string) => {
    setComparisonIds((current) => current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current, versionId].slice(-2))
  }

  return <article className="prompt-frame flex min-w-0 flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
    <header><b>{slot.toUpperCase()}</b><span>{t(`frame.${slot}`)}</span><em className={`prompt-state ${state}`}>{status}</em></header>
    {frame?.mediaUrl ? <div className="relative overflow-hidden rounded-md">{isWorking ? <img src={frame.mediaUrl} alt={t('frameImage', { frame: t(`frame.${slot}`) })} className="blur-sm" /> : <a href={frame.mediaUrl} target="_blank" rel="noreferrer"><img src={frame.mediaUrl} alt={t('frameImage', { frame: t(`frame.${slot}`) })} /></a>}{isWorking ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/55 text-xs text-white backdrop-blur-sm"><AppIcon name="sparkles" size={24} className="animate-spin text-indigo-300" />AI Prompt 分析生成中...</div> : null}</div> : <div className="prompt-media-empty">{t('noKeyframe')}</div>}
    {state === 'failed' ? <p className="prompt-error">{task?.errorMessage ?? t('analysisFailedHint')}</p> : null}
    {isWorking ? null : !track?.latestVersion ? <button type="button" className="prompt-primary" disabled={!shot.review?.promptEligible || analyze.isPending || !frame?.mediaUrl} onClick={() => analyze.mutate({ kind: 'image', shotId: shot.id, slot, operationKey: crypto.randomUUID() })}><AppIcon name={state === 'failed' ? 'refresh' : 'play'} size={14} />{state === 'failed' ? t('retry') : t('analyzeImage')}</button> : <>
      <div className="prompt-version-markers"><span>{t('latest')} v{track.latestVersion.versionNumber}</span>{track.adoptedVersion ? <small><AppIcon name="check" size={13} />{t('adopted')} v{track.adoptedVersion.versionNumber}</small> : null}</div>
      {track.needsReview ? <p className="prompt-review-warning"><AppIcon name="alert" size={14} />{t('needsReviewHint')}</p> : null}
      {version ? <div className="prompt-result"><h4>{t('integratedPrompt')}</h4>{editing ? <textarea value={draftCore} onChange={(event) => setDraftCore(event.target.value)} aria-label={t('integratedPrompt')} /> : <p>{version.coreText}</p>}<h4>{t('negativeConstraints')}</h4>{editing ? <textarea value={draftNegative} onChange={(event) => setDraftNegative(event.target.value)} aria-label={t('negativeConstraints')} /> : <p>{version.negativeConstraints.join(' · ') || t('none')}</p>}</div> : <p className="prompt-detail-note">{t('loadingVersion')}</p>}
      <div className="prompt-actions">
        {editing ? <><button type="button" className="prompt-primary" disabled={!draftCore.trim() || save.isPending} onClick={() => save.mutate({ sourceVersionId: version?.id, coreText: draftCore.trim(), negativeConstraints: draftNegative.split('\n').map((item) => item.trim()).filter(Boolean) }, { onSuccess: () => setEditing(false) })}><AppIcon name="check" size={14} />{t('saveAsNewVersion')}</button><button type="button" className="prompt-secondary" onClick={() => setEditing(false)}>{t('cancel')}</button></> : <><button type="button" className="prompt-secondary" onClick={beginEdit}><AppIcon name="edit" size={14} />{t('edit')}</button><button type="button" className="prompt-secondary" disabled={!version || track.needsReview || approve.isPending} onClick={() => version && approve.mutate(version.id)}><AppIcon name="check" size={14} />{t('approveAndAdopt')}</button></>}
      </div>
      <button type="button" className="prompt-detail-toggle" onClick={() => setExpanded((value) => !value)}><AppIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} />{t('fullAnalysis')}</button>
      {expanded && version ? <div className="prompt-full-analysis"><p>{t('viewing')} v{version.versionNumber}</p><pre>{JSON.stringify(version.parsedOutput, null, 2)}</pre>{version.rawOutput ? <><p>{t('rawOutput')}</p><pre>{version.rawOutput}</pre></> : null}</div> : null}
      <details className="prompt-history"><summary><AppIcon name="history" size={14} />{t('versionHistory')}</summary><div>{detail.data?.history.map((item) => <div key={item.id} className="prompt-history-row"><button type="button" onClick={() => { setViewedVersionId(item.id); setComparisonIds([]) }}>{t('viewing')} v{item.versionNumber}</button><span>{item.source === 'human' ? t('humanEdit') : t('automatedAnalysis')}</span>{item.id === track.adoptedVersion?.id ? <em>{t('adopted')}</em> : null}<button type="button" onClick={() => chooseForComparison(item.id)}>{comparisonIds.includes(item.id) ? t('removeFromCompare') : t('compare')}</button></div>)}</div></details>
      {comparisonIds.length === 2 && detail.data?.selected.length === 2 ? <div className="prompt-compare" aria-label={t('compare')}><h4>{t('compare')}</h4><div>{detail.data.selected.map((item) => <section key={item.id}><strong>v{item.versionNumber}</strong><p>{item.coreText}</p><small>{item.negativeConstraints.join(' · ')}</small></section>)}</div></div> : null}
    </>}
  </article>
}
