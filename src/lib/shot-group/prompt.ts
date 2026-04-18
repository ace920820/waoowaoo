import type { NovelPromotionShotGroup, NovelPromotionShotGroupItem } from '@/types/project'
import type { ShotGroupTemplateSpec } from './template-registry'
import { normalizeShotGroupVideoMode } from './video-config'

function stringifyItems(items: NovelPromotionShotGroupItem[] | undefined, template: ShotGroupTemplateSpec) {
  const normalized = Array.from({ length: template.slotCount }, (_, index) => {
    const item = items?.find((entry) => entry.itemIndex === index)
    return {
      index: index + 1,
      title: item?.title || template.slotTitles[index] || `镜头 ${index + 1}`,
      prompt: item?.prompt || null,
    }
  })
  return JSON.stringify(normalized, null, 2)
}

function resolveDialogueLanguageLabel(language: NovelPromotionShotGroup['dialogueLanguage'], locale: string) {
  const normalized = language === 'en' || language === 'ja' ? language : 'zh'
  if (locale === 'en') {
    if (normalized === 'en') return 'English'
    if (normalized === 'ja') return 'Japanese'
    return 'Chinese'
  }
  if (normalized === 'en') return '英文'
  if (normalized === 'ja') return '日文'
  return '中文'
}

function buildAudioDirective(group: NovelPromotionShotGroup, locale: string) {
  if (!group.generateAudio) {
    return locale === 'en'
      ? 'Audio: disable generated audio.'
      : '音频策略：不要生成音频轨道。'
  }

  return locale === 'en'
    ? 'Audio: generate audio but do not add background music. Keep only natural ambience, foley, and sync sound when appropriate.'
    : '音频策略：生成音频，但不要背景音乐，只保留环境声、动作声或同期声（如适用）。'
}

function buildDialogueDirective(group: NovelPromotionShotGroup, locale: string) {
  if (!group.includeDialogue) {
    return locale === 'en'
      ? 'Dialogue: no dialogue, voice-over, spoken lines, or subtitles.'
      : '对白策略：不要台词、对白、口播或字幕。'
  }

  const languageLabel = resolveDialogueLanguageLabel(group.dialogueLanguage, locale)
  return locale === 'en'
    ? `Dialogue: if speech is needed, use ${languageLabel} only, keep it concise and natural, and avoid added subtitles unless they belong to the scene itself.`
    : `对白策略：如需要对白或口播，仅使用${languageLabel}，内容简洁自然，不要额外字幕。`
}

export function buildShotGroupCompositePrompt(params: {
  group: NovelPromotionShotGroup
  template: ShotGroupTemplateSpec
  artStyle: string | null
  locale: string
  canvasAspectRatio?: string | null
}) {
  const groupPrompt = params.group.groupPrompt?.trim() || '保持同一场景与角色连续性，强调镜头调度与画面叙事。'
  const title = params.group.title?.trim() || '未命名镜头组'
  const artStyle = params.artStyle?.trim() || (params.locale === 'en' ? 'consistent cinematic storyboard style' : '统一电影感分镜风格')
  const canvasDirective = params.canvasAspectRatio?.trim()
    ? (params.locale === 'en'
      ? `Canvas ratio: ${params.canvasAspectRatio}. Keep the final composite image in this ratio.`
      : `画布比例：${params.canvasAspectRatio}。最终总图保持这个比例输出。`)
    : null

  if (params.locale === 'en') {
    return [
      `Create one storyboard composite image for shot group: ${title}.`,
      `Template: ${params.template.label}. ${params.template.layoutInstruction}`,
      'Keep all slots in one coherent scene, consistent characters, wardrobe, lighting, and art direction.',
      `User prompt: ${groupPrompt}`,
      `Style: ${artStyle}`,
      ...(canvasDirective ? [canvasDirective] : []),
      'Return a single finished composite storyboard image with clearly separated slots and no captions or UI chrome.',
      `Ordered slots:\n${stringifyItems(params.group.items, params.template)}`,
    ].join('\n\n')
  }

  return [
    `请为镜头组《${title}》生成一张完整的分镜稿总图。`,
    `模板：${params.template.label}。${params.template.layoutInstruction}`,
    '要求所有格子处于同一叙事连续体内，角色、服装、空间、光线和风格保持一致。',
    `组提示词：${groupPrompt}`,
    `风格要求：${artStyle}`,
    ...(canvasDirective ? [canvasDirective] : []),
    '只输出一张完成的 composite storyboard image，不要文字标题、字幕、界面边框或多余排版。',
    `有序镜头槽位：\n${stringifyItems(params.group.items, params.template)}`,
  ].join('\n\n')
}

export function buildShotGroupVideoPrompt(params: {
  group: NovelPromotionShotGroup
  template: ShotGroupTemplateSpec
  locale: string
}) {
  const title = params.group.title?.trim() || '未命名镜头组'
  const primaryPrompt = params.group.videoPrompt?.trim()
    || params.group.groupPrompt?.trim()
    || '保持同一场景与角色连续性，强调镜头之间的镜头语言推进。'
  const orderedShots = stringifyItems(params.group.items, params.template)
  const audioDirective = buildAudioDirective(params.group, params.locale)
  const dialogueDirective = buildDialogueDirective(params.group, params.locale)
  const mode = normalizeShotGroupVideoMode({
    mode: params.group.videoMode,
    omniReferenceEnabled: params.group.omniReferenceEnabled,
    smartMultiFrameEnabled: params.group.smartMultiFrameEnabled,
  })
  const referenceDirective = mode === 'omni-reference'
    ? (params.locale === 'en'
      ? 'Reference strategy: use the composite storyboard as the required omni reference for the whole clip.'
      : '参考策略：使用 composite storyboard 作为整段视频的必选 omni reference。')
    : (params.locale === 'en'
      ? 'Reference strategy: use the composite storyboard as the source for smart multi-frame progression.'
      : '参考策略：以 composite storyboard 作为 smart multi-frame 推进依据。')
  const multiFrameDirective = mode === 'smart-multi-frame'
    ? (params.locale === 'en'
      ? 'Multi-shot strategy: follow the slot order strictly, letting each beat transition naturally into the next within one coherent clip.'
      : '多镜头策略：严格按照槽位顺序推进，让每个镜头节拍自然衔接成一个连贯片段。')
    : (params.locale === 'en'
      ? 'Multi-shot strategy: keep the overall continuity, but prioritize the main prompt over extra slot-level orchestration.'
      : '多镜头策略：保持整体连续性，以主提示词为先，不额外强化多帧编排。')

  if (params.locale === 'en') {
    return [
      `Generate one longer video for shot group: ${title}.`,
      'Use Ark official content[] multimodal inputs for visual references.',
      `Template: ${params.template.label}. Keep the ordered shot beats, camera progression, and scene continuity.`,
      `Prompt: ${primaryPrompt}`,
      audioDirective,
      dialogueDirective,
      referenceDirective,
      multiFrameDirective,
      'Preserve subject identity, wardrobe, environment, lighting, and cinematic continuity across the whole clip.',
      'Output one coherent continuous video instead of multiple short clips.',
      `Ordered shot beats:\n${orderedShots}`,
    ].join('\n\n')
  }

  return [
    `请为镜头组《${title}》生成一段完整长视频。`,
    '请使用 Ark 官方 content[] 多模态输入组织视觉参考。',
    `模板：${params.template.label}。请保留组内镜头顺序、镜头推进节奏和场景连续性。`,
    `提示词：${primaryPrompt}`,
    audioDirective,
    dialogueDirective,
    referenceDirective,
    multiFrameDirective,
    '要求人物身份、服装、环境、光线和电影感在整段视频中保持一致，不要拆成多段短视频。',
    `有序镜头节拍：\n${orderedShots}`,
  ].join('\n\n')
}
