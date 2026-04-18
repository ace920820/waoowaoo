export interface StoryboardMoodPreset {
  id: string
  label: string
  prompt: string
}

export interface StoryboardMoodSelection {
  projectPresets: unknown
  selectedPresetId: string | null | undefined
  customMood: string | null | undefined
}

export type StoryboardMoodSource =
  | 'project_default'
  | 'episode_default'
  | 'clip_applied'
  | 'panel_override'

export interface StoryboardMoodLayerSelection {
  presetId?: string | null | undefined
  customMood?: string | null | undefined
}

export interface StoryboardMoodHierarchySelection {
  projectPresets: unknown
  projectDefault?: StoryboardMoodLayerSelection | null | undefined
  episodeDefault?: StoryboardMoodLayerSelection | null | undefined
  clipApplied?: StoryboardMoodLayerSelection | null | undefined
  panelOverride?: StoryboardMoodLayerSelection | null | undefined
}

const DEFAULT_PRESET_SOURCE: StoryboardMoodPreset[] = [
  {
    id: 'nostalgic-sweet-melancholy',
    label: '怀旧甜美忧郁氛围',
    prompt: '光影柔和，色调素雅，营造出怀旧的 80–90 年代动漫氛围，在永恒浪漫的画面中平衡甜美与淡淡的忧郁。',
  },
  {
    id: 'tranquil-ethereal-fantasy',
    label: '宁静空灵奇幻氛围',
    prompt: '光影温润柔和，烘托出宁静空灵的氛围，令人联想到 80–90 年代的经典奇幻动漫。',
  },
  {
    id: 'cold-elegant-dark',
    label: '冷峻优雅暗黑氛围',
    prompt: '服饰质感利落高级，呈现出复古暗黑美学格调——经典、大胆、从容又极具气场。',
  },
  {
    id: 'minimal-mysterious-cold',
    label: '极简神秘冷峻氛围',
    prompt: '光影突出利落轮廓，营造出 90 年代动漫标志性的冷峻内敛氛围，简约、富有张力且充满沉静力量。',
  },
  {
    id: 'devout-solemn-melancholy',
    label: '虔诚肃穆忧郁氛围',
    prompt: '画面静谧而略带忧伤，体现出 90 年代动漫式的内敛灵性与情感克制，定格虔诚、内心挣扎与空灵之美。',
  },
  {
    id: 'gothic-dangerous-allure',
    label: '哥特魅惑危险氛围',
    prompt: '整体融合诱惑与力量，尽显 80 年代奇幻动漫式的摄人之美，兼具天使般的圣洁与危险气息。',
  },
]

export const DEFAULT_STORYBOARD_MOOD_PRESETS = DEFAULT_PRESET_SOURCE.map((preset) => ({ ...preset }))

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePresetString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function createFallbackPresetId(label: string, index: number): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `preset-${index + 1}`
}

export function normalizeStoryboardMoodPresets(raw: unknown): StoryboardMoodPreset[] {
  const input = (() => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  })()

  if (!input) {
    return DEFAULT_STORYBOARD_MOOD_PRESETS.map((preset) => ({ ...preset }))
  }

  const seenIds = new Set<string>()
  const normalized = input
    .map((item, index): StoryboardMoodPreset | null => {
      if (!isRecord(item)) return null

      const label = normalizePresetString(item.label)
      const prompt = normalizePresetString(item.prompt)
      if (!label || !prompt) return null

      const rawId = normalizePresetString(item.id)
      const id = rawId || createFallbackPresetId(label, index)
      if (!id || seenIds.has(id)) return null
      seenIds.add(id)

      return { id, label, prompt }
    })
    .filter((item): item is StoryboardMoodPreset => !!item)

  if (normalized.length === 0) {
    return DEFAULT_STORYBOARD_MOOD_PRESETS.map((preset) => ({ ...preset }))
  }

  return normalized
}

export function serializeStoryboardMoodPresets(presets: StoryboardMoodPreset[]): string {
  return JSON.stringify(normalizeStoryboardMoodPresets(presets))
}

export function resolveStoryboardMoodPreset(
  presets: StoryboardMoodPreset[] | null | undefined,
  presetId: string | null | undefined,
): StoryboardMoodPreset | null {
  if (!presetId) return null
  const normalizedId = presetId.trim()
  if (!normalizedId) return null
  const normalizedPresets = normalizeStoryboardMoodPresets(presets)
  return normalizedPresets.find((preset) => preset.id === normalizedId) || null
}

export function normalizeStoryboardMoodText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function buildStoryboardMoodContext(selection: StoryboardMoodSelection) {
  const presets = normalizeStoryboardMoodPresets(selection.projectPresets)
  const preset = resolveStoryboardMoodPreset(presets, selection.selectedPresetId)
  const customMood = normalizeStoryboardMoodText(selection.customMood)
  const summaryParts: string[] = []

  if (preset) {
    summaryParts.push(`${preset.label}: ${preset.prompt}`)
  }
  if (customMood) {
    summaryParts.push(`自定义氛围: ${customMood}`)
  }

  return {
    presets,
    preset,
    customMood,
    summary: summaryParts.join('；') || null,
  }
}

function buildStoryboardMoodLayerContext(
  presets: StoryboardMoodPreset[],
  selection: StoryboardMoodLayerSelection | null | undefined,
) {
  const preset = resolveStoryboardMoodPreset(presets, selection?.presetId)
  const customMood = normalizeStoryboardMoodText(selection?.customMood)
  const summaryParts: string[] = []

  if (preset) {
    summaryParts.push(`${preset.label}: ${preset.prompt}`)
  }
  if (customMood) {
    summaryParts.push(`自定义氛围: ${customMood}`)
  }

  return {
    preset,
    customMood,
    summary: summaryParts.join('；') || null,
  }
}

function buildStoryboardMoodSummary(
  preset: StoryboardMoodPreset | null,
  customMood: string | null,
): string | null {
  const summaryParts: string[] = []

  if (preset) {
    summaryParts.push(`${preset.label}: ${preset.prompt}`)
  }
  if (customMood) {
    summaryParts.push(`自定义氛围: ${customMood}`)
  }

  return summaryParts.join('；') || null
}

export function resolveStoryboardMoodHierarchy(selection: StoryboardMoodHierarchySelection) {
  const presets = normalizeStoryboardMoodPresets(selection.projectPresets)
  const orderedLayers: Array<{ source: StoryboardMoodSource; selection: StoryboardMoodLayerSelection | null | undefined }> = [
    { source: 'project_default', selection: selection.projectDefault },
    { source: 'episode_default', selection: selection.episodeDefault },
    { source: 'clip_applied', selection: selection.clipApplied },
    { source: 'panel_override', selection: selection.panelOverride },
  ]

  let effectivePreset: StoryboardMoodPreset | null = null
  let effectiveCustomMood: string | null = null
  let effectiveSource: StoryboardMoodSource | null = null

  for (const layer of orderedLayers) {
    const resolved = buildStoryboardMoodLayerContext(presets, layer.selection)
    if (!resolved.summary) continue

    if (resolved.preset) {
      effectivePreset = resolved.preset
      effectiveCustomMood = resolved.customMood
      effectiveSource = layer.source
      continue
    }

    effectiveCustomMood = resolved.customMood
    effectiveSource = layer.source
  }

  const summary = buildStoryboardMoodSummary(effectivePreset, effectiveCustomMood)
  if (summary) {
    return {
      presets,
      preset: effectivePreset,
      customMood: effectiveCustomMood,
      summary,
      source: effectiveSource,
    }
  }

  return {
    presets,
    preset: null,
    customMood: null,
    summary: null,
    source: null,
  }
}

export function buildStoryboardMoodStyleText(
  styleText: string,
  selection: StoryboardMoodSelection | StoryboardMoodHierarchySelection,
  locale: 'zh' | 'en',
): string {
  const mood = 'selectedPresetId' in selection
    ? buildStoryboardMoodContext(selection)
    : resolveStoryboardMoodHierarchy(selection)
  if (!mood.summary) return styleText

  if (locale === 'en') {
    return `${styleText}\nStoryboard mood requirement: ${mood.summary}. Keep this atmosphere clear and consistent in the final frame.`
  }

  return `${styleText}\n分镜氛围要求：${mood.summary}。请在最终画面中明确、稳定地体现这种氛围。`
}
