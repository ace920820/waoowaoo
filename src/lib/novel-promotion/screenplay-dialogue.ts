type ScreenplayContentItem = {
  type?: unknown
  text?: unknown
  character?: unknown
  lines?: unknown
  parenthetical?: unknown
}

type ScreenplayScene = {
  scene_number?: unknown
  content?: unknown
}

type ScreenplayPayload = {
  scenes?: unknown
}

export type ClipDialogueSource = {
  id: string
  screenplay: string | null
}

export type ScreenplayDialogueItem = {
  clipId: string
  lineIndex: number
  sceneNumber: number | null
  sceneIndex: number
  contentIndex: number
  type: 'dialogue' | 'voiceover'
  speaker: string
  content: string
  parenthetical: string | null
}

export type VoiceAnalysisMatchedPanel = {
  storyboardId?: string
  panelIndex?: number
}

export type VoiceAnalysisLine = {
  lineIndex?: number
  speaker?: string
  content?: string
  emotionStrength?: number
  matchedPanel?: VoiceAnalysisMatchedPanel | null
}

export type VoiceAnalysisDialogueSource = {
  source: 'screenplay' | 'novelText' | 'empty'
  input: string
  dialogueItems: ScreenplayDialogueItem[]
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
}

function parseScreenplayPayload(raw: string | null | undefined): ScreenplayPayload | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    const record = asObject(parsed)
    return record ? (record as ScreenplayPayload) : null
  } catch {
    return null
  }
}

function normalizeVoiceoverSpeaker(item: ScreenplayContentItem): string {
  const explicitSpeaker = readString(item.character)
  return explicitSpeaker || '旁白'
}

export function extractScreenplayDialogueItems(clips: ClipDialogueSource[]): ScreenplayDialogueItem[] {
  const items: ScreenplayDialogueItem[] = []

  for (const clip of clips) {
    const screenplay = parseScreenplayPayload(clip.screenplay)
    const scenes = Array.isArray(screenplay?.scenes) ? (screenplay.scenes as ScreenplayScene[]) : []

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
      const scene = scenes[sceneIndex]
      const contentItems = Array.isArray(scene.content) ? (scene.content as ScreenplayContentItem[]) : []
      const sceneNumber = readNumber(scene.scene_number)

      for (let contentIndex = 0; contentIndex < contentItems.length; contentIndex += 1) {
        const contentItem = contentItems[contentIndex]
        const type = readString(contentItem.type)

        if (type === 'dialogue') {
          const speaker = readString(contentItem.character)
          const content = readString(contentItem.lines)
          if (!speaker || !content) continue
          items.push({
            clipId: clip.id,
            lineIndex: items.length + 1,
            sceneNumber,
            sceneIndex,
            contentIndex,
            type: 'dialogue',
            speaker,
            content,
            parenthetical: readString(contentItem.parenthetical) || null,
          })
          continue
        }

        if (type === 'voiceover') {
          const content = readString(contentItem.text)
          if (!content) continue
          items.push({
            clipId: clip.id,
            lineIndex: items.length + 1,
            sceneNumber,
            sceneIndex,
            contentIndex,
            type: 'voiceover',
            speaker: normalizeVoiceoverSpeaker(contentItem),
            content,
            parenthetical: null,
          })
        }
      }
    }
  }

  return items
}

export function buildVoiceAnalysisDialogueSource(params: {
  novelText: string | null | undefined
  clips: ClipDialogueSource[]
}): VoiceAnalysisDialogueSource {
  const dialogueItems = extractScreenplayDialogueItems(params.clips)
  if (dialogueItems.length > 0) {
    const structuredInput = dialogueItems
      .map((item) => {
        const scenePart = item.sceneNumber !== null ? ` scene=${item.sceneNumber}` : ''
        const kindPart = item.type === 'voiceover' ? ' kind=voiceover' : ''
        return `${item.lineIndex}. clip=${item.clipId}${scenePart}${kindPart} speaker=${item.speaker} content=${item.content}`
      })
      .join('\n')

    return {
      source: 'screenplay',
      input: `【结构化剧本台词】\n${structuredInput}`,
      dialogueItems,
    }
  }

  const novelText = typeof params.novelText === 'string' ? params.novelText.trim() : ''
  if (novelText) {
    return {
      source: 'novelText',
      input: novelText,
      dialogueItems: [],
    }
  }

  return {
    source: 'empty',
    input: '',
    dialogueItems: [],
  }
}

export function mergeVoiceAnalysisWithScreenplay(
  voiceLines: VoiceAnalysisLine[],
  dialogueItems: ScreenplayDialogueItem[],
): VoiceAnalysisLine[] {
  if (dialogueItems.length === 0) {
    return voiceLines
  }

  const aiLineByIndex = new Map<number, VoiceAnalysisLine>()
  for (const line of voiceLines) {
    if (typeof line.lineIndex !== 'number' || !Number.isFinite(line.lineIndex)) continue
    const lineIndex = Math.floor(line.lineIndex)
    if (lineIndex <= 0) continue
    aiLineByIndex.set(lineIndex, line)
  }

  return dialogueItems.map((item) => {
    const matched = aiLineByIndex.get(item.lineIndex)
    return {
      lineIndex: item.lineIndex,
      speaker: item.speaker,
      content: item.content,
      emotionStrength:
        typeof matched?.emotionStrength === 'number' && Number.isFinite(matched.emotionStrength)
          ? matched.emotionStrength
          : 0.1,
      matchedPanel: matched?.matchedPanel || null,
    }
  })
}
