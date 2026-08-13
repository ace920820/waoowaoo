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
      return '主画面参考关键帧 · Start 起始帧'
    case 'middle_keyframe':
      return '主画面参考关键帧 · Middle 中间帧'
    case 'end_keyframe':
      return '主画面参考关键帧 · End 结尾帧'
    case 'action_sheet':
      return '动作参考表'
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
      return '这是整段视频的主画面参考关键帧。以它确定画面构成、美术风格、场景光照、人物形象（身份/发型/服装/年龄感）和景别构图，并锚定镜头起点；整段视频的视觉必须与之一致，不得被其他参考改变。'
    case 'middle_keyframe':
      return '这是整段视频的主画面参考关键帧。以它确定画面构成、美术风格、场景光照、人物形象（身份/发型/服装/年龄感）和景别构图，并锚定动作中段（人物站位、景别与构图按此帧衔接）；整段视频的视觉必须与之一致，不得被其他参考改变。'
    case 'end_keyframe':
      return '这是整段视频的主画面参考关键帧。以它确定画面构成、美术风格、场景光照、人物形象（身份/发型/服装/年龄感）和景别构图，并锚定动作结尾（落点、景别与构图按此帧收束）；整段视频的视觉必须与之一致，不得被其他参考改变。'
    case 'action_sheet':
      return '这是开始→中间→结束的三段式二维分镜参考，仅用于传达动作发展顺序、事件内容与镜头变化（人物移动、运镜、景别、场面调度、时间节奏）。不要复制它的画面、画风或人物形象；视觉一律以主画面参考关键帧为准。'
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
function isKeyframeRole(role: VideoReferenceRole): boolean {
  return role === 'start_keyframe' || role === 'middle_keyframe' || role === 'end_keyframe'
}

const AUXILIARY_REFERENCE_ROLES: ReadonlySet<VideoReferenceRole> = new Set([
  'character_reference',
  'scene_reference',
  'prop_reference',
])

/**
 * Build the 参考素材使用说明 suffix appended to the prompt, tokenized as
 * @Image1..@Image9 / @Audio1..@Audio3 in exact content[] order.
 *
 * Sections differentiate reference roles:
 *   - keyframes = 视觉锚点（决定画面、画风、形象与构图）
 *   - action sheet = 动作节拍（只决定画面如何变化、发生什么、如何拍）
 *   - characters / scene / props = 辅助参考
 *   - voices = 声音参考
 * and close with an explicit conflict-resolution rule so the action sheet is
 * never allowed to alter the visuals anchored by the keyframes.
 */
export function buildRemakeReferencePromptSuffix(refs: OrderedVideoReference[]): string {
  if (refs.length === 0) return ''
  const ordered = [...refs].sort(
    (left, right) => VIDEO_REFERENCE_ROLE_ORDER[left.role] - VIDEO_REFERENCE_ROLE_ORDER[right.role],
  )

  const keyframes = ordered.filter((ref) => isKeyframeRole(ref.role))
  const actionSheets = ordered.filter((ref) => ref.role === 'action_sheet')
  const auxiliary = ordered.filter((ref) => AUXILIARY_REFERENCE_ROLES.has(ref.role))
  const audio = ordered.filter(
    (ref) => ref.mediaType === 'audio' || ref.role === 'character_audio_reference',
  )

  let imageIndex = 0
  let audioIndex = 0
  const stripTrailingPeriod = (text: string) => text.replace(/。$/, '')
  const imageLine = (ref: OrderedVideoReference) => {
    imageIndex += 1
    const label = ref.label || remakeReferenceRoleLabel(ref.role)
    const usage = stripTrailingPeriod(ref.usage || remakeReferenceRoleUsage(ref.role))
    return `@Image${imageIndex}（${label}）：${usage}。`
  }
  const audioLine = (ref: OrderedVideoReference) => {
    audioIndex += 1
    const label = ref.label || remakeReferenceRoleLabel(ref.role)
    const usage = stripTrailingPeriod(ref.usage || remakeReferenceRoleUsage(ref.role))
    return `@Audio${audioIndex}（${label}）：${usage}。`
  }

  const sections: string[] = []
  if (keyframes.length > 0) {
    sections.push(`【视觉锚点 — 决定画面、画风、形象与构图】\n${keyframes.map(imageLine).join('\n')}`)
  }
  if (actionSheets.length > 0) {
    sections.push(`【动作节拍 — 只决定画面如何变化、发生什么、如何拍】\n${actionSheets.map(imageLine).join('\n')}`)
  }
  if (auxiliary.length > 0) {
    sections.push(`【辅助参考 — 保持一致性】\n${auxiliary.map(imageLine).join('\n')}`)
  }
  if (audio.length > 0) {
    sections.push(`【声音参考 — 保持音色一致】\n${audio.map(audioLine).join('\n')}`)
  }

  const rules: string[] = []
  if (keyframes.length > 0) {
    rules.push(
      `画面 / 画风 / 形象 / 构图：以主画面参考关键帧为准${keyframes.length > 1 ? '（多张时按 Start→Middle→End 推进）' : ''}；`,
    )
  }
  if (actionSheets.length > 0) {
    rules.push('动作 / 事件 / 镜头节拍：以动作参考表为准；')
  }
  if (keyframes.length > 0 && actionSheets.length > 0) {
    rules.push('两者冲突时，画面细节服从主画面参考关键帧，动作节奏服从动作参考表。')
  }
  if (rules.length > 0) {
    sections.push(`【一致性规则】\n- ${rules.join('\n- ')}`)
  }

  return ['参考素材使用说明：', ...sections].join('\n\n')
}
