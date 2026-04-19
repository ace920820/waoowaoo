import type { ShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import { mergeShotGroupDraftMetadata } from '@/lib/shot-group/draft-metadata'
import {
  resolveShotGroupModeForModel,
  sanitizeShotGroupGenerationOptions,
} from '@/lib/shot-group/video-config'

export function buildShotGroupVideoConfigSnapshot(input: {
  videoModel?: string | null
  generateAudio: boolean
  includeDialogue: boolean
  dialogueLanguage: 'zh' | 'en' | 'ja'
  omniReferenceEnabled: boolean
  smartMultiFrameEnabled: boolean
  generationOptions?: Record<string, string | number | boolean>
  draftMetadata?: ShotGroupDraftMetadata | null
  previousDraftMetadata?: ShotGroupDraftMetadata | null
}) {
  const snapshot = JSON.stringify({
    configVersion: 2,
    mode: resolveShotGroupModeForModel({
      ...input,
      modelKey: input.videoModel,
    }),
    generateAudio: input.generateAudio,
    bgmEnabled: false,
    includeDialogue: input.includeDialogue,
    dialogueLanguage: input.dialogueLanguage,
    ...(input.videoModel ? { videoModel: input.videoModel } : {}),
    generationOptions: sanitizeShotGroupGenerationOptions(input.generationOptions),
  })

  return input.draftMetadata
    ? mergeShotGroupDraftMetadata(snapshot, input.draftMetadata, input.previousDraftMetadata)
    : snapshot
}
