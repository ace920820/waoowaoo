import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import {
  findCharacterByName,
  getSelectedCharacterReferenceImage,
  getSelectedLocationReferenceImage,
  parsePanelCharacterReferences,
} from '@/lib/novel-promotion/storyboard-readiness'
import {
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
  withLabelBar,
} from '../utils'

export type AnyObj = Record<string, unknown>

interface CharacterAppearanceLike {
  appearanceIndex?: number
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
  imageUrls: string | null
  imageUrl: string | null
  selectedIndex: number | null
}

interface CharacterLike {
  name: string
  appearances?: CharacterAppearanceLike[]
}

interface LocationImageLike {
  description?: string | null
  availableSlots?: string | null
  imageIndex?: number
  isSelected: boolean
  imageUrl: string | null
}

interface LocationLike {
  name: string
  images?: LocationImageLike[]
}

interface NovelProjectData {
  videoRatio?: string | null
  storyboardMoodPresets?: unknown
  storyboardDefaultMoodPresetId?: string | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
}

interface PanelLike {
  sketchImageUrl?: string | null
  characters?: string | null
  location?: string | null
}

interface NovelDataDb {
  novelPromotionProject: {
    findUnique(args: Record<string, unknown>): Promise<NovelProjectData | null>
  }
}

export function parseJsonStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function parseImageUrls(value: string | null | undefined, fieldName: string): string[] {
  return decodeImageUrlsFromDb(value, fieldName)
}

export function clampCount(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

async function generateImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
  label?: string
}) {
  const source = await resolveImageSourceFromGeneration(params.job, {
    userId: params.userId,
    modelId: params.modelId,
    prompt: params.prompt,
    options: params.options,
  })

  const uploadSource = params.label
    ? await withLabelBar(source, params.label)
    : source
  const cosKey = await uploadImageSourceToCos(uploadSource, params.keyPrefix, params.targetId)
  return cosKey
}

export async function generateCleanImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function generateProjectLabeledImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  label: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function resolveNovelData(projectId: string) {
  const db = prisma as unknown as NovelDataDb
  const data = await db.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })

  if (!data) {
    throw new Error(`NovelPromotionProject not found: ${projectId}`)
  }

  return data
}

export async function collectPanelReferenceImages(projectData: NovelProjectData, panel: PanelLike) {
  const refs: string[] = []

  const sketch = toSignedUrlIfCos(panel.sketchImageUrl, 3600)
  if (sketch) refs.push(sketch)

  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  for (const item of panelCharacters) {
    const character = findCharacterByName(projectData.characters || [], item.name)
    if (!character) continue

    const appearances = character.appearances || []
    let appearance = appearances[0]
    if (item.appearance) {
      const matched = appearances.find((a) => (a.changeReason || '').toLowerCase() === item.appearance!.toLowerCase())
      if (matched) appearance = matched
    }

    if (!appearance) continue

    const key = getSelectedCharacterReferenceImage(appearance)
    const signed = toSignedUrlIfCos(key, 3600)
    if (signed) refs.push(signed)
  }

  if (panel.location) {
    const location = (projectData.locations || []).find((loc) => loc.name.toLowerCase() === panel.location!.toLowerCase())
    if (location) {
      const signed = toSignedUrlIfCos(getSelectedLocationReferenceImage(location), 3600)
      if (signed) refs.push(signed)
    }
  }

  return refs
}
