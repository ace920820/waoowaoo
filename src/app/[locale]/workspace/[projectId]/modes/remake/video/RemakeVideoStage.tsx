'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { adaptRemakeShots } from '@/lib/remake-projects/keyframes/adapter'
import { mapRemakeVideoInputs, videoSubmissionDisabled } from '@/lib/remake-projects/keyframes/video-inputs'
import { RemakeProductionTools } from '../RemakeProductionTools'

// VideoStageShell and VideoPanelCardBody remain the original page capabilities;
// this wrapper supplies read-only Remake input groups and no submission seam.

// The Novel page remains authoritative for video generation. Phase 8 intentionally has no video mutation import.
const phaseNineExplanation = '视频生成将在 Phase 9 启用。当前可检查输入、管理资产并调整项目配置。'

function mediaUrl(projectId: string, mediaId: string | null | undefined) {
  return mediaId ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}` : null
}

export default function RemakeVideoStage({ projectId, snapshot }: { projectId: string; snapshot: RemakeSnapshot }) {
  const shots = useMemo(() => adaptRemakeShots(snapshot), [snapshot])
  const cards = useMemo(() => shots.map((shot) => ({ shot, input: mapRemakeVideoInputs(shot) })), [shots])
  const adopted = cards.reduce((total, card) => total + card.input.mainImages.length, 0)
  return <section className="space-y-6 pb-16" data-testid="remake-video-stage" data-video-submission-disabled={videoSubmissionDisabled() ? 'true' : 'false'}>
    <RemakeProductionTools projectId={projectId} />
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Remake Video</p><h2 className="mt-1 text-xl font-bold text-slate-900">成片</h2><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">已采用画面 {adopted}/{shots.length * 3}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Video Prompt：{cards.some((card) => card.input.videoPrompt === 'approved') ? '已批准' : cards.some((card) => card.input.videoPrompt === 'needs_review') ? '需复核' : '缺失'}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">动作表：{cards.some((card) => card.input.actionSheet.status === 'current') ? '当前' : '缺失'}</span></div></header>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status"><AppIcon name="info" size={16} className="mr-2 inline" />{phaseNineExplanation}</div>
    {cards.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">暂无可检查的 Video 输入。</div> : <div className="space-y-5">{cards.map(({ shot, input }) => <article key={shot.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">{shot.label}</h3><p className="text-xs text-slate-500">模型、时长、分辨率、音频与能力配置由项目配置统一管理。</p></div><button type="button" disabled={videoSubmissionDisabled()} aria-disabled="true" className="min-h-11 rounded bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">视频生成（Phase 9）</button></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><InputGroup title="主画面参考（采用的新画面）" description="仅显示明确采用的生成图片，不使用原始帧替代。">{input.mainImages.length ? <div className="grid grid-cols-3 gap-2">{input.mainImages.map((image) => <MediaCard key={image.slot} projectId={projectId} mediaId={image.mediaId} label={image.slot.toUpperCase()} />)}</div> : <Missing text="尚无已采用的新画面。" />}{input.missingMainSlots.length ? <p className="mt-2 text-xs text-amber-700">缺失：{input.missingMainSlots.join('、')}</p> : null}{input.capabilityReason ? <p className="mt-2 text-xs text-slate-500">{input.capabilityReason}</p> : null}</InputGroup><InputGroup title="辅助动作参考（原始三帧动作表）" description="用于原始动作变化参考，不具有采用语义。">{input.actionSheet.status === 'current' && input.actionSheet.mediaId ? <MediaCard vertical projectId={projectId} mediaId={input.actionSheet.mediaId} label="分镜动作表" /> : <Missing text={input.actionSheet.status === 'waiting' ? '等待当前 revision 的原始帧确认。' : '当前 revision 的动作表缺失或已失效。'} />}</InputGroup></div><div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><strong>输入状态：</strong> Video Prompt {input.videoPrompt === 'approved' ? '已批准' : input.videoPrompt === 'needs_review' ? '需复核' : '缺失'}；提交功能在 Phase 9 前保持禁用。</div></article>)}</div>}
  </section>
}

function InputGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="rounded-lg border border-slate-200 p-3"><h4 className="text-sm font-bold text-slate-800">{title}</h4><p className="mb-3 text-xs text-slate-500">{description}</p>{children}</section> }
function MediaCard({ projectId, mediaId, label, vertical }: { projectId: string; mediaId: string; label: string; vertical?: boolean }) { return <div className="overflow-hidden rounded border border-slate-200"><img src={mediaUrl(projectId, mediaId) ?? ''} alt={label} className={vertical ? 'w-full object-contain' : 'aspect-video w-full object-cover'} /><p className="p-2 text-xs text-slate-600">{label}</p></div> }
function Missing({ text }: { text: string }) { return <p className="rounded border border-dashed border-slate-300 p-4 text-xs text-slate-500">{text}</p> }
