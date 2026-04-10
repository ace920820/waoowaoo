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

export function derivePanelSpeechPlan(params: {
  panel: PanelSpeechPlanPanel
  clip?: PanelSpeechPlanClip | null
  voiceLines?: PanelSpeechPlanVoiceLine[] | null
}): PanelSpeechPlan {
  const screenplayItems = params.clip
    ? extractScreenplayDialogueItems([params.clip])
    : []

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

  const screenplayMatches = pickSinglePanelSpeechMatch(params.panel, screenplayItems)
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

  return params.storyboards.map((storyboard) => ({
    ...storyboard,
    panels: (storyboard.panels || []).map((panel) => ({
      ...panel,
      speechPlan: derivePanelSpeechPlan({
        panel,
        clip: storyboard.clip || null,
        voiceLines,
      }),
    })),
  }))
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

  return `${basePrompt}\n\n[Structured Speech Plan JSON]\n${JSON.stringify(structuredPayload, null, 2)}`
}
