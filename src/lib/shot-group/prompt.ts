import type { NovelPromotionShotGroup, NovelPromotionShotGroupItem } from '@/types/project'
import type { ShotGroupTemplateSpec } from './template-registry'
import { normalizeShotGroupVideoMode } from './video-config'
import { parseShotGroupDraftMetadata } from './draft-metadata'
import { CLASSIC_NINE_GRID_PROMPT } from './storyboard-mode-config'

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

function summarizeBindings(group: NovelPromotionShotGroup) {
  const draftMetadata = parseShotGroupDraftMetadata(group.videoReferencesJson)
  return {
    location: draftMetadata?.effectiveLocationAsset ? [draftMetadata.effectiveLocationAsset] : [],
    characters: draftMetadata?.effectiveCharacterAssets ?? [],
    props: draftMetadata?.effectivePropAssets ?? [],
    warnings: draftMetadata?.missingAssetWarnings ?? [],
    storyboardMoodPresetId: draftMetadata?.storyboardMoodPresetId ?? null,
    customMood: draftMetadata?.customMood ?? null,
  }
}

function formatBindingLine(labels: string[], locale: string, emptyLabel: string) {
  if (labels.length === 0) return emptyLabel
  return labels.join(locale === 'en' ? ', ' : '、')
}

function buildAssetDirective(group: NovelPromotionShotGroup, template: ShotGroupTemplateSpec, locale: string) {
  const bindings = summarizeBindings(group)
  const locationLabels = bindings.location.map((asset) => `${asset.label}(${asset.source})`)
  const characterLabels = bindings.characters.map((asset) => `${asset.label}(${asset.source})`)
  const propLabels = bindings.props.map((asset) => `${asset.label}(${asset.source})`)
  const warningLabels = bindings.warnings.map((warning) => warning.assetType)

  if (locale === 'en') {
    return [
      `Asset priority: ${template.assetConstraintInstruction}`,
      `Location constraint: ${formatBindingLine(locationLabels, locale, 'No saved location asset. Fall back to the script scene description.')}`,
      `Character constraint: ${formatBindingLine(characterLabels, locale, 'No saved character asset. Fall back to the script cast description.')}`,
      `Prop constraint: ${formatBindingLine(propLabels, locale, 'No saved prop asset. Fall back to the script prop description.')}`,
      bindings.storyboardMoodPresetId || bindings.customMood
        ? `Mood constraint: preset=${bindings.storyboardMoodPresetId || 'none'}; custom=${bindings.customMood || 'none'}.`
        : 'Mood constraint: no explicit mood override saved.',
      warningLabels.length > 0
        ? `Weak constraints warning: ${warningLabels.join(', ')} are incomplete. Keep generation non-blocking and use script-derived fallback for the missing families.`
        : 'Weak constraints warning: none.',
    ].join('\n')
  }

  return [
    `资产优先级：${template.assetConstraintInstruction}`,
    `场景约束：${formatBindingLine(locationLabels, locale, '未保存显式场景资产，回退到剧本场景描述。')}`,
    `角色约束：${formatBindingLine(characterLabels, locale, '未保存显式角色资产，回退到剧本人设描述。')}`,
    `物品约束：${formatBindingLine(propLabels, locale, '未保存显式物品资产，回退到剧本道具描述。')}`,
    bindings.storyboardMoodPresetId || bindings.customMood
      ? `氛围约束：预设=${bindings.storyboardMoodPresetId || '无'}；自定义=${bindings.customMood || '无'}。`
      : '氛围约束：未保存额外氛围覆盖。',
    warningLabels.length > 0
      ? `弱约束提示：${warningLabels.join('、')} 仍不完整，生成时不要阻塞，缺失部分使用剧本回退。`
      : '弱约束提示：无。',
  ].join('\n')
}

function summarizeAssetLabels(group: NovelPromotionShotGroup, locale: string) {
  const bindings = summarizeBindings(group)
  const empty = locale === 'en' ? 'none' : '无'

  return {
    location: bindings.location.map((asset) => asset.label).join(locale === 'en' ? ', ' : '、') || empty,
    characters: bindings.characters.map((asset) => asset.label).join(locale === 'en' ? ', ' : '、') || empty,
    props: bindings.props.map((asset) => asset.label).join(locale === 'en' ? ', ' : '、') || empty,
    mood: bindings.storyboardMoodPresetId || bindings.customMood
      ? `preset=${bindings.storyboardMoodPresetId || empty}; custom=${bindings.customMood || empty}`
      : empty,
  }
}

export function buildShotGroupReferencePrompt(params: {
  group: NovelPromotionShotGroup
  artStyle: string | null
  locale: string
  canvasAspectRatio?: string | null
}) {
  const draftMetadata = parseShotGroupDraftMetadata(params.group.videoReferencesJson)
  const groupPrompt = draftMetadata?.referencePromptText?.trim()
    || params.group.groupPrompt?.trim()
    || '保持同一场景与角色连续性，强调主体关系和环境气氛。'
  const title = params.group.title?.trim() || '未命名镜头组'
  const artStyle = params.artStyle?.trim() || (params.locale === 'en' ? 'consistent cinematic concept art' : '统一电影感写实风格')
  const labels = summarizeAssetLabels(params.group, params.locale)
  const sceneLabel = draftMetadata?.sceneLabel || (params.locale === 'en' ? 'current scene' : '当前场景')
  const canvasDirective = params.canvasAspectRatio?.trim()
    ? (params.locale === 'en'
      ? `Canvas ratio: ${params.canvasAspectRatio}. Return one finished image in this ratio.`
      : `画布比例：${params.canvasAspectRatio}。请输出单张成图，并保持这个比例。`)
    : null

  if (params.locale === 'en') {
    return [
      `Create one mother reference image for shot group: ${title}.`,
      'This is not a storyboard grid. Return one single keyframe-style reference image only.',
      `Scene: ${sceneLabel}.`,
      `Narrative brief: ${groupPrompt}`,
      `Character assets to honor: ${labels.characters}.`,
      `Location assets to honor: ${labels.location}.`,
      `Prop assets to honor: ${labels.props}.`,
      `Mood guidance: ${labels.mood}.`,
      `Style: ${artStyle}.`,
      ...(canvasDirective ? [canvasDirective] : []),
      'Use the provided asset images as visual anchors for identity, costume, environment, and prop fidelity.',
      'Output a single polished cinematic reference image with no storyboard panels, no collage, no captions, and no UI chrome.',
    ].join('\n\n')
  }

  return [
    `请为镜头组《${title}》生成一张辅助参考图。`,
    '这不是分镜表，不要输出九宫格、拼贴、多格构图或任何文字标注，只输出单张母图。',
    `场景：${sceneLabel}。`,
    `剧情摘要：${groupPrompt}`,
    `角色资产约束：${labels.characters}。`,
    `场景资产约束：${labels.location}。`,
    `物品资产约束：${labels.props}。`,
    `氛围约束：${labels.mood}。`,
    `风格要求：${artStyle}。`,
    ...(canvasDirective ? [canvasDirective] : []),
    '请把已提供的资产图作为视觉锚点，确保人物身份、服装、环境和关键物品尽可能贴合。',
    '输出一张完成的、写实电影感的辅助参考图，不要多格分镜、不要字幕、不要界面元素。',
  ].join('\n\n')
}

export function buildShotGroupCompositePrompt(params: {
  group: NovelPromotionShotGroup
  template: ShotGroupTemplateSpec
  artStyle: string | null
  locale: string
  canvasAspectRatio?: string | null
}) {
  const draftMetadata = parseShotGroupDraftMetadata(params.group.videoReferencesJson)
  const modePrompt = draftMetadata?.storyboardModePromptText?.trim() || CLASSIC_NINE_GRID_PROMPT
  const storyContent = draftMetadata?.compositePromptText?.trim()
    || params.group.groupPrompt?.trim()
    || '保持同一场景与角色连续性，强调镜头调度与画面叙事。'
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
      `Storyboard mode prompt: ${modePrompt}`,
      `Story content: ${storyContent}`,
      buildAssetDirective(params.group, params.template, params.locale),
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
    `分镜模式提示词：${modePrompt}`,
    `剧情内容：${storyContent}`,
    buildAssetDirective(params.group, params.template, params.locale),
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
