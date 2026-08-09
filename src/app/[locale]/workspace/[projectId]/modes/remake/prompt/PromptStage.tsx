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
  const [tab, setTab] = useState<'image' | 'video'>('image')
  const [query, setQuery] = useState('')
  const analyze = useAnalyzeRemakePrompt(projectId)
  const selectedShot = snapshot.shots.find((shot) => shot.id === selectedShotId) ?? snapshot.shots[0]
  const visibleShots = useMemo(() => snapshot.shots.filter((shot) =>
    `${shot.sequence ?? ''} ${shot.stableKey}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  ), [query, snapshot.shots])
  const tracks = snapshot.shots.flatMap((shot) => shot.promptTracks ?? [])
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
      <div><span>{t('analyzableShots')}</span><strong>{eligible}</strong></div>
      <div><span>{t('pendingReview')}</span><strong>{pending}</strong></div>
      <div><span>{t('approved')}</span><strong>{approved}</strong></div>
      <div><span>{t('failed')}</span><strong>{failed}</strong></div>
    </div>

    <div className="prompt-mobile-shot-picker">
      <label htmlFor="prompt-shot-selector">{t('selectShot')}</label>
      <select id="prompt-shot-selector" value={selectedShot.id} onChange={(event) => setSelectedShotId(event.target.value)}>
        {snapshot.shots.map((shot) => <option key={shot.id} value={shot.id}>#{shot.sequence ?? '-'} {shot.stableKey}</option>)}
      </select>
    </div>

    <div className="prompt-workarea">
      <aside className="prompt-shot-list" aria-label={t('shotList')}>
        <h3>{t('shotList')} <span>{visibleShots.length}</span></h3>
        <label className="prompt-search"><AppIcon name="search" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchShots')} /></label>
        <div className="prompt-shot-scroll">
          {visibleShots.map((shot) => {
            const imageTracks = slots.map((slot) => trackFor(shot.promptTracks, `image:${slot}`))
            const videoTrack = trackFor(shot.promptTracks, 'video')
            return <button key={shot.id} type="button" className={shot.id === selectedShot.id ? 'is-selected' : ''} onClick={() => setSelectedShotId(shot.id)}>
              <div><b>#{shot.sequence ?? '-'}</b><span>{shot.stableKey}</span></div>
              <small>{String(shot.timeRange?.start ?? '-')} - {String(shot.timeRange?.end ?? '-')}</small>
              <div className="prompt-thumb-row">{slots.map((slot) => shot.keyframes?.[slot]?.mediaUrl ? <img key={slot} src={shot.keyframes[slot].mediaUrl ?? ''} alt="" /> : <i key={slot}>{slot[0].toUpperCase()}</i>)}</div>
              <small>{t('imageProgress', { count: imageTracks.filter((track) => track?.adoptedVersion).length })} · {labelForTask(trackTask(snapshot, shot.id, videoTrack)?.status, videoTrack, t)}</small>
            </button>
          })}
        </div>
      </aside>

      <div className="prompt-detail">
        <header className="prompt-shot-heading">
          <div><p>{t('shot')} #{selectedShot.sequence ?? '-'}</p><h3>{selectedShot.stableKey}</h3><span>{String(selectedShot.timeRange?.start ?? '-')} - {String(selectedShot.timeRange?.end ?? '-')}</span></div>
          <em className={selectedShot.review?.promptEligible ? '' : 'is-muted'}>{selectedShot.review?.promptEligible ? t('readyForAnalysis') : selectedShot.review?.reason ?? t('missingPrerequisites')}</em>
        </header>
        <div className="prompt-tabs" role="tablist" aria-label={t('promptTabs')}>
          <button type="button" role="tab" aria-selected={tab === 'image'} className={tab === 'image' ? 'is-active' : ''} onClick={() => setTab('image')}><AppIcon name="image" size={15} />{t('imagePrompt')}</button>
          <button type="button" role="tab" aria-selected={tab === 'video'} className={tab === 'video' ? 'is-active' : ''} onClick={() => setTab('video')}><AppIcon name="video" size={15} />{t('videoPrompt')}</button>
        </div>
        {tab === 'image'
          ? <PromptImageTab projectId={projectId} shot={selectedShot} tasks={snapshot.tasks} />
          : <PromptVideoTab projectId={projectId} shot={selectedShot} sourceMediaUrl={snapshot.source.mediaUrl} task={trackTask(snapshot, selectedShot.id, trackFor(selectedShot.promptTracks, 'video'))} />}
      </div>
    </div>
  </section>
}
