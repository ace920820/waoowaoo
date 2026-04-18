import type { NovelPromotionShotGroupTemplateKey } from '@/types/project'

export type ShotGroupTemplateSpec = {
  key: NovelPromotionShotGroupTemplateKey
  label: string
  slotCount: number
  layoutInstruction: string
  slotTitles: string[]
}

export const SHOT_GROUP_TEMPLATE_REGISTRY: Record<NovelPromotionShotGroupTemplateKey, ShotGroupTemplateSpec> = {
  'grid-4': {
    key: 'grid-4',
    label: '4 宫格',
    slotCount: 4,
    layoutInstruction: '输出一张 2x2 四宫格总图，每格都要是独立镜头，但整体风格、人物、空间连续。',
    slotTitles: ['建立镜头', '关系镜头', '动作推进', '情绪收束'],
  },
  'grid-6': {
    key: 'grid-6',
    label: '6 宫格',
    slotCount: 6,
    layoutInstruction: '输出一张 3x2 六宫格总图，镜头节奏要有起承转合，保证每格构图可辨识。',
    slotTitles: ['建立', '进入', '对位', '推进', '转折', '收束'],
  },
  'grid-9': {
    key: 'grid-9',
    label: '9 宫格',
    slotCount: 9,
    layoutInstruction: '输出一张 3x3 九宫格总图，要求完整镜头语言链路，九格都必须清晰可分辨。',
    slotTitles: ['1 建立', '2 环境补充', '3 人物入场', '4 关系建立', '5 动作推进', '6 关键细节', '7 情绪放大', '8 高潮瞬间', '9 尾镜头'],
  },
}

export function getShotGroupTemplateSpec(templateKey: string | null | undefined): ShotGroupTemplateSpec {
  const normalized = (templateKey || 'grid-4') as NovelPromotionShotGroupTemplateKey
  return SHOT_GROUP_TEMPLATE_REGISTRY[normalized] || SHOT_GROUP_TEMPLATE_REGISTRY['grid-4']
}
