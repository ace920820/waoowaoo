import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import VideoPanelCardHeader from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader'
import type { VideoPanelRuntime } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/hooks/useVideoPanelActions'

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  default: () => React.createElement('div', null, 'task-overlay'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: ({ alt }: { alt: string }) => React.createElement('div', null, alt),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

function createRuntime(overrides: Partial<VideoPanelRuntime> = {}): VideoPanelRuntime {
  const runtime = {
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'panelCard.shot') return `镜头 ${String(values?.number ?? '')}`
      if (key === 'firstLastFrame.unlinkAction') return '取消尾帧链接'
      if (key === 'firstLastFrame.linkToNext') return '链接下一镜头'
      if (key === 'panelCard.original') return '原始'
      if (key === 'panelCard.synced') return '同步'
      return key
    },
    panel: {
      storyboardId: 'sb-1',
      panelIndex: 1,
      panelId: 'panel-2',
      imageUrl: 'https://example.com/frame-2.jpg',
      videoUrl: 'https://example.com/panel-2.mp4',
      lipSyncVideoUrl: null,
    },
    panelIndex: 1,
    panelKey: 'sb-1-1',
    layout: {
      isLinked: false,
      isLastFrame: true,
      hasNext: true,
    },
    media: {
      showLipSyncVideo: true,
      onToggleLipSyncVideo: () => undefined,
      onPreviewImage: () => undefined,
      baseVideoUrl: 'https://example.com/panel-2.mp4',
      currentVideoUrl: 'https://example.com/panel-2.mp4',
    },
    taskStatus: {
      isVideoTaskRunning: false,
      isLipSyncTaskRunning: false,
      panelErrorDisplay: null,
      overlayPresentation: null,
    },
    videoModel: {
      selectedModel: 'veo-3.1',
      generationOptions: {},
      missingCapabilityFields: [],
    },
    player: {
      cssAspectRatio: '16 / 9',
      isPlaying: false,
      videoRef: { current: null },
      setIsPlaying: () => undefined,
      handlePlayClick: async () => undefined,
      handlePreviewImage: () => undefined,
    },
    actions: {
      onToggleLink: () => undefined,
      onGenerateVideo: () => undefined,
    },
  }

  return {
    ...runtime,
    ...overrides,
  } as unknown as VideoPanelRuntime
}

describe('VideoPanelCardHeader', () => {
  it('keeps regenerate affordance for an incoming last-frame panel that is not linked outward', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardHeader, {
        runtime: createRuntime(),
      }),
    )

    expect(markup).toContain('refresh')
  })
})
