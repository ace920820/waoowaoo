import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { requestJsonWithError } from './mutation-shared'

export type StoryboardPackageImportMode = 'preview' | 'commit'

export type StoryboardPackageImportRequest = {
  content: string
  filename?: string | null
  contentType?: string | null
  overwriteStrategy?: 'replace-imported'
  preserveGeneratedMedia?: boolean
}

export type StoryboardPackageImportPreviewRequest = StoryboardPackageImportRequest
export type StoryboardPackageImportCommitRequest = StoryboardPackageImportRequest

export type StoryboardPackageAssetMatchView = {
  assetType: 'location' | 'character' | 'prop'
  ref: string
  label: string
  matchName: string
  packageExternalId: string | null
  status: 'matched' | 'script-derived-fallback'
  source: 'id' | 'matchName' | 'name' | 'scriptDerived'
  assetId: string | null
  assetName: string | null
  imageId: string | null
  imageUrl: string | null
  warning: string | null
}

export type StoryboardPackageImportPreviewSegment = {
  packageId: string
  sceneId: string
  segmentId: string
  action: 'create' | 'update'
  existingShotGroupId: string | null
  order: number
  title: string
  sceneLabel: string
  targetDurationSec: number
  templateKey: string
  shotCount: number
  assetMatches: {
    location: StoryboardPackageAssetMatchView[]
    characters: StoryboardPackageAssetMatchView[]
    props: StoryboardPackageAssetMatchView[]
  }
  warnings: string[]
}

export type StoryboardPackageImportPreviewSuccess = {
  ok: true
  mode: StoryboardPackageImportMode
  overwriteStrategy: 'replace-imported'
  preserveGeneratedMedia: boolean
  package: {
    packageId: string
    title: string
    language: 'zh' | 'en' | 'ja'
    sceneCount: number
    segmentCount: number
  }
  summary: {
    totalSegments: number
    createCount: number
    updateCount: number
    warningCount: number
  }
  scenes: Array<{
    sceneId: string
    title: string
    targetDurationSec: number
    directorIntent: string
    segmentIds: string[]
  }>
  segments: StoryboardPackageImportPreviewSegment[]
  warnings: string[]
}

export type StoryboardPackageImportPreviewFailure = {
  ok: false
  error: {
    code: string
    message: string
    issues?: Array<{ code: string; path: string; message: string }>
  }
}

export type StoryboardPackageImportPreviewResult =
  | StoryboardPackageImportPreviewSuccess
  | StoryboardPackageImportPreviewFailure

export type StoryboardPackageImportCommitResult = StoryboardPackageImportPreviewResult & {
  commit?: {
    created: Array<{ segmentId: string; shotGroupId: string }>
    updated: Array<{ segmentId: string; shotGroupId: string }>
  }
}

function buildImportBody(mode: StoryboardPackageImportMode, payload: StoryboardPackageImportRequest) {
  return JSON.stringify({
    mode,
    content: payload.content,
    filename: payload.filename ?? null,
    contentType: payload.contentType ?? null,
    overwriteStrategy: payload.overwriteStrategy || 'replace-imported',
    preserveGeneratedMedia: payload.preserveGeneratedMedia !== false,
  })
}

function importPath(projectId: string, episodeId: string) {
  return `/api/novel-promotion/${projectId}/episodes/${episodeId}/storyboard-package-import`
}

export function usePreviewStoryboardPackageImport(projectId: string, episodeId: string) {
  return useMutation({
    mutationFn: async (payload: StoryboardPackageImportPreviewRequest) => {
      return await requestJsonWithError<StoryboardPackageImportPreviewResult>(
        importPath(projectId, episodeId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: buildImportBody('preview', payload),
        },
        '预览分镜表导入失败',
      )
    },
  })
}

export function useCommitStoryboardPackageImport(projectId: string, episodeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: StoryboardPackageImportCommitRequest) => {
      return await requestJsonWithError<StoryboardPackageImportCommitResult>(
        importPath(projectId, episodeId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: buildImportBody('commit', payload),
        },
        '导入分镜表失败',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
    },
  })
}
