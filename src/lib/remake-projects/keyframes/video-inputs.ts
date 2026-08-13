import type { RemakeShotView } from './adapter'
import type { Character, Location, Prop } from '@/types/project'
import {
  buildRemakeReferencePlan,
  type RemakeReferenceCandidate,
} from '@/lib/remake-projects/video/reference-plan'
import type { VideoReferenceRole } from '@/lib/remake-projects/video/contracts'

export type RemakeVideoInputState = {
  shotId: string
  videoPrompt: 'approved' | 'missing' | 'needs_review'
  mainImages: Array<{ slot: 'start' | 'middle' | 'end'; mediaId: string; source: 'adopted' }>
  missingMainSlots: Array<'start' | 'middle' | 'end'>
  actionSheet: { status: 'current' | 'missing' | 'waiting'; mediaId: string | null; source: 'original_action_sheet' }
  capabilityReason: string | null
  /** Shot-bound asset-library references (scene / characters / props). */
  assetBindings: {
    scene: string | null
    characters: string[]
    props: string[]
  }
}

export type VideoCapabilityInput = {
  supportsStart?: boolean
  supportsMiddle?: boolean
  supportsEnd?: boolean
}

export type SelectedVideoReferences = {
  slots: Array<'start' | 'middle' | 'end'>
  includeActionSheet: boolean
  includeCharacterImages: boolean
  includeLocationImage: boolean
  includePropImages: boolean
  includeCharacterAudio: boolean
}

export const DEFAULT_SELECTED_VIDEO_REFERENCES: SelectedVideoReferences = {
  slots: [],
  includeActionSheet: false,
  includeCharacterImages: true,
  includeLocationImage: true,
  includePropImages: true,
  includeCharacterAudio: false,
}

export type OrderedVideoReferencePreview = Array<{
  ordinal: number
  role: VideoReferenceRole
  slot?: 'start' | 'middle' | 'end'
  mediaId: string | null
  mediaUrl: string | null
  mediaType: 'image' | 'audio'
  source: 'adopted' | 'original_action_sheet' | 'asset'
  label: string
  usage?: string
}>

/** Project-scoped asset summaries used to render the truthful submit preview. */
export type RemakeVideoReferenceAssets = {
  characters: Character[]
  locations: Location[]
  props: Prop[]
}

const SLOT_ROLE_MAP: Record<'start' | 'middle' | 'end', VideoReferenceRole> = {
  start: 'start_keyframe',
  middle: 'middle_keyframe',
  end: 'end_keyframe',
}
const SLOT_LABEL_MAP: Record<'start' | 'middle' | 'end', string> = {
  start: 'Start 起始帧',
  middle: 'Middle 中间帧',
  end: 'End 结尾帧',
}
const SLOT_USAGE_MAP: Record<'start' | 'middle' | 'end', string> = {
  start: '参考镜头起点构图、人物站位和动作起点',
  middle: '参考镜头中段构图、人物站位和动作推进',
  end: '参考镜头结尾构图、人物站位和动作落点',
}
const ACTION_SHEET_USAGE = '参考原片镜头顺序、构图和动作节奏；不要把三帧拼接直接做成成片'
const SCENE_USAGE = '参考空间结构、材质、光线方向和场面调度边界'
const PROP_USAGE = '参考关键物品外观，保持触发剧情的道具一致'
const CHARACTER_USAGE = '必须保持角色身份、性别、脸型、发型、服装和年龄感一致'
const CHARACTER_AUDIO_USAGE = '参考角色音色、语气、年龄感和情绪强度；不要当作背景音乐'

function firstCharacterImage(character: Character): string | null {
  const appearance = character.appearances[0]
  return appearance?.imageUrl ?? null
}

function selectedAssetImage(asset: Location | Prop): string | null {
  const image = asset.images.find((item) => item.id === asset.selectedImageId)
    || asset.images.find((item) => item.isSelected)
    || asset.images[0]
    || null
  return image?.imageUrl ?? null
}

/** Maps authorized Remake facts to truthful Phase 9 video inputs; no fallback frames are synthesized. */
export function mapRemakeVideoInputs(
  shot: RemakeShotView,
  capability: VideoCapabilityInput = {},
): RemakeVideoInputState {
  const allowed = new Set(
    (['start', 'middle', 'end'] as const).filter(
      (slot) =>
        capability[
          `supports${slot[0].toUpperCase()}${slot.slice(1)}` as
            | 'supportsStart'
            | 'supportsMiddle'
            | 'supportsEnd'
        ] !== false,
    ),
  )
  const mainImages = (['start', 'middle', 'end'] as const)
    .filter((slot) => allowed.has(slot))
    .flatMap((slot) => {
      const mediaId = shot.slots[slot].adoptedCandidate?.mediaId
      return mediaId ? [{ slot, mediaId, source: 'adopted' as const }] : []
    })
  const missingMainSlots = (['start', 'middle', 'end'] as const).filter(
    (slot) => allowed.has(slot) && !shot.slots[slot].adoptedCandidate?.mediaId,
  )
  const omitted = (['start', 'middle', 'end'] as const).filter((slot) => !allowed.has(slot))
  const semantics = shot.semantics
  return {
    shotId: shot.id,
    videoPrompt: shot.videoPromptStatus,
    mainImages,
    missingMainSlots,
    actionSheet: {
      status: shot.actionSheet.status,
      mediaId: shot.actionSheet.mediaId,
      source: 'original_action_sheet',
    },
    capabilityReason: omitted.length
      ? `当前视频模型不支持：${omitted.join('、')}`
      : null,
    assetBindings: {
      scene: semantics?.sceneAssetId ?? null,
      characters: semantics?.characterAssetIds ?? [],
      props: semantics?.propAssetIds ?? [],
    },
  }
}

/**
 * Build the exact fixed-order reference list that will be sent to the model.
 *
 * D-04: Start -> Middle -> End -> action-sheet, then asset references
 * (characters -> scene -> props -> character audio) mirroring the omni-reference
 * content[] priority. Images cap at 9, audio at 3. The preview always matches
 * the actual request order (D-05).
 *
 * `assets` is optional: keyframe/action-sheet-only builds still work without it.
 */
export function buildOrderedVideoReferences(
  input: RemakeVideoInputState,
  selected: SelectedVideoReferences,
  assets?: RemakeVideoReferenceAssets | null,
): OrderedVideoReferencePreview {
  const candidates: RemakeReferenceCandidate[] = []

  // Fixed order: Start -> Middle -> End
  for (const slot of ['start', 'middle', 'end'] as const) {
    if (!selected.slots.includes(slot)) continue
    const image = input.mainImages.find((img) => img.slot === slot)
    if (!image) continue
    candidates.push({
      role: SLOT_ROLE_MAP[slot],
      mediaType: 'image',
      sourceType: SLOT_ROLE_MAP[slot],
      label: SLOT_LABEL_MAP[slot],
      usage: SLOT_USAGE_MAP[slot],
      mediaId: image.mediaId,
    })
  }

  // Action sheet last of the anchors
  if (selected.includeActionSheet && input.actionSheet.status === 'current' && input.actionSheet.mediaId) {
    candidates.push({
      role: 'action_sheet',
      mediaType: 'image',
      sourceType: 'action_sheet',
      label: '动作表',
      usage: ACTION_SHEET_USAGE,
      mediaId: input.actionSheet.mediaId,
    })
  }

  // Asset-library references (omni-reference parity)
  if (assets) {
    for (const assetId of input.assetBindings.characters) {
      const character = assets.characters.find((item) => item.id === assetId)
      if (!character) continue
      if (selected.includeCharacterImages) {
        const imageUrl = firstCharacterImage(character)
        if (imageUrl) {
          candidates.push({
            role: 'character_reference',
            mediaType: 'image',
            sourceType: 'character_reference',
            label: `角色 ${character.name}`,
            usage: CHARACTER_USAGE,
            assetId,
            mediaUrl: imageUrl,
          })
        }
      }
      if (selected.includeCharacterAudio && character.customVoiceUrl) {
        candidates.push({
          role: 'character_audio_reference',
          mediaType: 'audio',
          sourceType: 'character_voice_reference',
          label: `角色 ${character.name} 声音`,
          usage: CHARACTER_AUDIO_USAGE,
          assetId,
          mediaUrl: character.customVoiceUrl,
        })
      }
    }

    if (selected.includeLocationImage && input.assetBindings.scene) {
      const location = assets.locations.find((item) => item.id === input.assetBindings.scene)
      if (location) {
        const imageUrl = selectedAssetImage(location)
        if (imageUrl) {
          candidates.push({
            role: 'scene_reference',
            mediaType: 'image',
            sourceType: 'location_reference',
            label: `场景 ${location.name}`,
            usage: SCENE_USAGE,
            assetId: location.id,
            mediaUrl: imageUrl,
          })
        }
      }
    }

    if (selected.includePropImages) {
      for (const assetId of input.assetBindings.props) {
        const prop = assets.props.find((item) => item.id === assetId)
        if (!prop) continue
        const imageUrl = selectedAssetImage(prop)
        if (imageUrl) {
          candidates.push({
            role: 'prop_reference',
            mediaType: 'image',
            sourceType: 'prop_reference',
            label: `物品 ${prop.name}`,
            usage: PROP_USAGE,
            assetId,
            mediaUrl: imageUrl,
          })
        }
      }
    }
  }

  return buildRemakeReferencePlan(candidates).map((item) => ({
    ordinal: item.ordinal,
    role: item.role,
    slot: item.role === 'start_keyframe'
      ? 'start'
      : item.role === 'middle_keyframe'
        ? 'middle'
        : item.role === 'end_keyframe'
          ? 'end'
          : undefined,
    mediaId: item.mediaId ?? null,
    mediaUrl: item.mediaUrl ?? null,
    mediaType: item.mediaType,
    source: item.role === 'action_sheet'
      ? 'original_action_sheet'
      : item.mediaId && !item.mediaUrl
        ? 'adopted'
        : 'asset',
    label: item.label,
    usage: item.usage,
  }))
}

/**
 * D-03 readiness check for the submit button.
 * Returns a list of blocking reasons; empty means ready to submit.
 */
export function videoSubmissionReadiness(
  input: RemakeVideoInputState,
  selected: SelectedVideoReferences,
): string[] {
  const reasons: string[] = []

  // Must select at least one adopted keyframe
  const selectedKeyframes = selected.slots.filter((slot) =>
    input.mainImages.some((img) => img.slot === slot),
  )
  if (selectedKeyframes.length === 0) {
    reasons.push('请至少选择一张已采用的新关键帧')
  }

  // Video prompt must be approved
  if (input.videoPrompt !== 'approved') {
    if (input.videoPrompt === 'needs_review') {
      reasons.push('Video Prompt 需复核后才能生成')
    } else {
      reasons.push('缺少已批准的 Video Prompt')
    }
  }

  // Action sheet selected but not available
  if (
    selected.includeActionSheet &&
    (input.actionSheet.status !== 'current' || !input.actionSheet.mediaId)
  ) {
    reasons.push('当前 revision 的动作表不可用')
  }

  return reasons
}

export function videoSubmissionDisabled() {
  return false
}
