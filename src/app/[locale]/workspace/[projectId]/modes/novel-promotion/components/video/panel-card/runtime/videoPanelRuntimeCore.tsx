'use client'

import { useTranslations } from 'next-intl'
import type { VideoPanelCardShellProps } from '../types'
import { EMPTY_RUNNING_VOICE_LINE_IDS, resolveVisibleBaseVideoUrl } from './shared'
import { usePanelTaskStatus } from './hooks/usePanelTaskStatus'
import { usePanelVideoModel } from './hooks/usePanelVideoModel'
import { usePanelPlayer } from './hooks/usePanelPlayer'
import { usePanelPromptEditor } from './hooks/usePanelPromptEditor'
import { usePanelVoiceManager } from './hooks/usePanelVoiceManager'
import { usePanelLipSync } from './hooks/usePanelLipSync'

export function useVideoPanelActions({
  panel,
  panelIndex,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio = '16:9',
  userVideoModels,
  projectId,
  episodeId,
  runningVoiceLineIds = EMPTY_RUNNING_VOICE_LINE_IDS,
  matchedVoiceLines = [],
  onLipSync,
  showLipSyncVideo,
  onToggleLipSyncVideo,
  isLinked,
  isLastFrame,
  nextPanel,
  prevPanel,
  hasNext,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  flMissingCapabilityFields,
  flCustomPrompt,
  defaultFlPrompt,
  localPrompt,
  isSavingPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
  onGenerateVideo,
  onUpdatePanelVideoModel,
  onToggleLink,
  onFlModelChange,
  onFlCapabilityChange,
  onFlCustomPromptChange,
  onResetFlPrompt,
  onGenerateFirstLastFrame,
  onPreviewImage,
}: VideoPanelCardShellProps) {
  const t = useTranslations('video')
  const tCommon = useTranslations('common')
  const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
  const visibleBaseVideoUrl = resolveVisibleBaseVideoUrl({
    videoUrl: panel.videoUrl,
    videoGenerationMode: panel.videoGenerationMode,
    isLinked,
  })
  const hasVisibleBaseVideo = !!visibleBaseVideoUrl

  const taskStatus = usePanelTaskStatus({
    panel,
    hasVisibleBaseVideo,
    tCommon: (key: string) => tCommon(key as never),
  })

  const videoModel = usePanelVideoModel({
    defaultVideoModel,
    capabilityOverrides,
    userVideoModels,
  })

  const player = usePanelPlayer({
    videoRatio,
    imageUrl: panel.imageUrl,
    videoUrl: visibleBaseVideoUrl,
    lipSyncVideoUrl: panel.lipSyncVideoUrl,
    showLipSyncVideo,
    onPreviewImage,
  })

  const promptEditor = usePanelPromptEditor({
    localPrompt,
    onUpdateLocalPrompt,
    onSavePrompt,
  })

  const voiceManager = usePanelVoiceManager({
    projectId,
    episodeId,
    matchedVoiceLines,
    runningVoiceLineIds,
    audioFailedMessage: t('panelCard.error.audioFailed'),
  })

  const lipSync = usePanelLipSync({
    panel,
    matchedVoiceLines,
    onLipSync,
  })

  const showLipSyncSection = voiceManager.hasMatchedVoiceLines
  const canLipSync = hasVisibleBaseVideo && voiceManager.hasMatchedAudio && !taskStatus.isLipSyncTaskRunning

  return {
    t,
    tCommon,
    panel,
    panelIndex,
    panelKey,
    media: {
      showLipSyncVideo,
      onToggleLipSyncVideo,
      onPreviewImage,
      baseVideoUrl: visibleBaseVideoUrl,
      currentVideoUrl: player.currentVideoUrl,
    },
    taskStatus,
    videoModel,
    player,
    promptEditor: {
      ...promptEditor,
      localPrompt,
      isSavingPrompt,
    },
    voiceManager,
    lipSync,
    layout: {
      isLinked,
      isLastFrame,
      nextPanel,
      prevPanel,
      hasNext,
      flModel,
      flModelOptions,
      flGenerationOptions,
      flCapabilityFields,
      flMissingCapabilityFields,
      flCustomPrompt,
      defaultFlPrompt,
      videoRatio,
    },
    actions: {
      onGenerateVideo,
      onUpdatePanelVideoModel,
      onToggleLink,
      onFlModelChange,
      onFlCapabilityChange,
      onFlCustomPromptChange,
      onResetFlPrompt,
      onGenerateFirstLastFrame,
    },
    computed: {
      showLipSyncSection,
      canLipSync,
      hasVisibleBaseVideo,
    },
  }
}

export type VideoPanelRuntime = ReturnType<typeof useVideoPanelActions>
