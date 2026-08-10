'use client'

import { useState } from 'react'
import WorkspaceTopActions from '../novel-promotion/components/WorkspaceTopActions'
import WorkspaceAssetLibraryModal from '../novel-promotion/components/WorkspaceAssetLibraryModal'
import AssetsStage from '../novel-promotion/components/AssetsStage'
import { SettingsModal } from '@/components/ui/config-modals/ConfigEditModal'
import { useProjectData, useProjectAssets, useUserModels } from '@/lib/query/hooks'
import { useUpdateProjectConfig } from '@/lib/query/mutations/useProjectConfigMutations'

export function RemakeProductionTools({ projectId }: { projectId: string }) {
  const [assetOpen, setAssetOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const projectQuery = useProjectData(projectId)
  const assetsQuery = useProjectAssets(projectId)
  const modelsQuery = useUserModels()
  const updateConfig = useUpdateProjectConfig(projectId)
  const project = projectQuery.data
  const config = (project?.novelPromotionData ?? {}) as Record<string, unknown>
  const configString = (key: string): string | undefined => typeof config[key] === 'string' ? config[key] as string : undefined
  const update = (key: string, value: unknown) => { void updateConfig.mutateAsync({ key, value }) }
  const refresh = async () => { await Promise.all([projectQuery.refetch(), assetsQuery.refetch()]) }

  return <>
    <WorkspaceTopActions
      onOpenAssetLibrary={() => setAssetOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      onRefresh={refresh}
      assetLibraryLabel="资产库"
      settingsLabel="项目配置"
      refreshTitle="刷新项目数据"
    />
    <WorkspaceAssetLibraryModal
      isOpen={assetOpen}
      onClose={() => setAssetOpen(false)}
      assetsLoading={assetsQuery.isLoading}
      assetsLoadingState={null}
      hasCharacters={Boolean(assetsQuery.data?.characters?.length)}
      hasLocations={Boolean(assetsQuery.data?.locations?.length)}
      projectId={projectId}
      isAnalyzingAssets={false}
      focusCharacterId={null}
      focusCharacterRequestId={0}
      triggerGlobalAnalyze={false}
      onGlobalAnalyzeComplete={() => undefined}
    />
    {assetOpen ? <div className="sr-only"><AssetsStage projectId={projectId} isAnalyzingAssets={false} focusCharacterId={null} focusCharacterRequestId={0} triggerGlobalAnalyze={false} onGlobalAnalyzeComplete={() => undefined} /></div> : null}
    <SettingsModal
      isOpen={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      availableModels={modelsQuery.data}
      modelsLoaded={!modelsQuery.isLoading}
      artStyle={configString('artStyle')}
      analysisModel={configString('analysisModel')}
      characterModel={configString('characterModel')}
      locationModel={configString('locationModel')}
      imageModel={configString('storyboardModel') ?? configString('imageModel')}
      shotGroupReferenceImageModel={configString('shotGroupReferenceImageModel')}
      editModel={configString('editModel')}
      videoModel={configString('videoModel')}
      audioModel={configString('audioModel')}
      videoRatio={configString('videoRatio')}
      capabilityOverrides={config.capabilityOverrides as never}
      ttsRate={config.ttsRate == null ? undefined : String(config.ttsRate)}
      onArtStyleChange={(value) => update('artStyle', value)}
      onAnalysisModelChange={(value) => update('analysisModel', value)}
      onCharacterModelChange={(value) => update('characterModel', value)}
      onLocationModelChange={(value) => update('locationModel', value)}
      onImageModelChange={(value) => update('storyboardModel', value)}
      onShotGroupReferenceImageModelChange={(value) => update('shotGroupReferenceImageModel', value)}
      onEditModelChange={(value) => update('editModel', value)}
      onVideoModelChange={(value) => update('videoModel', value)}
      onAudioModelChange={(value) => update('audioModel', value)}
      onVideoRatioChange={(value) => update('videoRatio', value)}
      onCapabilityOverridesChange={(value) => update('capabilityOverrides', value)}
      onTTSRateChange={(value) => update('ttsRate', value)}
    />
  </>
}
