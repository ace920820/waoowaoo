import React from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { buildPanelSpeechContractViewModel } from '@/lib/novel-promotion/panel-speech-plan'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'

interface VideoPanelCardBodyProps {
  runtime: VideoPanelRuntime
}

export default function VideoPanelCardBody({ runtime }: VideoPanelCardBodyProps) {
  const {
    t,
    tCommon,
    panel,
    panelIndex,
    panelKey,
    layout,
    actions,
    taskStatus,
    videoModel,
    promptEditor,
    voiceManager,
    lipSync,
    computed,
  } = runtime
  const safeTranslate = (key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }

  const renderCapabilityLabel = (field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }

  const isFirstLastFrameGenerated = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const showsIncomingLinkBadge = layout.isLastFrame && !!layout.prevPanel
  const showsOutgoingLinkBadge = layout.isLinked && !!layout.nextPanel
  const showsPromptEditor = true
  const showsFirstLastFrameActions = layout.isLinked && !!layout.nextPanel
  const hasTailFrameCandidate = layout.hasNext && !!layout.nextPanel
  const cssAspectRatio = layout.videoRatio.replace(':', '/')
  const effectiveGenerateAudio = typeof videoModel.generationOptions.generateAudio === 'boolean'
    ? videoModel.generationOptions.generateAudio
    : true
  const speechContract = panel.speechPlan
    ? buildPanelSpeechContractViewModel({
      speechPlan: panel.speechPlan,
      generateAudio: effectiveGenerateAudio,
    })
    : null

  const renderFramePreview = ({
    imageUrl,
    title,
    source,
    emptyLabel,
    accentClassName,
  }: {
    imageUrl?: string
    title: string
    source: string
    emptyLabel: string
    accentClassName: string
  }) => (
    <div className="space-y-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${accentClassName}`}>
          {title}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg bg-[var(--glass-bg-surface)]" style={{ aspectRatio: cssAspectRatio }}>
        {imageUrl ? (
          <MediaImageWithLoading
            src={imageUrl}
            alt={title}
            containerClassName="h-full w-full"
            className={`h-full w-full object-cover ${runtime.media.onPreviewImage ? 'cursor-zoom-in' : ''}`}
            onClick={() => {
              if (imageUrl) runtime.media.onPreviewImage?.(imageUrl)
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-[var(--glass-text-tertiary)]">
            {emptyLabel}
          </div>
        )}
      </div>
      <div className="text-[11px] text-[var(--glass-text-tertiary)]">{source}</div>
    </div>
  )

  const speechModeToneClassName = speechContract?.effectiveMode === 'dialogue'
    ? 'bg-[var(--glass-accent-from)] text-white'
    : speechContract?.effectiveMode === 'voiceover'
      ? 'bg-[var(--glass-tone-warning-fg)] text-white'
      : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] border border-[var(--glass-stroke-base)]'

  const speechModeLabel = speechContract
    ? t(`panelCard.speechContract.mode.${speechContract.effectiveMode}` as never)
    : null

  const speechSourceLabel = speechContract
    ? t(`panelCard.speechContract.source.${speechContract.source}` as never)
    : null

  const speechSummary = (() => {
    if (!speechContract) return null
    if (!speechContract.audioEnabled && speechContract.matchKind === 'matched') {
      return t('panelCard.speechContract.summary.matchedAudioDisabled')
    }
    if (!speechContract.audioEnabled && speechContract.matchKind === 'fallback') {
      return t('panelCard.speechContract.summary.fallbackAudioDisabled')
    }
    if (!speechContract.audioEnabled) {
      return t('panelCard.speechContract.summary.noneAudioDisabled')
    }
    if (speechContract.matchKind === 'matched') {
      return t('panelCard.speechContract.summary.matched')
    }
    if (speechContract.matchKind === 'fallback') {
      return t('panelCard.speechContract.summary.fallback')
    }
    return t('panelCard.speechContract.summary.none')
  })()

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded font-medium">{panel.textPanel?.shot_type || t('panelCard.unknownShotType')}</span>
        {panel.textPanel?.duration && <span className="text-[var(--glass-text-tertiary)]">{panel.textPanel.duration}{t('promptModal.duration')}</span>}
      </div>

      <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-2">{panel.textPanel?.description}</p>

      {speechContract && speechModeLabel && speechSourceLabel && speechSummary && (
        <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--glass-text-primary)]">{t('panelCard.speechContract.title')}</div>
              <div className="mt-1 text-[11px] text-[var(--glass-text-tertiary)]">{speechSummary}</div>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${speechModeToneClassName}`}>
              {speechModeLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border border-[var(--glass-stroke-base)] px-2 py-0.5 text-[11px] text-[var(--glass-text-secondary)]">
              {speechSourceLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${speechContract.matchKind === 'none'
              ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
              : 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
              }`}>
              {t(`panelCard.speechContract.match.${speechContract.matchKind}` as never)}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${speechContract.audioEnabled
              ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
              : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
              }`}>
              {t(`panelCard.speechContract.audio.${speechContract.audioEnabled ? 'enabled' : 'disabled'}` as never)}
            </span>
          </div>

          {speechContract.lines.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {speechContract.lines.slice(0, 2).map((line, index) => (
                <div key={`${line.lineIndex ?? 'line'}-${index}`} className="rounded-lg bg-[var(--glass-bg-muted)] px-2.5 py-2 text-[11px] text-[var(--glass-text-secondary)]">
                  <div className="font-medium text-[var(--glass-text-primary)]">
                    {line.speaker}
                    {line.parenthetical ? ` (${line.parenthetical})` : ''}
                  </div>
                  <div className="mt-0.5 line-clamp-2">{line.content}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1">
            {speechContract.guardrails.slice(0, 3).map((guardrail) => (
              <div key={guardrail} className="text-[11px] text-[var(--glass-text-tertiary)]">
                {`• ${t(`panelCard.speechContract.guardrail.${guardrail}` as never)}`}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--glass-stroke-base)]">
        {(showsIncomingLinkBadge || showsOutgoingLinkBadge) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {showsIncomingLinkBadge && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${showsOutgoingLinkBadge
                    ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                    : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] border border-[var(--glass-stroke-base)]'
                  }`}
              >
                <AppIcon name={showsOutgoingLinkBadge ? 'link' : 'unplug'} className="w-3 h-3" />
                {t('firstLastFrame.asLastFrameFor', { number: panelIndex })}
              </span>
            )}
            {showsOutgoingLinkBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                <AppIcon name="link" className="w-3 h-3" />
                {t('firstLastFrame.asFirstFrameFor', { number: panelIndex + 2 })}
              </span>
            )}
          </div>
        )}

        <div className="mb-3 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[var(--glass-text-primary)]">{t('firstLastFrame.title')}</div>
              <div className="mt-1 text-[11px] text-[var(--glass-text-tertiary)]">
                {hasTailFrameCandidate
                  ? t(
                    layout.isLinked
                      ? 'firstLastFrame.tailFrameLinkedDescription'
                      : 'firstLastFrame.tailFrameAvailableDescription',
                    { number: panelIndex + 2 },
                  )
                  : t('firstLastFrame.noNextPanelDescription')}
              </div>
            </div>
            {hasTailFrameCandidate ? (
              <button
                onClick={() => actions.onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${layout.isLinked
                  ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                  : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] border border-[var(--glass-stroke-base)]'
                  }`}
              >
                <AppIcon name={layout.isLinked ? 'link' : 'unplug'} className="h-3 w-3" />
                {layout.isLinked ? t('firstLastFrame.unlinkAction') : t('firstLastFrame.linkToNext')}
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[var(--glass-stroke-base)] px-3 py-1 text-[11px] text-[var(--glass-text-tertiary)]">
                {t('firstLastFrame.noNextPanel')}
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {renderFramePreview({
              imageUrl: panel.imageUrl,
              title: t('firstLastFrame.firstFrame'),
              source: t('firstLastFrame.firstFrameSource', { number: panelIndex + 1 }),
              emptyLabel: t('firstLastFrame.noSourceImage'),
              accentClassName: 'bg-[var(--glass-accent-from)] text-white',
            })}
            {renderFramePreview({
              imageUrl: layout.nextPanel?.imageUrl,
              title: t('firstLastFrame.lastFrame'),
              source: hasTailFrameCandidate
                ? t(
                  layout.isLinked
                    ? 'firstLastFrame.lastFrameSourceLinked'
                    : 'firstLastFrame.lastFrameSourceAvailable',
                  { number: panelIndex + 2 },
                )
                : t('firstLastFrame.noNextPanelSource'),
              emptyLabel: hasTailFrameCandidate
                ? t('firstLastFrame.noTailFrameImage')
                : t('firstLastFrame.noNextPanel'),
              accentClassName: layout.isLinked
                ? 'bg-[var(--glass-tone-warning-fg)] text-white'
                : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] border border-[var(--glass-stroke-base)]',
            })}
          </div>
        </div>

        {showsPromptEditor && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[var(--glass-text-tertiary)]">{t('promptModal.promptLabel')}</span>
              {!promptEditor.isEditing && (
                <button onClick={promptEditor.handleStartEdit} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-info-fg)] transition-colors p-0.5">
                  <AppIcon name="edit" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {promptEditor.isEditing ? (
              <div className="relative mb-3">
                <textarea
                  value={promptEditor.editingPrompt}
                  onChange={(event) => promptEditor.setEditingPrompt(event.target.value)}
                  autoFocus
                  className="w-full text-xs p-2 pr-16 border border-[var(--glass-stroke-focus)] rounded-lg bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
                  rows={3}
                  placeholder={t('promptModal.placeholder')}
                />
                <div className="absolute right-1 top-1 flex flex-col gap-1">
                  <button onClick={promptEditor.handleSave} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-accent-from)] text-white rounded">{promptEditor.isSavingPrompt ? '...' : t('panelCard.save')}</button>
                  <button onClick={promptEditor.handleCancelEdit} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] rounded">{t('panelCard.cancel')}</button>
                </div>
              </div>
            ) : (
              <div onClick={promptEditor.handleStartEdit} className="text-xs p-2 border border-[var(--glass-stroke-base)] rounded-lg bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] cursor-pointer">
                {promptEditor.localPrompt || <span className="text-[var(--glass-text-tertiary)] italic">{t('panelCard.clickToEditPrompt')}</span>}
              </div>
            )}

            {showsFirstLastFrameActions ? (() => {
              const linkedNextPanel = layout.nextPanel!
              return (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => actions.onGenerateFirstLastFrame(
                      panel.storyboardId,
                      panel.panelIndex,
                      linkedNextPanel.storyboardId,
                      linkedNextPanel.panelIndex,
                      panelKey,
                      layout.flGenerationOptions,
                      panel.panelId,
                    )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || !panel.imageUrl
                      || !linkedNextPanel.imageUrl
                      || !layout.flModel
                      || layout.flMissingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[120px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {isFirstLastFrameGenerated ? t('firstLastFrame.generated') : taskStatus.isVideoTaskRunning ? taskStatus.taskRunningVideoLabel : t('firstLastFrame.generate')}
                  </button>
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={layout.flModelOptions}
                      value={layout.flModel || undefined}
                      onModelChange={actions.onFlModelChange}
                      capabilityFields={layout.flCapabilityFields.map((field) => ({
                        field: field.field,
                        label: field.label,
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={layout.flGenerationOptions}
                      onCapabilityChange={(field, rawValue) => actions.onFlCapabilityChange(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>
              )
            })() : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      actions.onGenerateVideo(
                        panel.storyboardId,
                        panel.panelIndex,
                        videoModel.selectedModel,
                        undefined,
                        videoModel.generationOptions,
                        panel.panelId,
                      )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || !panel.imageUrl
                      || !videoModel.selectedModel
                      || videoModel.missingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[90px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {panel.videoUrl ? t('stage.hasSynced') : taskStatus.isVideoTaskRunning ? taskStatus.taskRunningVideoLabel : t('panelCard.generateVideo')}
                  </button>
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={videoModel.videoModelOptions}
                      value={videoModel.selectedModel || undefined}
                      onModelChange={(modelKey) => {
                        videoModel.setSelectedModel(modelKey)
                      }}
                      capabilityFields={videoModel.capabilityFields.map((field) => ({
                        field: field.field,
                        label: renderCapabilityLabel(field),
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={videoModel.generationOptions}
                      onCapabilityChange={(field, rawValue) => videoModel.setCapabilityValue(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>

                {computed.showLipSyncSection && (
                  <div className="mt-2">
                    <div className="flex gap-2">
                      <button
                        onClick={computed.canLipSync ? lipSync.handleStartLipSync : undefined}
                        disabled={!computed.canLipSync || taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync}
                        className="flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 bg-[var(--glass-accent-from)] text-white disabled:opacity-50"
                      >
                        {taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync ? (
                          <TaskStatusInline state={taskStatus.lipSyncInlineState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                          <>{t('panelCard.lipSync')}</>
                        )}
                      </button>

                      {(taskStatus.isLipSyncTaskRunning || panel.lipSyncVideoUrl) && voiceManager.hasMatchedAudio && (
                        <button onClick={lipSync.handleStartLipSync} disabled={lipSync.executingLipSync} className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-tone-warning-fg)] text-white">
                          {t('panelCard.redo')}
                        </button>
                      )}
                    </div>

                    {voiceManager.audioGenerateError && (
                      <div className="mt-1 p-1.5 bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-stroke-danger)] rounded text-[10px] text-[var(--glass-tone-danger-fg)]">
                        {voiceManager.audioGenerateError}
                      </div>
                    )}

                    {voiceManager.localVoiceLines.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {voiceManager.localVoiceLines.map((voiceLine) => {
                          const isVoiceTaskRunning = voiceManager.isVoiceLineTaskRunning(voiceLine.id)
                          const voiceAudioRunningState = isVoiceTaskRunning
                            ? resolveTaskPresentationState({ phase: 'processing', intent: 'generate', resource: 'audio', hasOutput: !!voiceLine.audioUrl })
                            : null

                          return (
                            <div key={voiceLine.id} className="flex items-start gap-1.5 p-1.5 bg-[var(--glass-bg-muted)] rounded text-[10px]">
                              {voiceLine.audioUrl ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    voiceManager.handlePlayVoiceLine(voiceLine)
                                  }}
                                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors bg-[var(--glass-bg-muted)]"
                                  title={voiceManager.playingVoiceLineId === voiceLine.id ? t('panelCard.stopVoice') : t('panelCard.play')}
                                >
                                  <AppIcon name="play" className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void voiceManager.handleGenerateAudio(voiceLine)
                                  }}
                                  disabled={isVoiceTaskRunning}
                                  className="flex-shrink-0 px-1.5 py-0.5 bg-[var(--glass-accent-from)] text-white rounded disabled:opacity-50"
                                  title={t('panelCard.generateAudio')}
                                >
                                  {isVoiceTaskRunning ? (
                                    <TaskStatusInline state={voiceAudioRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                  ) : (
                                    tCommon('generate')
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-[var(--glass-text-tertiary)]">{voiceLine.speaker}: </span>
                                <span className="text-[var(--glass-text-secondary)]">&ldquo;{voiceLine.content}&rdquo;</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
