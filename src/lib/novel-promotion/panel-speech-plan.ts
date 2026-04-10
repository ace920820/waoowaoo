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
  generatedAudioRequired: true
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

function matchSpeechItemsByPanelSourceText(
  panel: PanelSpeechPlanPanel,
  screenplayItems: ScreenplayDialogueItem[],
): PanelSpeechLine[] {
  const panelText = normalizeText(panel.srtSegment)
  if (!panelText) return []

  return screenplayItems
    .filter((item) => {
      const itemText = normalizeText(item.content)
      if (!itemText) return false
      return panelText.includes(itemText) || itemText.includes(panelText)
    })
    .map(toSpeechLineFromScreenplay)
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

  const screenplayMatches = matchSpeechItemsByPanelSourceText(params.panel, screenplayItems)
  if (screenplayMatches.length > 0) {
    return buildSpeechPlan(screenplayMatches, 'screenplay_panel_match')
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

export function buildPanelSpeechPlanPrompt(params: {
  basePrompt: string
  speechPlan: PanelSpeechPlan
}): string {
  const basePrompt = params.basePrompt.trim()
  const linesBlock = params.speechPlan.lines.length > 0
    ? params.speechPlan.lines
      .map((line, index) => `${index + 1}. type=${line.type}; speaker=${line.speaker}; content=${line.content}`)
      .join('\n')
    : 'none'

  const speechInstruction = (() => {
    if (params.speechPlan.mode === 'silent') {
      return 'No spoken dialogue or narration in this panel. Keep generated audio non-verbal, such as ambience, movement, or scene sound only.'
    }
    if (params.speechPlan.mode === 'voiceover') {
      return 'Generated audio remains required. Use the listed speech only as off-screen narration or voiceover. Avoid visible mouth-sync performance unless the visuals explicitly require it.'
    }
    return 'Generated audio remains required. Use the listed speech as the spoken content for this panel and keep any visible performance aligned to these lines.'
  })()

  return `${basePrompt}\n\n[Structured Speech Plan]\nmode=${params.speechPlan.mode}\nsource=${params.speechPlan.source}\ngenerated_audio_required=true\nspeakers=${params.speechPlan.speakers.join(', ') || 'none'}\nprimary_text=${params.speechPlan.primaryText || 'none'}\nlines:\n${linesBlock}\ninstruction=${speechInstruction}`
}
