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
  segmentKey: string
  sourceClipId: string
  segmentIndexWithinClip: number
  segmentStartSeconds: number
  segmentEndSeconds: number
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

type DerivedSegmentWindow = {
  clip: NovelPromotionClip
  segmentOrder: number
  segmentIndexWithinClip: number
  segmentCountForClip: number
  segmentStartSeconds: number
  segmentEndSeconds: number
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

function normalizeDurationSeconds(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value
}

function resolveClipDurationSeconds(clip: NovelPromotionClip): number | null {
  const explicitDuration = normalizeDurationSeconds(clip.duration)
  if (explicitDuration !== null) return explicitDuration

  if (typeof clip.start === 'number' && typeof clip.end === 'number' && Number.isFinite(clip.start) && Number.isFinite(clip.end)) {
    const rangeDuration = clip.end - clip.start
    return normalizeDurationSeconds(rangeDuration)
  }

  return null
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
  segmentStartSeconds: number
  segmentEndSeconds: number
  segmentIndexWithinClip: number
  segmentCountForClip: number
}): string {
  const template = getShotGroupTemplateSpec(params.templateKey)
  const summary = normalizeText(params.clip.summary) || '围绕当前剧情推进情绪与动作'
  const content = normalizeText(params.clip.content) || '保留当前片段的关键动作'
  const firstDialogue = params.embeddedDialogue?.split('\n')[0] || null
  const segmentWindowLabel = `第 ${params.segmentIndexWithinClip}/${params.segmentCountForClip} 个 15 秒片段（${params.segmentStartSeconds}-${params.segmentEndSeconds}s）`

  return Array.from({ length: template.slotCount }, (_, index) => {
    const slotTitle = template.slotTitles[index] || `镜头 ${index + 1}`
    if (index === 0) {
      return `${index + 1}. ${slotTitle}：围绕${segmentWindowLabel}，用 ${params.sceneLabel} 建立环境与人物关系，点明${summary}。`
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
  segmentStartSeconds: number
  segmentEndSeconds: number
  segmentIndexWithinClip: number
  segmentCountForClip: number
}): string {
  const summary = normalizeText(params.clip.summary) || '延续当前片段的核心剧情目标'
  const characters = normalizeText(params.clip.characters) || '待补充角色'
  const props = normalizeText(params.clip.props) || '无关键道具'
  const content = normalizeText(params.clip.content) || '待补充镜头推进'
  const dialogue = params.embeddedDialogue || '无明确对白，保持动作驱动。'
  const segmentWindowLabel = `当前聚焦源片段的第 ${params.segmentIndexWithinClip}/${params.segmentCountForClip} 个 15 秒窗口（${params.segmentStartSeconds}-${params.segmentEndSeconds}s）`

  return [
    `剧情目标：${summary}`,
    `时间窗口：${segmentWindowLabel}。`,
    `场景与角色：场景为${params.sceneLabel}；角色包含${characters}；关键道具${props}。`,
    `镜头推进：${content}`,
    `对白嵌入：${dialogue}`,
    `节奏提示：${params.shotRhythmGuidance}`,
  ].join('\n')
}

function buildDraftTitle(segmentOrder: number, sceneLabel: string, segmentIndexWithinClip: number): string {
  return `片段 ${segmentOrder} · ${sceneLabel} · 子段 ${segmentIndexWithinClip}`
}

function allocateFallbackSegmentCounts(clips: NovelPromotionClip[]): number[] {
  if (clips.length === 0) return []

  const targetSegments = 8
  const base = Math.floor(targetSegments / clips.length)
  let remainder = targetSegments % clips.length

  return clips.map(() => {
    const next = Math.max(1, base + (remainder > 0 ? 1 : 0))
    if (remainder > 0) remainder -= 1
    return next
  })
}

function buildDerivedSegmentWindows(clips: NovelPromotionClip[]): DerivedSegmentWindow[] {
  const resolvedDurations = clips.map(resolveClipDurationSeconds)
  const fallbackCounts = resolvedDurations.every((duration) => duration === null)
    ? allocateFallbackSegmentCounts(clips)
    : clips.map((_, index) => (resolvedDurations[index] === null ? 1 : 0))

  let segmentOrder = 1

  return clips.flatMap((clip, clipIndex) => {
    const clipDurationSeconds = resolvedDurations[clipIndex]
    const segmentCountForClip = clipDurationSeconds !== null
      ? Math.max(1, Math.ceil(clipDurationSeconds / 15))
      : fallbackCounts[clipIndex]

    return Array.from({ length: segmentCountForClip }, (_, segmentIndex) => {
      const startFromClip = typeof clip.start === 'number' && Number.isFinite(clip.start)
        ? clip.start + (segmentIndex * 15)
        : segmentIndex * 15
      const segmentStartSeconds = Math.max(0, Math.floor(startFromClip))
      const segmentEndSeconds = clipDurationSeconds !== null
        ? Math.min(Math.floor(segmentStartSeconds + 15), Math.floor((clip.start ?? 0) + clipDurationSeconds))
        : segmentStartSeconds + 15

      return {
        clip,
        segmentOrder: segmentOrder++,
        segmentIndexWithinClip: segmentIndex + 1,
        segmentCountForClip,
        segmentStartSeconds,
        segmentEndSeconds,
      }
    })
  })
}

export function buildEpisodeMultiShotDrafts(params: BuildEpisodeMultiShotDraftsParams): EpisodeMultiShotDraft[] {
  return buildDerivedSegmentWindows(params.clips).map((segment) => {
    const { clip, segmentOrder, segmentIndexWithinClip, segmentCountForClip, segmentStartSeconds, segmentEndSeconds } = segment
    const sceneLabel = resolveSceneLabel(clip)
    const expectedShotCount = normalizeExpectedShotCount(clip.shotCount)
    const templateKey = resolveTemplateKey(expectedShotCount)
    const title = buildDraftTitle(segmentOrder, sceneLabel, segmentIndexWithinClip)
    const clipContent = normalizeText(clip.content)
    const segmentKey = `${clip.id}:${segmentIndexWithinClip}`

    if (!clipContent) {
      return {
        episodeId: params.episodeId,
        clipId: clip.id,
        segmentKey,
        sourceClipId: clip.id,
        segmentIndexWithinClip,
        segmentStartSeconds,
        segmentEndSeconds,
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
      segmentStartSeconds,
      segmentEndSeconds,
      segmentIndexWithinClip,
      segmentCountForClip,
    })
    const narrativePrompt = buildNarrativePrompt({
      clip,
      sceneLabel,
      embeddedDialogue,
      shotRhythmGuidance,
      segmentStartSeconds,
      segmentEndSeconds,
      segmentIndexWithinClip,
      segmentCountForClip,
    })

    return {
      episodeId: params.episodeId,
      clipId: clip.id,
      segmentKey,
      sourceClipId: clip.id,
      segmentIndexWithinClip,
      segmentStartSeconds,
      segmentEndSeconds,
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
