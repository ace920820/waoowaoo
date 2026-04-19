import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceProjectSnapshot } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot'
import { useWorkspaceStageNavigation } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation'
import { useWorkspaceStageRuntime } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime'
import MultiShotStoryboardStage from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage'
import WorkspaceStageContent from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent'
import VideoStageRoute from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStageRoute'

const mocks = vi.hoisted(() => ({
  capturedVideoStageProps: null as null | Record<string, unknown>,
  useWorkspaceStageRuntimeMock: vi.fn(),
  useWorkspaceEpisodeStageDataMock: vi.fn(),
  useWorkspaceProviderMock: vi.fn(),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage', () => ({
  default: () => React.createElement('div', { 'data-stage': 'config-stage' }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage', () => ({
  default: () => React.createElement('div', { 'data-stage': 'script-stage' }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/StoryboardStage', () => ({
  default: () => React.createElement('div', { 'data-stage': 'storyboard-stage' }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VoiceStageRoute', () => ({
  default: () => React.createElement('div', { 'data-stage': 'voice-stage' }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection', () => ({
  default: (props: Record<string, unknown>) => React.createElement('div', { 'data-shot-group-mode': props.mode }),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/VideoStage', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.capturedVideoStageProps = props
    return React.createElement('div', { 'data-stage': 'video-stage-route' })
  },
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')
  >('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')

  return {
    ...actual,
    useWorkspaceStageRuntime: mocks.useWorkspaceStageRuntimeMock,
  }
})

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData', () => ({
  useWorkspaceEpisodeStageData: mocks.useWorkspaceEpisodeStageDataMock,
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceProvider', () => ({
  useWorkspaceProvider: mocks.useWorkspaceProviderMock,
}))

function captureStageRuntimeValue(params: Record<string, unknown>) {
  let captured: ReturnType<typeof useWorkspaceStageRuntime> | undefined

  function Probe() {
    captured = useWorkspaceStageRuntime(params as never)
    return null
  }

  renderToStaticMarkup(React.createElement(Probe))

  if (!captured) {
    throw new Error('expected stage runtime to be captured')
  }

  return captured
}

function captureProjectSnapshot(args: {
  project: Record<string, unknown>
  episode?: Record<string, unknown> | null
  urlStage?: string | null
}) {
  let captured: ReturnType<typeof useWorkspaceProjectSnapshot> | undefined

  function Probe() {
    captured = useWorkspaceProjectSnapshot(args as never)
    return null
  }

  renderToStaticMarkup(React.createElement(Probe))

  if (!captured) {
    throw new Error('expected project snapshot to be captured')
  }

  return captured
}

function createStageRuntimeParams(overrides: Record<string, unknown> = {}) {
  return {
    assetsLoading: false,
    isSubmittingTTS: false,
    isTransitioning: false,
    isConfirmingAssets: false,
    isStartingStoryToScript: false,
    isStartingScriptToStoryboard: false,
    isPreparingMultiShotDrafts: false,
    videoRatio: '9:16',
    artStyle: 'cinematic',
    storyboardMoodPresets: [],
    storyboardDefaultMoodPresetId: null,
    episodeProductionMode: 'multi_shot',
    videoModel: 'model-1',
    capabilityOverrides: {},
    userVideoModels: [],
    ensureEpisodeMultiShotDrafts: vi.fn().mockResolvedValue(undefined),
    handleUpdateEpisode: vi.fn().mockResolvedValue(undefined),
    handleUpdateConfig: vi.fn().mockResolvedValue(undefined),
    runWithRebuildConfirm: vi.fn().mockResolvedValue(undefined),
    runStoryToScriptFlow: vi.fn().mockResolvedValue(undefined),
    runScriptToStoryboardFlow: vi.fn().mockResolvedValue(undefined),
    handleUpdateClip: vi.fn().mockResolvedValue(undefined),
    openAssetLibrary: vi.fn(),
    handleStageChange: vi.fn(),
    handleGenerateVideo: vi.fn().mockResolvedValue(undefined),
    handleGenerateAllVideos: vi.fn().mockResolvedValue(undefined),
    handleUpdateVideoPrompt: vi.fn().mockResolvedValue(undefined),
    handleUpdatePanelVideoModel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function findElementByType(node: unknown, type: string): React.ReactElement | null {
  if (!node || typeof node !== 'object') return null
  if ('type' in node && (node as React.ReactElement).type === type) {
    return node as React.ReactElement
  }

  const children = 'props' in node ? (node as React.ReactElement).props?.children : undefined
  if (!children) return null

  for (const child of React.Children.toArray(children)) {
    const match = findElementByType(child, type)
    if (match) return match
  }

  return null
}

describe('multi-shot stage routing', () => {
  beforeEach(() => {
    mocks.capturedVideoStageProps = null
    mocks.useWorkspaceStageRuntimeMock.mockReset()
    mocks.useWorkspaceEpisodeStageDataMock.mockReset()
    mocks.useWorkspaceProviderMock.mockReset()
    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      onStageChange: vi.fn(),
    })
    mocks.useWorkspaceProviderMock.mockReturnValue({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      clips: [],
      storyboards: [],
      shotGroups: [],
    })
  })

  it('creates multi-shot drafts before routing to the multi-shot storyboard stage', async () => {
    const ensureEpisodeMultiShotDrafts = vi.fn().mockResolvedValue(undefined)
    const handleStageChange = vi.fn()
    const runWithRebuildConfirm = vi.fn()
    const runScriptToStoryboardFlow = vi.fn()
    const runtime = captureStageRuntimeValue(createStageRuntimeParams({
      episodeProductionMode: 'multi_shot',
      ensureEpisodeMultiShotDrafts,
      handleStageChange,
      runWithRebuildConfirm,
      runScriptToStoryboardFlow,
    }))

    await runtime.onRunScriptToStoryboard()

    expect(ensureEpisodeMultiShotDrafts).toHaveBeenCalledTimes(1)
    expect(handleStageChange).toHaveBeenCalledWith('multi-shot-storyboard')
    expect(runWithRebuildConfirm).not.toHaveBeenCalled()
    expect(runScriptToStoryboardFlow).not.toHaveBeenCalled()
  })

  it('preserves the traditional storyboard launch branch', async () => {
    const ensureEpisodeMultiShotDrafts = vi.fn().mockResolvedValue(undefined)
    const runScriptToStoryboardFlow = vi.fn().mockResolvedValue(undefined)
    const runWithRebuildConfirm = vi.fn().mockResolvedValue(undefined)
    const handleStageChange = vi.fn()
    const runtime = captureStageRuntimeValue(createStageRuntimeParams({
      episodeProductionMode: 'traditional',
      ensureEpisodeMultiShotDrafts,
      runWithRebuildConfirm,
      runScriptToStoryboardFlow,
      handleStageChange,
    }))

    await runtime.onRunScriptToStoryboard()

    expect(runWithRebuildConfirm).toHaveBeenCalledWith('scriptToStoryboard', runScriptToStoryboardFlow)
    expect(ensureEpisodeMultiShotDrafts).not.toHaveBeenCalled()
    expect(handleStageChange).not.toHaveBeenCalled()
  })

  it('normalizes storyboard stage ids by episode production mode', () => {
    const baseProject = { novelPromotionData: null }

    const multiShotSnapshot = captureProjectSnapshot({
      project: baseProject,
      episode: { episodeProductionMode: 'multi_shot' },
      urlStage: 'storyboard',
    })
    const traditionalSnapshot = captureProjectSnapshot({
      project: baseProject,
      episode: { episodeProductionMode: 'traditional' },
      urlStage: 'multi-shot-storyboard',
    })
    const editorSnapshot = captureProjectSnapshot({
      project: baseProject,
      episode: { episodeProductionMode: 'multi_shot' },
      urlStage: 'editor',
    })

    expect(multiShotSnapshot.currentStage).toBe('multi-shot-storyboard')
    expect(traditionalSnapshot.currentStage).toBe('storyboard')
    expect(editorSnapshot.currentStage).toBe('videos')
  })

  it('routes video-stage back navigation to the mode-appropriate storyboard stage', () => {
    const onStageChange = vi.fn()

    mocks.useWorkspaceProviderMock.mockReturnValue({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      clips: [{ id: 'clip-1', start: 0, end: 15, summary: 'clip 1' }],
      storyboards: [],
      shotGroups: [],
    })

    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      episodeProductionMode: 'multi_shot',
      videoModel: 'model-1',
      capabilityOverrides: {},
      videoRatio: '9:16',
      userVideoModels: [],
      onGenerateVideo: vi.fn(),
      onGenerateAllVideos: vi.fn(),
      onStageChange,
      onUpdateVideoPrompt: vi.fn(),
      onUpdatePanelVideoModel: vi.fn(),
      onOpenAssetLibraryForCharacter: vi.fn(),
      onOpenAssetLibrary: vi.fn(),
    })

    renderToStaticMarkup(React.createElement(VideoStageRoute))
    ;(mocks.capturedVideoStageProps?.onBack as (() => void) | undefined)?.()

    expect(onStageChange).toHaveBeenCalledWith('multi-shot-storyboard')

    onStageChange.mockClear()
    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      episodeProductionMode: 'traditional',
      videoModel: 'model-1',
      capabilityOverrides: {},
      videoRatio: '9:16',
      userVideoModels: [],
      onGenerateVideo: vi.fn(),
      onGenerateAllVideos: vi.fn(),
      onStageChange,
      onUpdateVideoPrompt: vi.fn(),
      onUpdatePanelVideoModel: vi.fn(),
      onOpenAssetLibraryForCharacter: vi.fn(),
      onOpenAssetLibrary: vi.fn(),
    })

    renderToStaticMarkup(React.createElement(VideoStageRoute))
    ;(mocks.capturedVideoStageProps?.onBack as (() => void) | undefined)?.()

    expect(onStageChange).toHaveBeenCalledWith('storyboard')
  })

  it('keeps traditional storyboard navigation reachable while exposing the multi-shot stage', () => {
    const multiShotNav = useWorkspaceStageNavigation({
      isAnyOperationRunning: false,
      stageArtifacts: {
        hasStory: true,
        hasScript: true,
        hasStoryboard: false,
        hasVideo: false,
        hasVoice: false,
      },
      episodeProductionMode: 'multi_shot',
      t: (key) => key,
    })
    const traditionalNav = useWorkspaceStageNavigation({
      isAnyOperationRunning: false,
      stageArtifacts: {
        hasStory: true,
        hasScript: true,
        hasStoryboard: false,
        hasVideo: false,
        hasVoice: false,
      },
      episodeProductionMode: 'traditional',
      t: (key) => key,
    })

    const multiShotMarkup = renderToStaticMarkup(
      React.createElement(WorkspaceStageContent, { currentStage: 'multi-shot-storyboard' }),
    )
    const traditionalMarkup = renderToStaticMarkup(
      React.createElement(WorkspaceStageContent, { currentStage: 'storyboard' }),
    )

    expect(multiShotNav.map((item) => item.id)).toEqual([
      'config',
      'script',
      'multi-shot-storyboard',
      'videos',
      'editor',
    ])
    expect(traditionalNav.map((item) => item.id)).toEqual([
      'config',
      'script',
      'storyboard',
      'videos',
      'editor',
    ])
    expect(multiShotMarkup).toContain('multi-shot-storyboard-stage')
    expect(traditionalMarkup).toContain('storyboard-stage')
  })

  it('advances from multi-shot-storyboard to videos only when the continue CTA is pressed', () => {
    const onStageChange = vi.fn()
    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      onStageChange,
    })

    renderToStaticMarkup(React.createElement(MultiShotStoryboardStage))
    expect(onStageChange).not.toHaveBeenCalled()

    const tree = MultiShotStoryboardStage()
    const continueButton = findElementByType(tree, 'button')

    expect(continueButton).not.toBeNull()
    expect(typeof continueButton?.props.onClick).toBe('function')

    continueButton?.props.onClick()

    expect(onStageChange).toHaveBeenCalledWith('videos')
  })
})
