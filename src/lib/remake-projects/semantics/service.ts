import { prisma } from '@/lib/prisma'

export type RemakeShotSemantics = {
  shotType: string | null
  cameraMove: string | null
  description: string | null
  moodPresetId: string | null
  customMood: string | null
  sceneTag: string | null
  characterTags: string[]
}

export async function updateRemakeShotSemantics(input: {
  projectId: string
  shotId: string
  userId: string
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  moodPresetId?: string | null
  customMood?: string | null
  sceneTag?: string | null
  characterTags?: string[] | null
}): Promise<{ semantics: RemakeShotSemantics } | null> {
  const shot = await prisma.remakeShot.findUnique({
    where: { id: input.shotId },
    include: { remakeProject: { select: { project: { select: { userId: true, type: true } } } } },
  })
  if (!shot) return null
  const project = shot.remakeProject?.project
  if (!project || project.userId !== input.userId || project.type !== 'remake') return null
  if (shot.remakeProjectId !== input.projectId) return null

  const data: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(input, 'shotType')) data.shotType = input.shotType
  if (Object.prototype.hasOwnProperty.call(input, 'cameraMove')) data.cameraMove = input.cameraMove
  if (Object.prototype.hasOwnProperty.call(input, 'description')) data.description = input.description
  if (Object.prototype.hasOwnProperty.call(input, 'moodPresetId')) data.moodPresetId = input.moodPresetId
  if (Object.prototype.hasOwnProperty.call(input, 'customMood')) data.customMood = input.customMood
  if (Object.prototype.hasOwnProperty.call(input, 'sceneTag')) data.sceneTag = input.sceneTag
  if (Object.prototype.hasOwnProperty.call(input, 'characterTags')) {
    data.characterTags = input.characterTags ? JSON.stringify(input.characterTags) : null
  }

  const updated = await prisma.remakeShot.update({
    where: { id: input.shotId },
    data,
  })

  return {
    semantics: {
      shotType: updated.shotType ?? null,
      cameraMove: updated.cameraMove ?? null,
      description: updated.description ?? null,
      moodPresetId: updated.moodPresetId ?? null,
      customMood: updated.customMood ?? null,
      sceneTag: updated.sceneTag ?? null,
      characterTags: parseTags(updated.characterTags),
    },
  }
}

function parseTags(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
