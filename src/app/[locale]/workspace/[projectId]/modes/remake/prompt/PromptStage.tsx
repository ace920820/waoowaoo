'use client'

import { useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useAnalyzeRemakePrompt } from '@/lib/query/mutations/remake-prompt-mutations'
import { PromptImageTab } from './PromptImageTab'
import { PromptVideoTab } from './PromptVideoTab'
import './prompt-stage.css'

type Props = { projectId: string; snapshot: RemakeSnapshot }
type Slot = 'start' | 'middle' | 'end'
const slots: Slot[] = ['start', 'middle', 'end']

function trackFor(tracks: PromptTrackSummary[] | undefined, targetKey: PromptTrackSummary['targetKey']) {
  return tracks?.find((track) => track.targetKey === targetKey) ?? null
}

function trackTask(snapshot: RemakeSnapshot, shotId: string, track: PromptTrackSummary | null) {
  return snapshot.tasks.find((task) => task.targetId === track?.id)
    ?? snapshot.tasks.find((task) => task.targetId === shotId && task.type.includes('PROMPT'))
    ?? null
}

function labelForTask(status: string | undefined, track: PromptTrackSummary | null, t: ReturnType<typeof useTranslations>) {
  if (status === 'queued') return t('queued')
  if (status === 'processing' || status === 'running') return t('running')
  if (status === 'failed') return t('failed')
  if (track?.needsReview) return t('needsReview')
  if (track?.latestVersion?.reviewStatus === 'APPROVED') return t('approved')
  if (track?.latestVersion) return t('pendingReview')
  return t('notAnalyzed')
}

export function PromptStage({ projectId, snapshot }: Props) {
  const t = useTranslations('remakeWorkbench')
  const [selectedShotId, setSelectedShotId] = useState(snapshot.shots[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const analyze = useAnalyzeRemakePrompt(projectId)
  const selectedShot = snapshot.shots.find((shot) => shot.id === selectedShotId) ?? snapshot.shots[0]
  const tracks = snapshot.shots.flatMap((shot) => shot.promptTracks ?? [])
  const visibleShots = useMemo(() => snapshot.shots.filter((shot) => {
    if (!`${shot.sequence ?? ''} ${shot.stableKey}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return false
    const shotTracks = shot.promptTracks ?? []
    if (filter === 'pending') return shotTracks.some((track) => track.needsReview || (track.latestVersion && track.latestVersion.reviewStatus !== 'APPROVED'))
    if (filter === 'approved') return shotTracks.length > 0 && shotTracks.every((track) => Boolean(track.adoptedVersion))
    return true
  }), [filter, query, snapshot.shots])
  const eligible = snapshot.shots.filter((shot) => shot.review?.promptEligible).length
  const pending = tracks.filter((track) => track.latestVersion && track.latestVersion.reviewStatus !== 'APPROVED').length
  const approved = tracks.filter((track) => Boolean(track.adoptedVersion)).length
  const failed = snapshot.tasks.filter((task) => task.status === 'failed' && task.type.includes('PROMPT')).length
  const videoTask = snapshot.tasks.find((task) => task.type === 'REMAKE_VIDEO_PROMPT_ANALYZE' && ['queued', 'processing', 'running', 'failed'].includes(task.status))
  const hasVideo = snapshot.shots.some((shot) => trackFor(shot.promptTracks, 'video')?.latestVersion)

  if (!snapshot.source.mediaId && snapshot.shots.length === 0) {
    return <section className="prompt-empty"><h2>{t('prompt')}</h2><p>{t('noSource')}</p></section>
  }
  if (!selectedShot) {
    return <section className="prompt-empty"><h2>{t('prompt')}</h2><p>{t('noPromptEligibleShot')}</p></section>
  }

  return <section className="prompt-stage" data-testid="remake-prompt-stage">
    <header className="prompt-header">
      <div>
        <p className="remake-eyebrow">{t('prompt')}</p>
        <h2>{t('promptTitle')}</h2>
        <p>{t('promptSubtitle')}</p>
      </div>
      <div className="prompt-header-actions">
        <span className="prompt-queue"><AppIcon name="clock" size={15} />{videoTask ? labelForTask(videoTask.status, null, t) : t('videoTaskIdle')}</span>
        <button
          type="button"
          className="prompt-primary"
          disabled={analyze.isPending || eligible === 0}
          onClick={() => analyze.mutate({ kind: 'video', operationKey: crypto.randomUUID() })}
        >
          <AppIcon name={hasVideo ? 'refresh' : 'play'} size={15} />
          {hasVideo ? t('reanalyzeVideo') : t('analyzeVideo')}
        </button>
      </div>
    </header>

      <div className="prompt-metrics" aria-label={t('promptStatusCounts')}>
        <div><span>{t('analyzableShots')}</span><strong>{eligible}<small>{t('shot')}</small></strong></div>
        <div><span>{t('imagePrompt')} {t('pendingReview')}</span><strong>{pending}<small>{t('pendingReview')}</small></strong></div>
        <div><span>{t('imagePrompt')} {t('approved')}</span><strong>{approved}<small>{t('approved')}</small></strong></div>
        <div className={failed ? 'has-failure' : ''}><span>{t('failed')}</span><strong>{failed}<small>{t('failed')}</small></strong></div>
    </div>

    <div className="prompt-mobile-shot-picker">
      <label htmlFor="prompt-shot-selector">{t('selectShot')}</label>
      <select id="prompt-shot-selector" value={selectedShot.id} onChange={(event) => setSelectedShotId(event.target.value)}>
        {snapshot.shots.map((shot) => <option key={shot.id} value={shot.id}>#{shot.sequence ?? '-'} {shot.stableKey}</option>)}
      </select>
    </div>

    <div className="prompt-workarea">
      <aside className="prompt-shot-list" aria-label={t('shotList')}>
        <h3><AppIcon name="video" size={15} />{t('shotList')} <span>{visibleShots.length}</span></h3>
        <label className="prompt-search"><AppIcon name="search" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchShots')} /></label>
        <div className="prompt-filters" role="group" aria-label={t('promptStatusCounts')}>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>{t('all')}</button>
          <button type="button" className={filter === 'pending' ? 'is-active is-pending' : ''} onClick={() => setFilter('pending')}>{t('pendingReview')}</button>
          <button type="button" className={filter === 'approved' ? 'is-active is-approved' : ''} onClick={() => setFilter('approved')}>{t('approved')}</button>
        </div>
        <div className="prompt-shot-scroll">
          {visibleShots.map((shot) => {
            const imageTracks = slots.map((slot) => trackFor(shot.promptTracks, `image:${slot}`))
            const videoTrack = trackFor(shot.promptTracks, 'video')
            const generated = imageTracks.filter((track) => Boolean(track?.latestVersion)).length
            const needsReview = imageTracks.filter((track) => track?.needsReview || (track?.latestVersion && track.latestVersion.reviewStatus !== 'APPROVED')).length
            const adopted = imageTracks.filter((track) => Boolean(track?.adoptedVersion)).length
            return <button key={shot.id} type="button" className={shot.id === selectedShot.id ? 'is-selected' : ''} onClick={() => setSelectedShotId(shot.id)}>
              <div><b>#{shot.sequence ?? '-'}</b><span>{shot.stableKey}</span></div>
              <small>{String(shot.timeRange?.start ?? '-')} - {String(shot.timeRange?.end ?? '-')}</small>
              <div className="prompt-thumb-row">{slots.map((slot) => shot.keyframes?.[slot]?.mediaUrl ? <img key={slot} src={shot.keyframes[slot].mediaUrl ?? ''} alt="" /> : <i key={slot}>{slot[0].toUpperCase()}</i>)}</div>
              <small className="prompt-shot-progress">{t('imageProgress', { count: generated })} · {needsReview ? `${t('pendingReview')} ${needsReview}` : `${t('approved')} ${adopted}`} · {labelForTask(trackTask(snapshot, shot.id, videoTrack)?.status, videoTrack, t)}</small>
            </button>
          })}
        </div>
      </aside>

      <div className="prompt-detail">
        <header className="prompt-shot-heading">
          <div><p>{t('shot')} #{selectedShot.sequence ?? '-'}</p><h3>{selectedShot.stableKey}</h3><span>{String(selectedShot.timeRange?.start ?? '-')} - {String(selectedShot.timeRange?.end ?? '-')}</span></div>
          <em className={selectedShot.review?.promptEligible ? '' : 'is-muted'}>{selectedShot.review?.promptEligible ? t('readyForAnalysis') : selectedShot.review?.reason ?? t('missingPrerequisites')}</em>
        </header>
        <section className="prompt-keyframe-section" aria-label={t('imagePrompt')}>
          <header><h4><AppIcon name="layers" size={16} />{t('imagePrompt')} (Start / Middle / End)</h4><span>{t('imageProgress', { count: 3 })}</span></header>
          <PromptImageTab projectId={projectId} shot={selectedShot} tasks={snapshot.tasks} />
        </section>
        <section className="prompt-video-section" aria-label={t('videoPrompt')}>
          <PromptVideoTab projectId={projectId} shot={selectedShot} sourceMediaUrl={snapshot.source.mediaUrl} task={trackTask(snapshot, selectedShot.id, trackFor(selectedShot.promptTracks, 'video'))} />
        </section>
      </div>
    </div>
  </section>
}
