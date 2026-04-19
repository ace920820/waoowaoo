'use client'

import React from 'react'

export default function MultiShotStoryboardStage() {
  return (
    <section
      data-stage="multi-shot-storyboard-stage"
      className="rounded-3xl border border-black/10 bg-white/80 p-6"
    >
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
    </section>
  )
}
