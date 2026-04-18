'use client'

import { useTranslations } from 'next-intl'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import type { StoryboardMoodPreset } from '@/lib/storyboard-mood-presets'
import {
  GlassChip,
  GlassField,
  GlassInput,
  GlassTextarea
} from '@/components/ui/primitives'
import type { UiPatternMode } from './types'
import { AppIcon } from '@/components/ui/icons'

export interface PanelEditFormV2Props {
  panelData: PanelEditData
  isSaving?: boolean
  saveStatus?: 'idle' | 'saving' | 'error'
  saveErrorMessage?: string | null
  onRetrySave?: () => void
  onUpdate: (updates: Partial<PanelEditData>) => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
  storyboardMoodPresets?: StoryboardMoodPreset[]
  uiMode?: UiPatternMode
}

export default function PanelEditFormV2({
  panelData,
  isSaving = false,
  saveStatus = 'idle',
  saveErrorMessage = null,
  onRetrySave,
  onUpdate,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  storyboardMoodPresets = [],
  uiMode = 'flow'
}: PanelEditFormV2Props) {
  const t = useTranslations('storyboard')
  const inheritedMoodPresetLabel = !panelData.storyboardMoodPresetId
    && panelData.effectiveMoodSource
    && panelData.effectiveMoodSource !== 'panel_override'
    ? panelData.effectiveMoodPresetLabel
    : null
  const presetPlaceholderLabel = inheritedMoodPresetLabel
    ? `跟随上层（当前：${inheritedMoodPresetLabel}）`
    : '不使用预设'
  const moodSourceLabel = (() => {
    switch (panelData.effectiveMoodSource) {
      case 'panel_override': return '当前分镜覆盖'
      case 'clip_applied': return '分镜组批量应用'
      case 'episode_default': return '剧集默认'
      case 'project_default': return '项目默认'
      default: return null
    }
  })()

  return (
    <div className={`ui-pattern-form ui-pattern-form-${uiMode} space-y-2`}>
      {saveStatus === 'saving' || isSaving ? (
        <GlassChip tone="info" icon={<span className="h-2 w-2 animate-pulse rounded-full bg-current" />}>
          {t('common.saving')}
        </GlassChip>
      ) : null}
      {saveStatus === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <GlassChip tone="danger">
            {saveErrorMessage || t('common.saveFailed')}
          </GlassChip>
          {onRetrySave ? (
            <button
              type="button"
              onClick={onRetrySave}
              className="glass-btn-base glass-btn-soft px-2 py-1 text-xs"
            >
              {t('common.retrySave')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GlassField label={t('panel.shotTypeLabel')}>
          <GlassInput
            density="compact"
            value={panelData.shotType || ''}
            onChange={(event) => onUpdate({ shotType: event.target.value || null })}
            placeholder={t('panel.shotTypePlaceholder')}
          />
        </GlassField>

        <GlassField label={t('panel.cameraMove')}>
          <GlassInput
            density="compact"
            value={panelData.cameraMove || ''}
            onChange={(event) => onUpdate({ cameraMove: event.target.value || null })}
            placeholder={t('panel.cameraMovePlaceholder')}
          />
        </GlassField>
      </div>

      {panelData.sourceText ? (
        <GlassField label={t('panel.sourceText')}>
          <div className="rounded-[var(--glass-radius-md)] bg-[var(--glass-bg-surface-strong)] px-3 py-2.5">
            <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">&ldquo;{panelData.sourceText}&rdquo;</p>
          </div>
        </GlassField>
      ) : null}

      <GlassField label={t('panel.sceneDescription')}>
        <GlassTextarea
          density="compact"
          rows={2}
          value={panelData.description || ''}
          onChange={(event) => onUpdate({ description: event.target.value })}
          placeholder={t('panel.sceneDescriptionPlaceholder')}
        />
      </GlassField>

      <GlassField label={t('panel.videoPrompt')} hint={t('panel.videoPromptHint')}>
        <GlassTextarea
          density="compact"
          rows={2}
          value={panelData.videoPrompt || ''}
          onChange={(event) => onUpdate({ videoPrompt: event.target.value })}
          placeholder={t('panel.videoPromptPlaceholder')}
        />
      </GlassField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GlassField
          label="分镜氛围预设"
          hint={panelData.effectiveMoodSummary
            ? `当前生效：${panelData.effectiveMoodSummary}`
            : '仅影响当前分镜图片生成，不影响角色/场景资产图'}
        >
          <select
            value={panelData.storyboardMoodPresetId || ''}
            onChange={(event) => onUpdate({ storyboardMoodPresetId: event.target.value || null })}
            className="w-full rounded-[var(--glass-radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
          >
            <option value="">{presetPlaceholderLabel}</option>
            {storyboardMoodPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </GlassField>

        <GlassField
          label="自定义氛围"
          hint={moodSourceLabel
            ? `优先级来源：${moodSourceLabel}`
            : '补充这一格的情绪、空气感或氛围指令'}
        >
          <GlassInput
            density="compact"
            value={panelData.customMood || ''}
            onChange={(event) => onUpdate({ customMood: event.target.value || null })}
            placeholder="例如：潮湿闷热、风雨欲来、温柔克制"
          />
        </GlassField>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <GlassField
          label={t('panel.locationLabel')}
          actions={
            <button
              type="button"
              onClick={onOpenLocationPicker}
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              aria-label={t('panel.editLocation')}
              title={t('panel.editLocation')}
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </button>
          }
        >
          {panelData.location ? (
            <div className="flex flex-wrap gap-1.5">
              <GlassChip tone="success" onRemove={onRemoveLocation}>{panelData.location}</GlassChip>
            </div>
          ) : (
            <p className="text-xs text-[var(--glass-text-tertiary)]">{t('panel.locationNotEdited')}</p>
          )}
        </GlassField>

        <GlassField
          label={t('panel.characterLabelWithCount', { count: panelData.characters.length })}
          actions={
            <button
              type="button"
              onClick={onOpenCharacterPicker}
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              aria-label={t('panel.editCharacter')}
              title={t('panel.editCharacter')}
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </button>
          }
        >
          {panelData.characters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {panelData.characters.map((character, index) => (
                <GlassChip key={`${character.name}-${index}`} tone="info" onRemove={() => onRemoveCharacter(index)}>
                  {character.name}({character.appearance})
                </GlassChip>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--glass-text-tertiary)]">{t('panel.charactersNotEdited')}</p>
          )}
        </GlassField>
      </div>
    </div>
  )
}
