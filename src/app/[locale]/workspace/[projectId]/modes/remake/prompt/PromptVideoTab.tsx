'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useRemakePromptTrack } from '@/lib/query/hooks/useRemakeProject'
import { useApproveAndAdoptRemakePrompt, useSaveRemakePromptVersion } from '@/lib/query/mutations/remake-prompt-mutations'

type Props = { projectId: string; shot: RemakeSnapshot['shots'][number]; sourceMediaUrl: string | null; task: RemakeSnapshot['tasks'][number] | null }

function videoTrack(tracks: PromptTrackSummary[] | undefined) {
  return tracks?.find((track) => track.targetKey === 'video') ?? null
}

export function PromptVideoTab({ projectId, shot, sourceMediaUrl, task }: Props) {
  // project-level video analysis is intentionally triggered only by PromptStage.
  const t = useTranslations('remakeWorkbench')
  const track = videoTrack(shot.promptTracks)
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState(false)
  const selectedIds = comparisonIds.length === 2 ? comparisonIds : [viewedVersionId ?? track?.latestVersion?.id].filter((id): id is string => Boolean(id))
  const detail = useRemakePromptTrack(projectId, track?.id ?? null, selectedIds)
  const save = useSaveRemakePromptVersion(projectId, track?.id ?? '')
  const approve = useApproveAndAdoptRemakePrompt(projectId, track?.id ?? '')
  const version = detail.data?.selected[0] ?? null
  const status = task?.status === 'failed' ? t('failed') : task?.status === 'queued' ? t('queued') : task?.status === 'processing' || task?.status === 'running' ? t('running') : track?.needsReview ? t('needsReview') : track?.latestVersion?.reviewStatus === 'APPROVED' ? t('approved') : track?.latestVersion ? t('pendingReview') : t('notAnalyzed')
  const chooseForComparison = (versionId: string) => setComparisonIds((current) => current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current, versionId].slice(-2))

  return <article className="prompt-video">
    <header><div><AppIcon name="video" size={18} /><h3>{t('videoPrompt')}</h3></div><em className="prompt-state">{status}</em></header>
    {sourceMediaUrl ? <video className="prompt-source-video" controls preload="metadata" src={sourceMediaUrl} /> : <p className="prompt-detail-note">{t('sourcePlaybackUnavailable')}</p>}
    {task?.status === 'failed' ? <p className="prompt-error">{task.errorMessage ?? t('videoFailureHint')}</p> : null}
    {!track?.latestVersion ? <p>{t('videoProjectActionHint')}</p> : <>
      <div className="prompt-version-markers"><span>{t('latest')} v{track.latestVersion.versionNumber}</span>{track.adoptedVersion ? <small><AppIcon name="check" size={13} />{t('adopted')} v{track.adoptedVersion.versionNumber}</small> : null}</div>
      {track.needsReview ? <p className="prompt-review-warning"><AppIcon name="alert" size={14} />{t('needsReviewHint')}</p> : null}
      {version ? <div className="prompt-result"><h4>{t('coreEvent')}</h4>{editing ? <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={t('coreEvent')} /> : <p>{version.coreText}</p>}</div> : <p className="prompt-detail-note">{t('loadingVersion')}</p>}
      <div className="prompt-actions">{editing ? <><button type="button" className="prompt-primary" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate({ sourceVersionId: version?.id, coreText: draft.trim() }, { onSuccess: () => setEditing(false) })}><AppIcon name="check" size={14} />{t('saveAsNewVersion')}</button><button type="button" className="prompt-secondary" onClick={() => setEditing(false)}>{t('cancel')}</button></> : <><button type="button" className="prompt-secondary" onClick={() => { setDraft(version?.coreText ?? ''); setEditing(true) }}><AppIcon name="edit" size={14} />{t('edit')}</button><button type="button" className="prompt-secondary" disabled={!version || track.needsReview || approve.isPending} onClick={() => version && approve.mutate(version.id)}><AppIcon name="check" size={14} />{t('approveAndAdopt')}</button></>}</div>
      <button type="button" className="prompt-detail-toggle" onClick={() => setExpanded((value) => !value)}><AppIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} />{t('detailedAnalysis')}</button>
      {expanded && version ? <div className="prompt-full-analysis"><pre>{JSON.stringify(version.parsedOutput, null, 2)}</pre>{version.rawOutput ? <pre>{version.rawOutput}</pre> : null}</div> : null}
      <details className="prompt-history"><summary><AppIcon name="history" size={14} />{t('versionHistory')}</summary><div>{detail.data?.history.map((item) => <div key={item.id} className="prompt-history-row"><button type="button" onClick={() => { setViewedVersionId(item.id); setComparisonIds([]) }}>{t('viewing')} v{item.versionNumber}</button><span>{item.source === 'human' ? t('humanEdit') : t('automatedAnalysis')}</span>{item.id === track.adoptedVersion?.id ? <em>{t('adopted')}</em> : null}<button type="button" onClick={() => chooseForComparison(item.id)}>{comparisonIds.includes(item.id) ? t('removeFromCompare') : t('compare')}</button></div>)}</div></details>
      {comparisonIds.length === 2 && detail.data?.selected.length === 2 ? <div className="prompt-compare" aria-label={t('compare')}><h4>{t('compare')}</h4><div>{detail.data.selected.map((item) => <section key={item.id}><strong>v{item.versionNumber}</strong><p>{item.coreText}</p></section>)}</div></div> : null}
    </>}
  </article>
}
