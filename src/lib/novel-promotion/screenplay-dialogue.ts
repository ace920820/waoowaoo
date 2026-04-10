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

type ScreenplayCoverageStats = {
  totalClips: number
  clipsWithScreenplay: number
  clipsWithUsableDialogue: number
  malformedScreenplayClips: number
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

function collectScreenplayDialogue(clips: ClipDialogueSource[]): {
  dialogueItems: ScreenplayDialogueItem[]
  stats: ScreenplayCoverageStats
} {
  const dialogueItems: ScreenplayDialogueItem[] = []
  const stats: ScreenplayCoverageStats = {
    totalClips: clips.length,
    clipsWithScreenplay: 0,
    clipsWithUsableDialogue: 0,
    malformedScreenplayClips: 0,
  }

  for (const clip of clips) {
    const rawScreenplay = typeof clip.screenplay === 'string' ? clip.screenplay.trim() : ''
    if (!rawScreenplay) {
      continue
    }

    stats.clipsWithScreenplay += 1
    const screenplay = parseScreenplayPayload(rawScreenplay)
    if (!screenplay || !Array.isArray(screenplay.scenes)) {
      stats.malformedScreenplayClips += 1
      continue
    }

    const clipStartCount = dialogueItems.length
    const scenes = screenplay.scenes as ScreenplayScene[]

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
          dialogueItems.push({
            clipId: clip.id,
            lineIndex: dialogueItems.length + 1,
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
          dialogueItems.push({
            clipId: clip.id,
            lineIndex: dialogueItems.length + 1,
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

    if (dialogueItems.length > clipStartCount) {
      stats.clipsWithUsableDialogue += 1
    }
  }

  return { dialogueItems, stats }
}

function shouldUseScreenplayDialogue(stats: ScreenplayCoverageStats): boolean {
  if (stats.totalClips === 0) return false
  if (stats.clipsWithScreenplay !== stats.totalClips) return false
  if (stats.malformedScreenplayClips > 0) return false
  if (stats.clipsWithUsableDialogue !== stats.totalClips) return false
  return true
}

export function buildVoiceAnalysisDialogueSource(params: {
  novelText: string | null | undefined
  clips: ClipDialogueSource[]
}): VoiceAnalysisDialogueSource {
  const { dialogueItems, stats } = collectScreenplayDialogue(params.clips)
  if (dialogueItems.length > 0 && shouldUseScreenplayDialogue(stats)) {
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

export function validateVoiceAnalysisForScreenplay(params: {
  voiceLines: VoiceAnalysisLine[]
  dialogueItems: ScreenplayDialogueItem[]
}) {
  const expectedCount = params.dialogueItems.length
  if (expectedCount === 0) return
  if (params.voiceLines.length !== expectedCount) {
    throw new Error(`voice analysis returned ${params.voiceLines.length} lines for ${expectedCount} screenplay items`)
  }

  const seenIndexes = new Set<number>()
  for (let index = 0; index < params.voiceLines.length; index += 1) {
    const voiceLine = params.voiceLines[index]
    if (typeof voiceLine.lineIndex !== 'number' || !Number.isFinite(voiceLine.lineIndex)) {
      throw new Error(`voice line ${index + 1} is missing valid lineIndex`)
    }

    const lineIndex = Math.floor(voiceLine.lineIndex)
    if (lineIndex <= 0 || lineIndex > expectedCount) {
      throw new Error(`voice line ${index + 1} has out-of-range lineIndex ${lineIndex}`)
    }
    if (seenIndexes.has(lineIndex)) {
      throw new Error(`voice analysis returned duplicate screenplay lineIndex ${lineIndex}`)
    }
    seenIndexes.add(lineIndex)
  }

  for (let lineIndex = 1; lineIndex <= expectedCount; lineIndex += 1) {
    if (!seenIndexes.has(lineIndex)) {
      throw new Error(`voice analysis missing screenplay lineIndex ${lineIndex}`)
    }
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
