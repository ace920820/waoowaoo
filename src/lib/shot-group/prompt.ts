import type { NovelPromotionShotGroup, NovelPromotionShotGroupItem } from '@/types/project'
import type { ShotGroupTemplateSpec } from './template-registry'

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

export function buildShotGroupCompositePrompt(params: {
  group: NovelPromotionShotGroup
  template: ShotGroupTemplateSpec
  artStyle: string | null
  locale: string
}) {
  const groupPrompt = params.group.groupPrompt?.trim() || '保持同一场景与角色连续性，强调镜头调度与画面叙事。'
  const title = params.group.title?.trim() || '未命名镜头组'
  const artStyle = params.artStyle?.trim() || (params.locale === 'en' ? 'consistent cinematic storyboard style' : '统一电影感分镜风格')

  if (params.locale === 'en') {
    return [
      `Create one storyboard composite image for shot group: ${title}.`,
      `Template: ${params.template.label}. ${params.template.layoutInstruction}`,
      'Keep all slots in one coherent scene, consistent characters, wardrobe, lighting, and art direction.',
      `User prompt: ${groupPrompt}`,
      `Style: ${artStyle}`,
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
  const groupPrompt = params.group.groupPrompt?.trim() || '保持同一场景与角色连续性，强调镜头之间的镜头语言推进。'
  const orderedShots = stringifyItems(params.group.items, params.template)

  if (params.locale === 'en') {
    return [
      `Generate one longer video for shot group: ${title}.`,
      `Current MVP input uses the shot group's composite storyboard image as the primary reference.`,
      `Template: ${params.template.label}. Keep the ordered shot beats, camera progression, and scene continuity.`,
      `User prompt: ${groupPrompt}`,
      'Preserve subject identity, wardrobe, environment, lighting, and cinematic continuity across the whole clip.',
      'Output one coherent continuous video instead of multiple short clips.',
      `Ordered shot beats:\n${orderedShots}`,
    ].join('\n\n')
  }

  return [
    `请为镜头组《${title}》生成一段完整长视频。`,
    '当前 MVP 阶段使用该镜头组的 composite storyboard image 作为主要参考输入。',
    `模板：${params.template.label}。请保留组内镜头顺序、镜头推进节奏和场景连续性。`,
    `组提示词：${groupPrompt}`,
    '要求人物身份、服装、环境、光线和电影感在整段视频中保持一致，不要拆成多段短视频。',
    `有序镜头节拍：\n${orderedShots}`,
  ].join('\n\n')
}
