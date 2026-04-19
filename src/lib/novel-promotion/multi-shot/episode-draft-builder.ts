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

type SegmentStoryRole = 'opening' | 'build' | 'climax' | 'landing'

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

function splitNameLikeText(raw: string | null | undefined): string[] {
  const normalized = typeof raw === 'string' ? raw.trim() : ''
  if (!normalized) return []
  return normalized
    .split(/[，,、/｜|]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinChineseList(items: string[], fallback: string): string {
  if (items.length === 0) return fallback
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]}与${items[1]}`
  return `${items.slice(0, -1).join('、')}与${items[items.length - 1]}`
}

function splitNarrativeUnits(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentenceUnits = normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((unit) => unit.trim())
    .filter(Boolean)

  const expandedUnits = sentenceUnits.flatMap((unit) => {
    if (unit.length <= 32) return [unit]

    const commaUnits = unit
      .split(/(?<=[，、：])/u)
      .map((part) => part.trim())
      .filter(Boolean)

    return commaUnits.length > 1 ? commaUnits : [unit]
  })

  return expandedUnits.length > 0 ? expandedUnits : [normalized]
}

function distributeUnitsAcrossSegments(units: string[], segmentCount: number): string[] {
  if (segmentCount <= 0) return []
  if (units.length === 0) return Array.from({ length: segmentCount }, () => '')

  const buckets = Array.from({ length: segmentCount }, () => [] as string[])
  units.forEach((unit, index) => {
    const bucketIndex = Math.min(segmentCount - 1, Math.floor((index * segmentCount) / units.length))
    buckets[bucketIndex].push(unit)
  })

  return buckets.map((bucket, index) => {
    if (bucket.length > 0) return bucket.join('')
    const fallback = buckets[index - 1]?.join('') || units[Math.min(index, units.length - 1)] || units[units.length - 1]
    return fallback
  })
}

function resolveSegmentStoryRole(segmentIndexWithinClip: number, segmentCountForClip: number): SegmentStoryRole {
  if (segmentCountForClip <= 1) return 'opening'
  if (segmentIndexWithinClip === 1) return 'opening'
  if (segmentIndexWithinClip === segmentCountForClip) return 'landing'
  if (segmentIndexWithinClip >= Math.ceil(segmentCountForClip * 0.75)) return 'climax'
  return 'build'
}

function resolveRoleSentence(role: SegmentStoryRole): string {
  switch (role) {
    case 'opening':
      return '这一小节先负责建立空间、人物出场与情绪底色，让观众立刻进入当前场面。'
    case 'build':
      return '这一小节承接前面的动作和情绪，继续把人物关系与事件推进往前压。'
    case 'climax':
      return '这一小节把冲突、压迫感或情绪峰值推到更近处，让画面明显加压。'
    case 'landing':
      return '这一小节负责把这一段大的叙事先收住，在结果与余波之间给下一个片段留下承接。'
  }
}

function resolveCameraSentence(role: SegmentStoryRole, sceneLabel: string, beatText: string): string {
  const beat = beatText.replace(/[。！？!?；;]+$/u, '').trim() || `当前发生在${sceneLabel}里的关键动作`
  switch (role) {
    case 'opening':
      return `镜头先从${sceneLabel}的环境和人物关系起势，再缓缓推近到角色的动作起点，围绕${beat}建立第一轮画面焦点。`
    case 'build':
      return `镜头贴着角色移动持续推进，从全身到半身再到近景，顺着${beat}把动作流和情绪流拉成连续过程。`
    case 'climax':
      return `镜头在动作峰值处切入更近的特写与角度变化，让${beat}里的压迫、对峙或爆发感被明确放大。`
    case 'landing':
      return `镜头在结果与余波之间完成收束，可以先贴近人物表情或关键动作，再略微拉开，把${beat}停在最有余味的瞬间。`
  }
}

function formatDialogueForPrompt(embeddedDialogue: string | null): string | null {
  if (!embeddedDialogue) return null
  const lines = embeddedDialogue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  return lines.slice(0, 2).map((line) => `“${line}”`).join('；')
}

function resolveDialogueSentence(role: SegmentStoryRole, embeddedDialogue: string | null): string {
  const quotedDialogue = formatDialogueForPrompt(embeddedDialogue)
  if (quotedDialogue) {
    return `当动作推进到关键节点时，让人物自然说出${quotedDialogue}，对白要紧贴动作之后出现，像画面里顺势冒出来的信息与情绪。`
  }

  if (role === 'climax') {
    return '这一段可以保持无对白，用呼吸、停顿、眼神和动作细节来承接高压情绪，让画面自己说话。'
  }

  return '这一段不必强行加入对白，优先用动作、景别变化和人物反应去完成信息传递。'
}

function resolveEndingSentence(role: SegmentStoryRole, summary: string): string {
  switch (role) {
    case 'opening':
      return `收尾时先不要把信息一次说尽，而是顺着${summary}把观众带进下一小节。`
    case 'build':
      return `结尾要把动作或情绪继续往前顶一下，让下一个子片段可以无缝接着往高潮走。`
    case 'climax':
      return `最后留一个最紧的动作、眼神或态势，让后续片段接手结果、反应或反转。`
    case 'landing':
      return `最终把这一大段剧情落在${summary}的结果、余波或决心上，让整段叙事形成完整闭环。`
  }
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

function buildClipDialogueBlocks(clip: NovelPromotionClip, segmentCountForClip: number): Array<string | null> {
  const dialogueItems = extractScreenplayDialogueItems([{ id: clip.id, screenplay: clip.screenplay ?? null }])
    .filter((item) => item.clipId === clip.id)

  if (dialogueItems.length === 0) {
    return Array.from({ length: segmentCountForClip }, () => null)
  }

  const buckets = Array.from({ length: segmentCountForClip }, () => [] as string[])
  dialogueItems.forEach((item, index) => {
    const bucketIndex = Math.min(segmentCountForClip - 1, Math.floor((index * segmentCountForClip) / dialogueItems.length))
    buckets[bucketIndex].push(`${item.speaker}: ${item.content}`)
  })

  return buckets.map((bucket) => (bucket.length > 0 ? bucket.join('\n') : null))
}

function buildShotRhythmGuidance(params: {
  templateKey: NovelPromotionShotGroupTemplateKey
  clip: NovelPromotionClip
  sceneLabel: string
  segmentNarrativeBeat: string
  embeddedDialogue: string | null
  segmentStartSeconds: number
  segmentEndSeconds: number
  segmentIndexWithinClip: number
  segmentCountForClip: number
}): string {
  const template = getShotGroupTemplateSpec(params.templateKey)
  const summary = normalizeText(params.clip.summary) || '围绕当前剧情推进情绪与动作'
  const beatFocus = params.segmentNarrativeBeat || normalizeText(params.clip.content) || '保留当前片段的关键动作'
  const firstDialogue = params.embeddedDialogue?.split('\n')[0] || null
  const segmentWindowLabel = `第 ${params.segmentIndexWithinClip}/${params.segmentCountForClip} 个 15 秒片段（${params.segmentStartSeconds}-${params.segmentEndSeconds}s）`
  const role = resolveSegmentStoryRole(params.segmentIndexWithinClip, params.segmentCountForClip)

  return Array.from({ length: template.slotCount }, (_, index) => {
    const slotTitle = template.slotTitles[index] || `镜头 ${index + 1}`
    if (index === 0) {
      return `${index + 1}. ${slotTitle}：围绕${segmentWindowLabel}，用 ${params.sceneLabel} 建立环境与人物关系，点明${summary}并把画面带入这一子片段。`
    }
    if (index === template.slotCount - 1) {
      return `${index + 1}. ${slotTitle}：收束在情绪余波或动作结果上，为${role === 'landing' ? '这个大片段的收尾' : '下一个 15 秒片段'}留出延续空间。`
    }
    if (index === Math.floor(template.slotCount / 2) && firstDialogue) {
      return `${index + 1}. ${slotTitle}：把“${firstDialogue}”嵌入动作峰值，镜头推进不要停顿。`
    }
    return `${index + 1}. ${slotTitle}：延续${beatFocus}，镜头尺度逐步变化，保持人物动作与情绪递进。`
  }).join('\n')
}

function buildNarrativePrompt(params: {
  clip: NovelPromotionClip
  sceneLabel: string
  segmentNarrativeBeat: string
  embeddedDialogue: string | null
  shotRhythmGuidance: string
  segmentStartSeconds: number
  segmentEndSeconds: number
  segmentIndexWithinClip: number
  segmentCountForClip: number
}): string {
  const summary = normalizeText(params.clip.summary) || '延续当前片段的核心剧情目标'
  const role = resolveSegmentStoryRole(params.segmentIndexWithinClip, params.segmentCountForClip)
  const characters = joinChineseList(splitNameLikeText(params.clip.characters), '人物')
  const props = splitNameLikeText(params.clip.props)
  const propPhrase = props.length > 0 ? `，关键道具带着${joinChineseList(props, '道具')}` : ''
  const beatText = params.segmentNarrativeBeat.replace(/[。！？!?；;]+$/u, '').trim() || summary
  const segmentWindowLabel = `当前是这个大片段的第 ${params.segmentIndexWithinClip}/${params.segmentCountForClip} 个 15 秒多镜头子片段（${params.segmentStartSeconds}-${params.segmentEndSeconds}s）`

  return [
    `${segmentWindowLabel}。`,
    `${resolveRoleSentence(role)}`,
    `在${params.sceneLabel}里，${characters}进入这一段画面，整段叙事围绕${summary}展开${propPhrase}。`,
    `${beatText}。`,
    `${resolveCameraSentence(role, params.sceneLabel, beatText)}`,
    `${resolveDialogueSentence(role, params.embeddedDialogue)}`,
    `${resolveEndingSentence(role, summary)}`,
  ].join('')
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
  const derivedWindows = buildDerivedSegmentWindows(params.clips)
  const narrativeBeatsByClipId = new Map<string, string[]>()
  const dialogueBlocksByClipId = new Map<string, Array<string | null>>()

  for (const clip of params.clips) {
    const segmentCountForClip = derivedWindows.filter((segment) => segment.clip.id === clip.id).length
    const clipContent = normalizeText(clip.content)
    narrativeBeatsByClipId.set(
      clip.id,
      distributeUnitsAcrossSegments(
        splitNarrativeUnits(clipContent || normalizeText(clip.summary) || ''),
        segmentCountForClip,
      ),
    )
    dialogueBlocksByClipId.set(clip.id, buildClipDialogueBlocks(clip, segmentCountForClip))
  }

  return derivedWindows.map((segment) => {
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

    const segmentNarrativeBeat = narrativeBeatsByClipId.get(clip.id)?.[segmentIndexWithinClip - 1]
      || clipContent
      || normalizeText(clip.summary)
      || '人物在当前场景里继续推进动作和情绪'
    const embeddedDialogue = dialogueBlocksByClipId.get(clip.id)?.[segmentIndexWithinClip - 1] || null
    const includeDialogue = Boolean(embeddedDialogue)
    const shotRhythmGuidance = buildShotRhythmGuidance({
      templateKey,
      clip,
      sceneLabel,
      segmentNarrativeBeat,
      embeddedDialogue,
      segmentStartSeconds,
      segmentEndSeconds,
      segmentIndexWithinClip,
      segmentCountForClip,
    })
    const narrativePrompt = buildNarrativePrompt({
      clip,
      sceneLabel,
      segmentNarrativeBeat,
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
