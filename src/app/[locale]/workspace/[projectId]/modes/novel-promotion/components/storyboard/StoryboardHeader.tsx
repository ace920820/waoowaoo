'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassButton, GlassChip, GlassSurface } from '@/components/ui/primitives'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { StoryboardMoodPreset } from '@/lib/storyboard-mood-presets'

interface StoryboardHeaderProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  storyboardMoodPresets: StoryboardMoodPreset[]
  episodeDefaultMoodPresetId: string | null
  onEpisodeDefaultMoodPresetIdChange: (value: string | null) => Promise<void>
  isBatchSubmitting: boolean
  onDownloadAllImages: () => void
  onGenerateAllPanels: () => void
  onBack: () => void
}

export default function StoryboardHeader({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  storyboardMoodPresets,
  episodeDefaultMoodPresetId,
  onEpisodeDefaultMoodPresetIdChange,
  isBatchSubmitting,
  onDownloadAllImages,
  onGenerateAllPanels,
  onBack
}: StoryboardHeaderProps) {
  const t = useTranslations('storyboard')
  const [isSavingMood, setIsSavingMood] = useState(false)
  const storyboardTaskRunningState = runningCount > 0
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: true,
    })
    : null

  return (
    <GlassSurface variant="elevated" className="space-y-4 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('header.storyboardPanel')}</h3>
          <p className="text-sm text-[var(--glass-text-secondary)]">
            {t('header.segmentsCount', { count: totalSegments })}
            {t('header.panelsCount', { count: totalPanels })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {runningCount > 0 ? (
            <GlassChip tone="info" icon={<span className="h-2 w-2 animate-pulse rounded-full bg-current" />}>
              <span className="inline-flex items-center gap-1.5">
                <TaskStatusInline state={storyboardTaskRunningState} />
                <span>({runningCount})</span>
              </span>
            </GlassChip>
          ) : null}
          <GlassChip tone="neutral">{t('header.concurrencyLimit', { count: 10 })}</GlassChip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pendingPanelCount > 0 ? (
          <GlassButton
            variant="primary"
            loading={isBatchSubmitting}
            onClick={onGenerateAllPanels}
            disabled={runningCount > 0}
          >
            {t('header.generateAllPanels')} ({pendingPanelCount})
          </GlassButton>
        ) : null}

        <GlassButton
          variant="secondary"
          loading={isDownloadingImages}
          onClick={onDownloadAllImages}
          disabled={totalPanels === 0}
        >
          {isDownloadingImages ? t('header.downloading') : t('header.downloadAll')}
        </GlassButton>

        <GlassButton variant="ghost" onClick={onBack}>{t('header.back')}</GlassButton>
      </div>

      <div className="rounded-xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)]/60 p-3">
        <div className="mb-2">
          <h4 className="text-sm font-medium text-[var(--glass-text-primary)]">剧集默认分镜氛围</h4>
          <p className="text-xs text-[var(--glass-text-tertiary)]">作为当前剧集的默认值，分镜组和单格可继续覆盖。</p>
        </div>
        <select
          value={episodeDefaultMoodPresetId || ''}
          disabled={isSavingMood}
          onChange={async (event) => {
            setIsSavingMood(true)
            try {
              await onEpisodeDefaultMoodPresetIdChange(event.target.value || null)
            } finally {
              setIsSavingMood(false)
            }
          }}
          className="w-full rounded-lg border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
        >
          <option value="">无剧集默认预设</option>
          {storyboardMoodPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
    </GlassSurface>
  )
}
