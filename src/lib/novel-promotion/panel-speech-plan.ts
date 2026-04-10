import {
  extractScreenplayDialogueItems,
  type ClipDialogueSource,
  type ScreenplayDialogueItem,
  type VoiceAnalysisLine,
} from '@/lib/novel-promotion/screenplay-dialogue'

export type PanelSpeechMode = 'silent' | 'dialogue' | 'voiceover'

export type PanelSpeechLine = {
  lineIndex: number | null
  type: 'dialogue' | 'voiceover'
  speaker: string
  content: string
  parenthetical: string | null
}

export type PanelSpeechPlan = {
  mode: PanelSpeechMode
  source: 'screenplay_voice_lines' | 'screenplay_panel_match' | 'none'
  generatedAudioRequired: boolean
  primaryText: string | null
  speakers: string[]
  lines: PanelSpeechLine[]
}

type PanelSpeechPlanPanel = {
  id?: string | null
  storyboardId?: string | null
  panelIndex?: number | null
  srtSegment?: string | null
}

type PanelSpeechPlanClip = ClipDialogueSource

type PanelSpeechPlanParams = {
  panel: PanelSpeechPlanPanel
  clip?: PanelSpeechPlanClip | null
  clips?: PanelSpeechPlanClip[] | null
  voiceLines?: PanelSpeechPlanVoiceLine[] | null
}

type PanelSpeechPlanVoiceLine = Pick<VoiceAnalysisLine, 'lineIndex' | 'speaker' | 'content'> & {
  matchedPanelId?: string | null
  matchedStoryboardId?: string | null
  matchedPanelIndex?: number | null
}

type StoryboardPanelLike = PanelSpeechPlanPanel & Record<string, unknown>

type StoryboardLike<TPanel extends StoryboardPanelLike> = {
  id: string
  clip?: PanelSpeechPlanClip | null
  panels?: TPanel[]
} & Record<string, unknown>

type VideoPromptPanelContext = {
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  duration?: number | null
  srtSegment?: string | null
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\s+/g, '')
    .replace(/[，。、“”"'！？!?,.；;：:\-—()（）\[\]{}]/g, '')
    .trim()
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function resolveScreenplayItems(params: Pick<PanelSpeechPlanParams, 'clip' | 'clips'>): {
  allItems: ScreenplayDialogueItem[]
  clipItems: ScreenplayDialogueItem[]
} {
  const episodeClips = Array.isArray(params.clips)
    ? params.clips.filter((clip): clip is PanelSpeechPlanClip => !!clip && typeof clip.id === 'string')
    : []
  const clipSource = episodeClips.length > 0
    ? episodeClips
    : params.clip
      ? [params.clip]
      : []
  const allItems = clipSource.length > 0
    ? extractScreenplayDialogueItems(clipSource)
    : []
  const clipItems = params.clip
    ? allItems.filter((item) => item.clipId === params.clip?.id)
    : allItems

  return {
    allItems,
    clipItems,
  }
}

function buildSpeechPlan(lines: PanelSpeechLine[], source: PanelSpeechPlan['source']): PanelSpeechPlan {
  if (lines.length === 0) {
    return {
      mode: 'silent',
      source: 'none',
      generatedAudioRequired: true,
      primaryText: null,
      speakers: [],
      lines: [],
    }
  }

  const mode: PanelSpeechMode = lines.every((line) => line.type === 'voiceover')
    ? 'voiceover'
    : 'dialogue'

  return {
    mode,
    source,
    generatedAudioRequired: true,
    primaryText: lines.map((line) => line.content).join('；') || null,
    speakers: uniqueNonEmpty(lines.map((line) => line.speaker)),
    lines,
  }
}

function toSpeechLineFromScreenplay(item: ScreenplayDialogueItem): PanelSpeechLine {
  return {
    lineIndex: item.lineIndex,
    type: item.type,
    speaker: item.speaker,
    content: item.content,
    parenthetical: item.parenthetical,
  }
}

function toSpeechLineFromVoiceLine(
  voiceLine: PanelSpeechPlanVoiceLine,
  screenplayItem?: ScreenplayDialogueItem,
): PanelSpeechLine | null {
  const content = screenplayItem?.content || (typeof voiceLine.content === 'string' ? voiceLine.content.trim() : '')
  if (!content) return null

  const speaker = screenplayItem?.speaker || (typeof voiceLine.speaker === 'string' ? voiceLine.speaker.trim() : '') || '旁白'
  const lineIndex = typeof voiceLine.lineIndex === 'number' && Number.isFinite(voiceLine.lineIndex)
    ? Math.floor(voiceLine.lineIndex)
    : null

  return {
    lineIndex,
    type: screenplayItem?.type || 'dialogue',
    speaker,
    content,
    parenthetical: screenplayItem?.parenthetical || null,
  }
}

type PanelSpeechTextMatch = {
  item: ScreenplayDialogueItem
  quality: 'exact' | 'narrow_fuzzy'
}

function pickSinglePanelSpeechMatch(
  panel: PanelSpeechPlanPanel,
  screenplayItems: ScreenplayDialogueItem[],
): PanelSpeechTextMatch[] {
  const panelText = normalizeText(panel.srtSegment)
  if (!panelText) return []

  const exactMatches = screenplayItems.filter((item) => {
    const itemText = normalizeText(item.content)
    return itemText.length > 0 && itemText === panelText
  })

  if (exactMatches.length === 1) {
    return [{ item: exactMatches[0], quality: 'exact' }]
  }

  if (exactMatches.length > 1) {
    return []
  }

  const narrowFuzzyMatches = screenplayItems.filter((item) => {
    const itemText = normalizeText(item.content)
    if (!itemText) return false

    const shorterLength = Math.min(panelText.length, itemText.length)
    const longerLength = Math.max(panelText.length, itemText.length)
    const lengthRatio = shorterLength / longerLength
    const boundedDelta = longerLength - shorterLength
    const hasContainment = panelText.includes(itemText) || itemText.includes(panelText)

    if (!hasContainment) return false
    if (shorterLength < 6) return false
    if (lengthRatio < 0.8) return false
    if (boundedDelta > 4) return false
    return true
  })

  if (narrowFuzzyMatches.length !== 1) {
    return []
  }

  return [{ item: narrowFuzzyMatches[0], quality: 'narrow_fuzzy' }]
}

export function derivePanelSpeechPlan(params: PanelSpeechPlanParams): PanelSpeechPlan {
  const { allItems: screenplayItems, clipItems: clipScreenplayItems } = resolveScreenplayItems(params)

  const screenplayItemByLineIndex = new Map<number, ScreenplayDialogueItem>()
  for (const item of screenplayItems) {
    screenplayItemByLineIndex.set(item.lineIndex, item)
  }

  const matchedVoiceLines = (params.voiceLines || [])
    .filter((line) => {
      if (params.panel.id && typeof line.matchedPanelId === 'string' && line.matchedPanelId === params.panel.id) {
        return true
      }

      if (
        params.panel.storyboardId
        && typeof params.panel.panelIndex === 'number'
        && line.matchedStoryboardId === params.panel.storyboardId
        && typeof line.matchedPanelIndex === 'number'
        && Math.floor(line.matchedPanelIndex) === params.panel.panelIndex
      ) {
        return true
      }

      return false
    })
    .map((line) => {
      const screenplayItem = typeof line.lineIndex === 'number'
        ? screenplayItemByLineIndex.get(Math.floor(line.lineIndex))
        : undefined
      return toSpeechLineFromVoiceLine(line, screenplayItem)
    })
    .filter((line): line is PanelSpeechLine => !!line)

  if (matchedVoiceLines.length > 0) {
    return buildSpeechPlan(matchedVoiceLines, 'screenplay_voice_lines')
  }

  const screenplayMatches = pickSinglePanelSpeechMatch(params.panel, clipScreenplayItems)
  if (screenplayMatches.length > 0) {
    return buildSpeechPlan(screenplayMatches.map((match) => toSpeechLineFromScreenplay(match.item)), 'screenplay_panel_match')
  }

  return buildSpeechPlan([], 'none')
}

export function attachSpeechPlanToStoryboards<
  TPanel extends StoryboardPanelLike,
  TStoryboard extends StoryboardLike<TPanel>,
>(params: {
  storyboards: TStoryboard[]
  voiceLines?: PanelSpeechPlanVoiceLine[] | null
}): Array<Omit<TStoryboard, 'panels'> & { panels: Array<TPanel & { speechPlan: PanelSpeechPlan }> }> {
  const voiceLines = params.voiceLines || []
  const clips = params.storyboards
    .map((storyboard) => storyboard.clip)
    .filter((clip): clip is PanelSpeechPlanClip => !!clip && typeof clip.id === 'string')

  return params.storyboards.map((storyboard) => ({
    ...storyboard,
    panels: (storyboard.panels || []).map((panel) => ({
      ...panel,
      speechPlan: derivePanelSpeechPlan({
        panel,
        clip: storyboard.clip || null,
        clips,
        voiceLines,
      }),
    })),
  }))
}

function stringifySpeechDirectionValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return '""'
  return JSON.stringify(value.replace(/\r\n?/g, '\n'))
}

function buildSpeechInstruction(params: {
  speechPlan: PanelSpeechPlan
  generateAudio: boolean
}): string {
  if (!params.generateAudio) {
    return 'Audio generation is disabled for this request. Do not add spoken dialogue, narration, ambience, or other generated audio.'
  }

  if (params.speechPlan.mode === 'silent') {
    return 'No spoken dialogue or narration in this panel. Keep generated audio non-verbal, such as ambience, movement, or scene sound only.'
  }

  if (params.speechPlan.mode === 'voiceover') {
    return 'Generate audio for the listed speech only as off-screen narration or voiceover. Avoid visible mouth-sync performance unless the visuals explicitly require it.'
  }

  return 'Generate audio for the listed speech and keep any visible performance aligned to these lines.'
}

function buildSpeechModeExecutionBlock(params: {
  speechPlan: PanelSpeechPlan
  generateAudio: boolean
}): string {
  const header = [
    `Mode: ${params.speechPlan.mode}`,
    `Audio: ${params.generateAudio ? 'enabled' : 'disabled'}`,
  ]

  if (!params.generateAudio) {
    return [
      ...header,
      '- Do not generate spoken dialogue, narration, sung lyrics, or other verbal audio.',
      '- Keep any generated audio non-verbal only, such as ambience, Foley, motion, or environmental sound.',
      '- Avoid visible mouth-sync performance that implies unheard dialogue.',
    ].join('\n')
  }

  if (params.speechPlan.mode === 'silent') {
    return [
      ...header,
      '- Treat this panel as intentionally non-speaking.',
      '- Do not add spoken dialogue, narration, ad-libs, or implied speech beats.',
      '- Keep character behavior and facial performance non-speaking; avoid lip-sync-like mouth performance.',
      '- Audio should stay non-verbal: ambience, movement, impacts, room tone, or scene sound only.',
    ].join('\n')
  }

  const numberedLines = params.speechPlan.lines.map((line, index) => {
    const segments = [`speaker=${stringifySpeechDirectionValue(line.speaker)}`]

    if (line.parenthetical) {
      segments.push(`parenthetical=${stringifySpeechDirectionValue(line.parenthetical)}`)
    }

    segments.push(`content=${stringifySpeechDirectionValue(line.content)}`)

    return `${index + 1}. ${segments.join(' ')}`
  })

  if (params.speechPlan.mode === 'voiceover') {
    return [
      ...header,
      '- Treat the listed lines as off-screen narration or voiceover.',
      '- Do not stage these lines as on-screen mouth speech unless the visual prompt explicitly requires it.',
      '- Keep character blocking and facial performance consistent with listening, acting, or silent reaction rather than speaking these words.',
      '- Voiceover lines:',
      ...numberedLines,
    ].join('\n')
  }

  return [
    ...header,
    '- Treat the listed lines as intentional on-screen spoken dialogue for this panel.',
    '- If the speaker is visible, align mouth movement and speaking performance to these exact lines.',
    '- Do not add extra spoken lines, narration, or substitute wording beyond the structured speech plan.',
    '- Spoken lines:',
    ...numberedLines,
  ].join('\n')
}

function buildStructuredSpeechPlanPayload(params: {
  speechPlan: PanelSpeechPlan
  generateAudio: boolean
}) {
  return {
    mode: params.speechPlan.mode,
    source: params.speechPlan.source,
    generateAudio: params.generateAudio,
    primaryText: params.speechPlan.primaryText,
    speakers: params.speechPlan.speakers,
    lines: params.speechPlan.lines.map((line) => ({
      lineIndex: line.lineIndex,
      type: line.type,
      speaker: line.speaker,
      content: line.content,
      parenthetical: line.parenthetical,
    })),
    instruction: buildSpeechInstruction(params),
  }
}

export function buildPanelSpeechPlanPrompt(params: {
  basePrompt: string
  speechPlan: PanelSpeechPlan
  generateAudio?: boolean
}): string {
  const basePrompt = params.basePrompt.trim()
  const generateAudio = typeof params.generateAudio === 'boolean'
    ? params.generateAudio
    : params.speechPlan.generatedAudioRequired
  const structuredPayload = buildStructuredSpeechPlanPayload({
    speechPlan: params.speechPlan,
    generateAudio,
  })

  const speechExecutionBlock = buildSpeechModeExecutionBlock({
    speechPlan: params.speechPlan,
    generateAudio,
  })

  return `${basePrompt}\n\n[Speech Direction]\n${speechExecutionBlock}\n\n[Structured Speech Plan JSON]\n${JSON.stringify(structuredPayload, null, 2)}`
}

function buildPanelVisualContextBlock(params: {
  panel?: VideoPromptPanelContext | null
}): string | null {
  const panel = params.panel
  if (!panel) return null

  const lines: string[] = []
  if (typeof panel.shotType === 'string' && panel.shotType.trim()) {
    lines.push(`Shot type: ${panel.shotType.trim()}`)
  }
  if (typeof panel.cameraMove === 'string' && panel.cameraMove.trim()) {
    lines.push(`Camera move: ${panel.cameraMove.trim()}`)
  }
  if (typeof panel.description === 'string' && panel.description.trim()) {
    lines.push(`Action/visual description: ${panel.description.trim()}`)
  }
  if (typeof panel.duration === 'number' && Number.isFinite(panel.duration) && panel.duration > 0) {
    lines.push(`Target duration seconds: ${panel.duration}`)
  }
  if (typeof panel.srtSegment === 'string' && panel.srtSegment.trim()) {
    lines.push(`Panel text reference: ${panel.srtSegment.trim()}`)
  }

  if (lines.length === 0) return null
  return `[Panel Visual Context]\n${lines.join('\n')}`
}

export function buildPanelVideoGenerationPrompt(params: {
  basePrompt: string
  panel?: VideoPromptPanelContext | null
  speechPlan: PanelSpeechPlan
  generateAudio?: boolean
}): string {
  const visualContextBlock = buildPanelVisualContextBlock({ panel: params.panel })
  const basePrompt = visualContextBlock
    ? `${params.basePrompt.trim()}\n\n${visualContextBlock}`
    : params.basePrompt

  return buildPanelSpeechPlanPrompt({
    basePrompt,
    speechPlan: params.speechPlan,
    generateAudio: params.generateAudio,
  })
}
