'use client'

import React from 'react'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'

export default function MultiShotStoryboardStage() {
  const runtime = useWorkspaceStageRuntime()
  const onContinueToVideos = () => {
    runtime.onStageChange('videos')
  }

  return (
    <section
      data-stage="multi-shot-storyboard-stage"
      className="rounded-3xl border border-black/10 bg-white/80 p-6"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-black/45">
            Multi-Shot Confirmation
          </p>
          <h2 className="text-2xl font-semibold text-black">
            Multi-shot storyboard confirmation stage
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-black/65">
            Review the clip-derived multi-shot draft set here before continuing into video generation.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.03] p-4 text-sm leading-6 text-black/65">
          This stage is reserved for manual reference confirmation in the fast path. Later plans will
          add the detailed review surface without sending users through the traditional storyboard editor.
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
    </section>
  )
}
