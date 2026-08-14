'use client'

import React from 'react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { PromptTrackSummary, RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import type { ShotUnitBadge } from '@/lib/remake-projects/unit/adapter'

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

export function shotLabel(shot: { sequence: number | null }): string {
  return `镜头${String(shot.sequence ?? 1).padStart(2, '0')}`
}

type RemakeShotOverviewProps = {
  shots: RemakeSnapshot['shots']
  selectedShotId: string
  onSelectShot: (shotId: string) => void
  /** shotId -> unit badge（#N + 三色 tone）；命中的镜头显示「#N 由 unit 交付」徽标（Phase 09.2） */
  unitBadges?: ReadonlyMap<string, ShotUnitBadge> | null
  /** 点击 unit 徽标跳转到该 unit 管理详情 */
  onJumpToUnit?: (unitId: string) => void
}

/**
 * 镜头概览：跨 Prompt / 分镜 / 成片页复用的镜头选择面板。
 * 支持搜索与按 Prompt 状态筛选（全部 / 待审核 / 已批准），
 * 每个镜头展示三帧缩略图与已批准 Prompt 数。
 */
export function RemakeShotOverview({ shots, selectedShotId, onSelectShot, unitBadges, onJumpToUnit }: RemakeShotOverviewProps) {
  const t = useTranslations('remakeWorkbench')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const filteredShots = useMemo(() => shots.filter((shot) => {
    const matches = `${shot.sequence ?? ''} ${shot.stableKey}`.toLowerCase().includes(query.toLowerCase())
    if (!matches) return false
    const states = slots.map((slot) => stateFor(trackFor(shot.promptTracks, `image:${slot}`)))
    if (filter === 'pending_review') return states.includes('pending_review')
    if (filter === 'approved') return states.every((state) => state === 'approved')
    return true
  }), [filter, query, shots])

  return (
    <aside
      className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
      aria-label={t('shotList')}
      data-testid="remake-shot-overview"
    >
      <div className="space-y-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <AppIcon name="film" size={16} className="text-indigo-600" />
          {t('shotList')} ({filteredShots.length})
        </div>
        <label className="relative block">
          <AppIcon name="search" size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchShots')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
          />
        </label>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {([['all', t('all')], ['pending_review', t('pendingReview')], ['approved', t('approved')]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={filter === value ? 'rounded-md bg-slate-900 px-2 py-1 font-medium text-white' : 'rounded-md bg-slate-100 px-2 py-1 text-slate-600'}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 max-h-[650px] space-y-2.5 overflow-y-auto pr-1">
        {filteredShots.map((shot) => (
          <ShotListItem
            key={shot.id}
            shot={shot}
            selected={shot.id === selectedShotId}
            badge={unitBadges?.get(shot.id) ?? null}
            onJumpToUnit={onJumpToUnit}
            onClick={() => onSelectShot(shot.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function ShotListItem({
  shot,
  selected,
  badge,
  onJumpToUnit,
  onClick,
}: {
  shot: RemakeSnapshot['shots'][number]
  selected: boolean
  badge: ShotUnitBadge | null
  onJumpToUnit?: (unitId: string) => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`shot-overview-item-${shot.id}`}
      className={`w-full rounded-xl border p-3 text-left transition-all ${selected ? 'border-indigo-400 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-400/30' : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'}`}
    >
      <div className="mb-1.5 flex justify-between gap-2">
        <span className="line-clamp-2 text-xs font-bold text-slate-900">{shotLabel(shot)}</span>
        <span className="flex shrink-0 items-center gap-1">
          {badge && (
            <span
              data-testid={`unit-badge-${shot.id}`}
              data-unit-number={badge.unitNumber}
              data-unit-tone={badge.toneKey}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                onJumpToUnit?.(badge.unitId)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onJumpToUnit?.(badge.unitId)
                }
              }}
              className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
              #{badge.unitNumber} 由 unit 交付
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {String(shot.timeRange?.start ?? '-')}
          </span>
        </span>
      </div>
      <div className="my-2 grid grid-cols-3 gap-1.5">
        {slots.map((slot) => shot.keyframes?.[slot]?.mediaUrl ? (
          <img key={slot} src={shot.keyframes[slot].mediaUrl} alt="" className="aspect-video w-full rounded-md border border-slate-200 object-cover" />
        ) : (
          <div key={slot} className="aspect-video rounded-md border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <AppIcon name="check" size={12} className="text-emerald-500" />
        Prompt {shot.promptTracks?.filter((track) => Boolean(track.adoptedVersion)).length ?? 0}/4
      </div>
    </button>
  )
}
