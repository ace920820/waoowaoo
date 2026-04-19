import { extractScreenplayDialogueItems } from '@/lib/novel-promotion/screenplay-dialogue'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'
import type {
  NovelPromotionClip,
  NovelPromotionShotGroupTemplateKey,
  ShotGroupDraftPlaceholderReason,
  ShotGroupDraftSourceStatus,
} from '@/types/project'

export interface EpisodeMultiShotDraft {
  episodeId: string
  clipId: string
  title: string
  templateKey: NovelPromotionShotGroupTemplateKey
  segmentOrder: number
  sceneLabel: string
  expectedShotCount: number
  sourceStatus: ShotGroupDraftSourceStatus
  placeholderReason: ShotGroupDraftPlaceholderReason
  narrativePrompt: string | null
  embeddedDialogue: string | null
  shotRhythmGuidance: string | null
  groupPrompt: string | null
  videoPrompt: string | null
  includeDialogue: boolean
}

type BuildEpisodeMultiShotDraftsParams = {
  episodeId: string
  clips: NovelPromotionClip[]
}

type ScreenplaySceneNumberPayload = {
  scenes?: Array<{
    scene_number?: unknown
  }>
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

function normalizeExpectedShotCount(shotCount: number | undefined): number {
  if (typeof shotCount !== 'number' || !Number.isFinite(shotCount) || shotCount < 1) {
    return 4
  }
  return Math.max(1, Math.min(9, Math.floor(shotCount)))
}

function resolveTemplateKey(expectedShotCount: number): NovelPromotionShotGroupTemplateKey {
  if (expectedShotCount <= 4) return 'grid-4'
  if (expectedShotCount <= 6) return 'grid-6'
  return 'grid-9'
}

function readScreenplaySceneNumber(screenplay: string | null | undefined): number | null {
  if (!screenplay?.trim()) return null
  try {
    const parsed = JSON.parse(screenplay) as ScreenplaySceneNumberPayload
    const firstScene = Array.isArray(parsed?.scenes) ? parsed.scenes[0] : null
    const sceneNumber = firstScene?.scene_number
    return typeof sceneNumber === 'number' && Number.isFinite(sceneNumber)
      ? Math.floor(sceneNumber)
      : null
  } catch {
    return null
  }
}

function resolveSceneLabel(clip: NovelPromotionClip): string {
  const location = normalizeText(clip.location)
  if (location) return location

  const sceneNumber = readScreenplaySceneNumber(clip.screenplay)
  if (sceneNumber !== null) return `场景 ${sceneNumber}`

  return '待补充场景'
}

function buildDialogueBlock(clip: NovelPromotionClip): { embeddedDialogue: string | null; includeDialogue: boolean } {
  const dialogueItems = extractScreenplayDialogueItems([{ id: clip.id, screenplay: clip.screenplay ?? null }])
    .filter((item) => item.clipId === clip.id)

  if (dialogueItems.length === 0) {
    return {
      embeddedDialogue: null,
      includeDialogue: false,
    }
  }

  const embeddedDialogue = dialogueItems
    .map((item) => `${item.speaker}: ${item.content}`)
    .join('\n')

  return {
    embeddedDialogue,
    includeDialogue: true,
  }
}

function buildShotRhythmGuidance(params: {
  templateKey: NovelPromotionShotGroupTemplateKey
  clip: NovelPromotionClip
  sceneLabel: string
  embeddedDialogue: string | null
}): string {
  const template = getShotGroupTemplateSpec(params.templateKey)
  const summary = normalizeText(params.clip.summary) || '围绕当前剧情推进情绪与动作'
  const content = normalizeText(params.clip.content) || '保留当前片段的关键动作'
  const firstDialogue = params.embeddedDialogue?.split('\n')[0] || null

  return Array.from({ length: template.slotCount }, (_, index) => {
    const slotTitle = template.slotTitles[index] || `镜头 ${index + 1}`
    if (index === 0) {
      return `${index + 1}. ${slotTitle}：用 ${params.sceneLabel} 建立环境与人物关系，点明${summary}。`
    }
    if (index === template.slotCount - 1) {
      return `${index + 1}. ${slotTitle}：收束在情绪余波或动作结果上，为下一个 15 秒片段留出延续空间。`
    }
    if (index === Math.floor(template.slotCount / 2) && firstDialogue) {
      return `${index + 1}. ${slotTitle}：把“${firstDialogue}”嵌入动作峰值，镜头推进不要停顿。`
    }
    return `${index + 1}. ${slotTitle}：延续${content}，镜头尺度逐步变化，保持人物动作与情绪递进。`
  }).join('\n')
}

function buildNarrativePrompt(params: {
  clip: NovelPromotionClip
  sceneLabel: string
  embeddedDialogue: string | null
  shotRhythmGuidance: string
}): string {
  const summary = normalizeText(params.clip.summary) || '延续当前片段的核心剧情目标'
  const characters = normalizeText(params.clip.characters) || '待补充角色'
  const props = normalizeText(params.clip.props) || '无关键道具'
  const content = normalizeText(params.clip.content) || '待补充镜头推进'
  const dialogue = params.embeddedDialogue || '无明确对白，保持动作驱动。'

  return [
    `剧情目标：${summary}`,
    `场景与角色：场景为${params.sceneLabel}；角色包含${characters}；关键道具${props}。`,
    `镜头推进：${content}`,
    `对白嵌入：${dialogue}`,
    `节奏提示：${params.shotRhythmGuidance}`,
  ].join('\n')
}

function buildDraftTitle(segmentOrder: number, sceneLabel: string): string {
  return `片段 ${segmentOrder} · ${sceneLabel}`
}

export function buildEpisodeMultiShotDrafts(params: BuildEpisodeMultiShotDraftsParams): EpisodeMultiShotDraft[] {
  return params.clips.map((clip, index) => {
    const segmentOrder = index + 1
    const sceneLabel = resolveSceneLabel(clip)
    const expectedShotCount = normalizeExpectedShotCount(clip.shotCount)
    const templateKey = resolveTemplateKey(expectedShotCount)
    const title = buildDraftTitle(segmentOrder, sceneLabel)
    const clipContent = normalizeText(clip.content)

    if (!clipContent) {
      return {
        episodeId: params.episodeId,
        clipId: clip.id,
        title,
        templateKey,
        segmentOrder,
        sceneLabel,
        expectedShotCount,
        sourceStatus: 'placeholder',
        placeholderReason: 'missing_clip_content',
        narrativePrompt: null,
        embeddedDialogue: null,
        shotRhythmGuidance: null,
        groupPrompt: null,
        videoPrompt: null,
        includeDialogue: false,
      }
    }

    const { embeddedDialogue, includeDialogue } = buildDialogueBlock(clip)
    const shotRhythmGuidance = buildShotRhythmGuidance({
      templateKey,
      clip,
      sceneLabel,
      embeddedDialogue,
    })
    const narrativePrompt = buildNarrativePrompt({
      clip,
      sceneLabel,
      embeddedDialogue,
      shotRhythmGuidance,
    })

    return {
      episodeId: params.episodeId,
      clipId: clip.id,
      title,
      templateKey,
      segmentOrder,
      sceneLabel,
      expectedShotCount,
      sourceStatus: 'ready',
      placeholderReason: null,
      narrativePrompt,
      embeddedDialogue,
      shotRhythmGuidance,
      groupPrompt: narrativePrompt,
      videoPrompt: narrativePrompt,
      includeDialogue,
    }
  })
}
