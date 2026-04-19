'use client'

import React from 'react'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import ShotGroupVideoSection from './video-stage/ShotGroupVideoSection'

export default function MultiShotStoryboardStage() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { shotGroups } = useWorkspaceEpisodeStageData()
  const onContinueToVideos = () => {
    runtime.onStageChange('videos')
  }

  if (!episodeId) return null

  return (
    <section
      data-stage="multi-shot-storyboard-stage"
      className="space-y-6"
    >
      <div className="rounded-3xl border border-black/10 bg-white/80 p-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-black/45">
              Multi-Shot Confirmation
            </p>
            <h2 className="text-2xl font-semibold text-black">
              多镜头确认
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-black/65">
              草稿创建已完成，视频生成尚未开始。当前页面只用于确认每个片段的分镜参考、模型可直接使用的提示词、嵌入对白和紧凑镜头节奏；进入 videos 前，必须逐段完成确认。
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.03] p-4 text-sm leading-6 text-black/65">
            多镜头快路径会按剧集片段结构自动生成草稿。每个片段对应一个 15 秒视频生成单元，最多承载 9 个镜头；这里先做人审和参考确认，不会直接提交视频生成。
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-black/55">
            <span className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1">剧本</span>
            <span aria-hidden="true">-&gt;</span>
            <span className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1">多镜头分镜/参考确认</span>
            <span aria-hidden="true">-&gt;</span>
            <span className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1">videos</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onContinueToVideos}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/85"
            >
              Continue to videos
            </button>
          </div>
        </div>
      </div>

      <ShotGroupVideoSection
        projectId={projectId}
        episodeId={episodeId}
        shotGroups={shotGroups}
        defaultVideoModel={runtime.videoModel || ''}
        videoModelOptions={runtime.userVideoModels}
        capabilityOverrides={runtime.capabilityOverrides}
        mode="review"
      />
    </section>
  )
}
