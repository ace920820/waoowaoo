'use client'

import ScriptView from './ScriptView'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'

export default function ScriptStage() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards, episodeProductionMode } = useWorkspaceEpisodeStageData()

  return (
    <ScriptView
      projectId={projectId}
      episodeId={episodeId}
      clips={clips}
      storyboards={storyboards}
      episodeProductionMode={episodeProductionMode}
      onEpisodeProductionModeChange={runtime.onEpisodeProductionModeChange}
      assetsLoading={runtime.assetsLoading}
      onClipUpdate={runtime.onClipUpdate}
      onOpenAssetLibrary={runtime.onOpenAssetLibrary}
      onGenerateStoryboard={runtime.onRunScriptToStoryboard}
      onPreviewStoryboardPackageImport={runtime.onPreviewStoryboardPackageImport}
      onCommitStoryboardPackageImport={runtime.onCommitStoryboardPackageImport}
      isPreviewingStoryboardPackageImport={runtime.isPreviewingStoryboardPackageImport}
      isCommittingStoryboardPackageImport={runtime.isCommittingStoryboardPackageImport}
      isSubmittingStoryboardBuild={
        runtime.isConfirmingAssets
        || runtime.isStartingScriptToStoryboard
        || runtime.isPreparingMultiShotDrafts
      }
    />
  )
}
