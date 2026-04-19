'use client'

import React from 'react'
import ConfigStage from './ConfigStage'
import ScriptStage from './ScriptStage'
import StoryboardStage from './StoryboardStage'
import VideoStageRoute from './VideoStageRoute'
import VoiceStageRoute from './VoiceStageRoute'
import MultiShotStoryboardStage from './MultiShotStoryboardStage'

interface WorkspaceStageContentProps {
  currentStage: string
}

export default function WorkspaceStageContent({
  currentStage,
}: WorkspaceStageContentProps) {
  return (
    <div key={currentStage} className="animate-page-enter">
      {currentStage === 'config' && <ConfigStage />}

      {(currentStage === 'script' || currentStage === 'assets') && <ScriptStage />}

      {currentStage === 'storyboard' && <StoryboardStage />}

      {currentStage === 'multi-shot-storyboard' && <MultiShotStoryboardStage />}

      {currentStage === 'videos' && <VideoStageRoute />}

      {currentStage === 'voice' && <VoiceStageRoute />}
    </div>
  )
}
