import type {
  OrderedVideoReference,
  VideoReferenceMediaType,
  VideoReferenceRole,
} from './contracts'
import { VIDEO_REFERENCE_ROLE_ORDER } from './contracts'

/**
 * Shared, pure reference-plan builder for Remake video generation.
 *
 * Mirrors the shot-group omni-reference content[] contract:
 *   - images are capped at 9 and audio at 3;
 *   - fixed priority order: keyframes -> action sheet -> characters ->
 *     scene -> props -> character audio;
 *   - the returned plan drives both the frozen task snapshot (server) and the
 *     submit-preview (client), so the UI always matches what the provider gets.
 *
 * Candidates should be supplied already in priority order; the builder
 * re-sorts defensively, assigns contiguous ordinals, and truncates past the
 * provider caps.
 */

export const REMAKE_VIDEO_IMAGE_CAP = 9
export const REMAKE_VIDEO_AUDIO_CAP = 3

export type RemakeReferenceCandidate = {
  role: VideoReferenceRole
  mediaType: VideoReferenceMediaType
  sourceType: string
  label: string
  usage: string
  assetId?: string
  /** Stable MediaObject id (server-resolved) or adopted-candidate media id. */
  mediaId?: string | null
  /** Raw storage key / HTTP URL fallback (server) or signed asset URL (client preview). */
  mediaUrl?: string | null
}

export type RemakeReferencePlanItem = RemakeReferenceCandidate & {
  ordinal: number
}

export function remakeReferenceRoleLabel(role: VideoReferenceRole): string {
  switch (role) {
    case 'start_keyframe':
      return 'Start 起始帧'
    case 'middle_keyframe':
      return 'Middle 中间帧'
    case 'end_keyframe':
      return 'End 结尾帧'
    case 'action_sheet':
      return '动作表'
    case 'character_reference':
      return '角色形象'
    case 'scene_reference':
      return '场景设定'
    case 'prop_reference':
      return '物品设定'
    case 'character_audio_reference':
      return '角色音色'
  }
}

export function remakeReferenceRoleUsage(role: VideoReferenceRole): string {
  switch (role) {
    case 'start_keyframe':
      return '参考镜头起点构图、人物站位和动作起点'
    case 'middle_keyframe':
      return '参考镜头中段构图、人物站位和动作推进'
    case 'end_keyframe':
      return '参考镜头结尾构图、人物站位和动作落点'
    case 'action_sheet':
      return '参考原片镜头顺序、构图和动作节奏；不要把三帧拼接直接做成成片'
    case 'character_reference':
      return '必须保持角色身份、性别、脸型、发型、服装和年龄感一致'
    case 'scene_reference':
      return '参考空间结构、材质、光线方向和场面调度边界'
    case 'prop_reference':
      return '参考关键物品外观，保持触发剧情的道具一致'
    case 'character_audio_reference':
      return '参考角色音色、语气、年龄感和情绪强度；不要当作背景音乐'
  }
}

export function buildRemakeReferencePlan(
  candidates: RemakeReferenceCandidate[],
): RemakeReferencePlanItem[] {
  const sorted = [...candidates].sort(
    (left, right) => VIDEO_REFERENCE_ROLE_ORDER[left.role] - VIDEO_REFERENCE_ROLE_ORDER[right.role],
  )
  const plan: RemakeReferencePlanItem[] = []
  let imageCount = 0
  let audioCount = 0
  let ordinal = 1
  for (const candidate of sorted) {
    if (candidate.mediaType === 'audio') {
      if (audioCount >= REMAKE_VIDEO_AUDIO_CAP) continue
      audioCount += 1
    } else {
      if (imageCount >= REMAKE_VIDEO_IMAGE_CAP) continue
      imageCount += 1
    }
    plan.push({ ...candidate, ordinal })
    ordinal += 1
  }
  return plan
}

/**
 * Build the 参考素材使用说明 suffix appended to the prompt, tokenized as
 * @Image1..@Image9 / @Audio1..@Audio3 in exact content[] order.
 */
export function buildRemakeReferencePromptSuffix(refs: OrderedVideoReference[]): string {
  if (refs.length === 0) return ''
  const ordered = [...refs].sort(
    (left, right) => VIDEO_REFERENCE_ROLE_ORDER[left.role] - VIDEO_REFERENCE_ROLE_ORDER[right.role],
  )
  let imageIndex = 0
  let audioIndex = 0
  const lines = ordered.map((ref) => {
    const isAudio = ref.mediaType === 'audio' || ref.role === 'character_audio_reference'
    if (isAudio) {
      audioIndex += 1
      const label = ref.label || remakeReferenceRoleLabel(ref.role)
      const usage = ref.usage || remakeReferenceRoleUsage(ref.role)
      return `@Audio${audioIndex}（${label}）：${usage}。`
    }
    imageIndex += 1
    const label = ref.label || remakeReferenceRoleLabel(ref.role)
    const usage = ref.usage || remakeReferenceRoleUsage(ref.role)
    return `@Image${imageIndex}（${label}）：${usage}。`
  })
  return [
    '参考素材使用说明：',
    ...lines,
    '请严格按上述 @Image / @Audio 引用理解素材用途，优先保证角色外观、场景质感和声音气质一致。',
  ].join('\n')
}
