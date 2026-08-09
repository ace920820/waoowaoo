'use client'

import { useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useAnalyzeRemakePrompt, useApproveAndAdoptRemakePrompt } from '@/lib/query/mutations/remake-prompt-mutations'
import './prompt-stage.css'

type Props = { projectId: string; snapshot: RemakeSnapshot }
type Slot = 'start' | 'middle' | 'end'
const slots: Slot[] = ['start', 'middle', 'end']

function trackFor(tracks: PromptTrackSummary[] | undefined, key: `image:${Slot}` | 'video') {
  return tracks?.find((track) => track.targetKey === key) ?? null
}

function state(track: PromptTrackSummary | null, taskStatus?: string) {
  if (taskStatus === 'queued' || taskStatus === 'processing') return taskStatus === 'queued' ? 'queued' : 'running'
  if (taskStatus === 'failed') return 'failed'
  if (track?.needsReview) return 'needsReview'
  return track?.latestVersion?.reviewStatus ?? 'idle'
}

function stateLabel(value: string, t: ReturnType<typeof useTranslations>) {
  if (value === 'queued') return t('queued')
  if (value === 'running') return t('running')
  if (value === 'failed') return t('failed')
  if (value === 'needsReview') return t('needsReview')
  if (value === 'PENDING' || value === 'PENDING_REVIEW') return t('pendingReview')
  if (value === 'APPROVED') return t('approved')
  return '未分析'
}

export function PromptStage({ projectId, snapshot }: Props) {
  const t = useTranslations('remakeWorkbench')
  const [selectedShotId, setSelectedShotId] = useState(snapshot.shots[0]?.id ?? '')
  const [tab, setTab] = useState<'image' | 'video'>('image')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const analyze = useAnalyzeRemakePrompt(projectId)
  const selectedShot = snapshot.shots.find((shot) => shot.id === selectedShotId) ?? snapshot.shots[0]
  const eligible = snapshot.shots.filter((shot) => shot.review?.promptEligible).length
  const pending = snapshot.shots.flatMap((shot) => shot.promptTracks ?? []).filter((track) => track.needsReview).length
  const hasVideo = snapshot.shots.some((shot) => trackFor(shot.promptTracks, 'video')?.latestVersion)
  const videoTask = snapshot.tasks.find((task) => task.type === 'REMAKE_VIDEO_PROMPT_ANALYZE' && ['queued', 'processing'].includes(task.status))
  const analyzeVideo = () => analyze.mutate({ kind: 'video', operationKey: crypto.randomUUID() })
  const visibleShots = snapshot.shots.filter((shot) => `${shot.sequence ?? ''} ${shot.stableKey}`.toLowerCase().includes(query.toLowerCase()))

  // A signed playback URL can be absent while SceneDetect shots are already persisted.
  // Treat the server-owned media id or existing shots as the source-of-truth for entry.
  if (!snapshot.source.mediaId && snapshot.shots.length === 0) return <section className="prompt-empty"><h2>{t('prompt')}</h2><p>{t('noSource')}</p></section>
  if (!selectedShot) return <section className="prompt-empty"><h2>{t('prompt')}</h2><p>{t('noPromptEligibleShot')}</p></section>

  return <section className="prompt-stage" data-testid="remake-prompt-stage">
    <header className="prompt-header">
      <div><p className="remake-eyebrow">{t('prompt')}</p><h2>Prompt 结构化分析与审核</h2><p>按镜头审核关键帧与整段视频的结构化 Prompt。</p></div>
      <div className="prompt-header-actions"><span className="prompt-queue"><AppIcon name="clock" size={15} /> {videoTask ? t('running') : `${snapshot.tasks.filter((task) => task.status === 'queued').length} ${t('queued')}`}</span><button type="button" className="prompt-primary" disabled={analyze.isPending || eligible === 0} onClick={analyzeVideo}><AppIcon name="play" size={15} />{hasVideo ? t('reanalyzeVideo') : t('analyzeVideo')}</button></div>
    </header>
    <div className="prompt-metrics"><div><span>可分析镜头</span><strong>{eligible} / {snapshot.shots.length}</strong></div><div><span>{t('pendingReview')}</span><strong>{pending}</strong></div><div><span>{t('approved')}</span><strong>{snapshot.shots.flatMap((shot) => shot.promptTracks ?? []).filter((track) => track.adoptedVersion).length}</strong></div><div><span>图片并发</span><strong>3</strong></div></div>
    <div className="prompt-workarea">
      <aside className="prompt-shot-list"><h3>镜头列表 <span>{visibleShots.length}</span></h3><label className="prompt-search"><AppIcon name="search" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索镜头..." /></label><div className="prompt-filters"><span>全部镜头</span><span>{t('pendingReview')}</span><span>{t('approved')}</span></div><div className="prompt-shot-scroll">{visibleShots.map((shot) => <button key={shot.id} type="button" className={shot.id === selectedShot.id ? 'is-selected' : ''} onClick={() => setSelectedShotId(shot.id)}><div><b>#{shot.sequence ?? '-'}</b><span>{shot.stableKey}</span></div><small>{String(shot.timeRange?.start ?? '-')} - {String(shot.timeRange?.end ?? '-')}</small><div className="prompt-thumb-row">{slots.map((slot) => shot.keyframes?.[slot]?.mediaUrl ? <img key={slot} src={shot.keyframes[slot].mediaUrl!} alt="" /> : <i key={slot}>{slot[0].toUpperCase()}</i>)}</div><small>Prompt 进度: {(shot.promptTracks ?? []).filter((track) => track.adoptedVersion).length}/4</small></button>)}</div></aside>
      <div className="prompt-detail">
        <header className="prompt-shot-heading"><div><p>Shot #{selectedShot.sequence ?? '-'}</p><h3>{selectedShot.stableKey}</h3><span>{String(selectedShot.timeRange?.start ?? '-')} - {String(selectedShot.timeRange?.end ?? '-')}</span></div>{selectedShot.review?.promptEligible ? <em>可分析</em> : <em className="is-muted">{selectedShot.review?.reason ?? '未满足前置条件'}</em>}</header>
        <div className="prompt-tabs"><button className={tab === 'image' ? 'is-active' : ''} onClick={() => setTab('image')}><AppIcon name="image" size={15} />{t('imagePrompt')}</button><button className={tab === 'video' ? 'is-active' : ''} onClick={() => setTab('video')}><AppIcon name="sparkles" size={15} />{t('videoPrompt')}</button></div>
        {tab === 'image' ? <div className="prompt-frames">{slots.map((slot) => <FrameCard key={slot} slot={slot} shot={selectedShot} projectId={projectId} expanded={expanded === slot} onToggle={() => setExpanded(expanded === slot ? null : slot)} />)}</div> : <VideoPanel shot={selectedShot} videoTask={videoTask?.status} />}
      </div>
    </div>
  </section>
}

function FrameCard({ slot, shot, projectId, expanded, onToggle }: { slot: Slot; shot: RemakeSnapshot['shots'][number]; projectId: string; expanded: boolean; onToggle: () => void }) {
  const t = useTranslations('remakeWorkbench'); const analyze = useAnalyzeRemakePrompt(projectId)
  const track = trackFor(shot.promptTracks, `image:${slot}`); const task = useMemo(() => undefined, [])
  const current = state(track, task); const frame = shot.keyframes?.[slot]
  const submit = () => analyze.mutate({ kind: 'image', shotId: shot.id, slot, operationKey: crypto.randomUUID() })
  const approve = useApproveAndAdoptRemakePrompt(projectId, track?.id ?? '')
  return <article className="prompt-frame"><header><b>{slot.toUpperCase()}</b><span>{slot === 'start' ? '起始帧' : slot === 'middle' ? '中间帧' : '结束帧'}</span><em className={`prompt-state ${current}`}>{stateLabel(current, t)}</em></header>{frame?.mediaUrl ? <a href={frame.mediaUrl} target="_blank" rel="noreferrer"><img src={frame.mediaUrl} alt={`${slot} frame`} /></a> : <div className="prompt-media-empty">无关键帧</div>}
    {!track?.latestVersion ? <button className="prompt-primary" disabled={!shot.review?.promptEligible || analyze.isPending} onClick={submit}><AppIcon name="play" size={14} />{current === 'failed' ? t('retry') : '分析图片 Prompt'}</button> : <><div className="prompt-version"><span>{t('latest')} v{track.latestVersion.versionNumber}</span>{track.adoptedVersion ? <small><AppIcon name="check" size={13} />{t('adopted')} v{track.adoptedVersion.versionNumber}</small> : null}</div><button className="prompt-detail-toggle" onClick={onToggle}>{t('fullAnalysis')}{expanded ? <AppIcon name="chevronUp" size={15} /> : <AppIcon name="chevronDown" size={15} />}</button>{expanded ? <p className="prompt-detail-note">完整结果、原始输出和版本比较可从版本记录中查看。</p> : null}{track.latestVersion.reviewStatus === 'PENDING' ? <button className="prompt-secondary" disabled={approve.isPending} onClick={() => approve.mutate(track.latestVersion!.id)}><AppIcon name="check" size={14} />{t('approveAndAdopt')}</button> : null}<span className="prompt-history"><AppIcon name="history" size={14} />{t('versionHistory')}</span></>}</article>
}

function VideoPanel({ shot, videoTask }: { shot: RemakeSnapshot['shots'][number]; videoTask?: string }) { const t = useTranslations('remakeWorkbench'); const track = trackFor(shot.promptTracks, 'video'); const current = state(track, videoTask); return <article className="prompt-video"><header><div><AppIcon name="sparkles" size={18} /><h3>{t('videoPrompt')}</h3></div><em className={`prompt-state ${current}`}>{stateLabel(current, t)}</em></header><p>{track?.latestVersion ? '当前镜头的核心动作、调度与镜头运动结果可在版本详情中查看和编辑。' : '请使用页面顶部的“分析整段视频”来一次性分析全部已确认镜头。'}</p>{track?.adoptedVersion ? <small><AppIcon name="check" size={14} />{t('adopted')} v{track.adoptedVersion.versionNumber}</small> : null}<span className="prompt-history"><AppIcon name="history" size={14} />{t('versionHistory')}</span></article> }
