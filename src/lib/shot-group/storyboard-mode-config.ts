export interface ShotGroupStoryboardModeDefinition {
  id: string
  label: string
  promptText: string
}

export interface ShotGroupStoryboardModeSettings {
  modes: ShotGroupStoryboardModeDefinition[]
  defaultModeId: string
}

export const STORYBOARD_MODE_STORAGE_KEY = 'waoowaoo.shot-group.storyboard-modes.v1'
export const STORYBOARD_MODE_STORAGE_EVENT = 'waoowaoo:shot-group-storyboard-modes-changed'

export const DEFAULT_STORYBOARD_MODE_ID = 'classic-nine-grid'

export const CLASSIC_NINE_GRID_PROMPT = `分析输入图像的完整构图，识别画面中所有核心主体（单人、群体/情侣、车辆或特定物体），并明确其空间关系与互动状态。 生成一套连贯的3×3「电影感分镜参考表」，包含9个不同镜头，严格沿用原场景的主体与环境。 你必须根据内容适配标准电影镜头类型（例如：群体需保持完整呈现；物体需完整入镜）：第1行（建立场景语境）：

1. 极远景（ELS）：主体在宏大环境中以小比例呈现。
2. 全景（LS）：主体/群体完整入镜（从头到脚/从车轮到车顶）。
3. 中全景（美式/3-4景）：人物从膝盖以上入镜；物体呈现3/4视角。

第2行（核心内容呈现）：

4. 中景（MS）：人物从腰部以上入镜（或聚焦物体核心区域），重点呈现互动/动作。
5. 中近景（MCU）：人物从胸部以上入镜，对主体进行亲密感构图。
6. 特写（CU）：紧凑构图聚焦人物面部/物体正面。

第3行（细节与视角变化）：

7. 大特写（ECU）：微距细节，强烈聚焦关键特征（眼睛、手部、logo、纹理）。
8. 低角度镜头（仰视）：从地面向上拍摄主体，营造压迫感/英雄感。
9. 高角度镜头（俯视）：从上方向下拍摄主体。

确保严格一致性：9个分镜必须保持主体、服饰、光线完全一致；景深需符合镜头逻辑（特写镜头呈现自然虚化效果）。

一套专业的3×3电影感分镜网格，共9个分镜面板。
网格以多种焦距，完整呈现输入图像中的特定主体与场景。
顶行： 环境全景、主体全览、3/4裁切。
中行： 腰部以上视角、胸部以上视角、面部/正面特写。
底行： 微距细节、低角度、高角度。

所有分镜均采用写实质感、统一的电影级调色，并根据主体/物体数量适配精准构图。
情节参考`

export const DEFAULT_STORYBOARD_MODES: ShotGroupStoryboardModeDefinition[] = [
  {
    id: DEFAULT_STORYBOARD_MODE_ID,
    label: '经典九宫格',
    promptText: CLASSIC_NINE_GRID_PROMPT,
  },
]

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeMode(mode: unknown): ShotGroupStoryboardModeDefinition | null {
  if (!mode || typeof mode !== 'object' || Array.isArray(mode)) return null
  const record = mode as Record<string, unknown>
  const id = readString(record.id)
  const label = readString(record.label)
  const promptText = readString(record.promptText)
  if (!id || !label || !promptText) return null
  return { id, label, promptText }
}

export function normalizeStoryboardModeSettings(
  raw: Partial<ShotGroupStoryboardModeSettings> | null | undefined,
): ShotGroupStoryboardModeSettings {
  const sanitizedModes = Array.isArray(raw?.modes)
    ? raw.modes
      .map((mode) => sanitizeMode(mode))
      .filter((mode): mode is ShotGroupStoryboardModeDefinition => Boolean(mode))
    : []

  const modes = sanitizedModes.length > 0 ? sanitizedModes : DEFAULT_STORYBOARD_MODES
  const defaultModeId = readString(raw?.defaultModeId) || modes[0]?.id || DEFAULT_STORYBOARD_MODE_ID
  const resolvedDefaultModeId = modes.some((mode) => mode.id === defaultModeId)
    ? defaultModeId
    : modes[0]?.id || DEFAULT_STORYBOARD_MODE_ID

  return {
    modes,
    defaultModeId: resolvedDefaultModeId,
  }
}

export function createDefaultStoryboardModeSettings(): ShotGroupStoryboardModeSettings {
  return normalizeStoryboardModeSettings({
    modes: DEFAULT_STORYBOARD_MODES,
    defaultModeId: DEFAULT_STORYBOARD_MODE_ID,
  })
}

export function resolveStoryboardModeDefinition(
  settings: Partial<ShotGroupStoryboardModeSettings> | null | undefined,
  modeId: string | null | undefined,
): ShotGroupStoryboardModeDefinition {
  const normalized = normalizeStoryboardModeSettings(settings)
  const trimmedModeId = readString(modeId)
  return normalized.modes.find((mode) => mode.id === trimmedModeId)
    || normalized.modes.find((mode) => mode.id === normalized.defaultModeId)
    || normalized.modes[0]
    || DEFAULT_STORYBOARD_MODES[0]
}

export function readStoryboardModeSettingsFromStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): ShotGroupStoryboardModeSettings {
  if (!storage) return createDefaultStoryboardModeSettings()
  const rawValue = storage.getItem(STORYBOARD_MODE_STORAGE_KEY)
  if (!rawValue) return createDefaultStoryboardModeSettings()

  try {
    return normalizeStoryboardModeSettings(JSON.parse(rawValue) as Partial<ShotGroupStoryboardModeSettings>)
  } catch {
    return createDefaultStoryboardModeSettings()
  }
}

export function writeStoryboardModeSettingsToStorage(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  settings: Partial<ShotGroupStoryboardModeSettings> | null | undefined,
) {
  if (!storage) return createDefaultStoryboardModeSettings()
  const normalized = normalizeStoryboardModeSettings(settings)
  storage.setItem(STORYBOARD_MODE_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
