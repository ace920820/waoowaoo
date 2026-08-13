import { prisma } from '@/lib/prisma'
import { resolveProjectModelCapabilityGenerationOptions, getUserModelConfig, getProjectModelConfig } from '@/lib/config-service'
import { resolveMediaRef } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'
import { getAdoptedPromptForGeneration } from '../prompt/service'
import {
  readAssetIdList,
  resolveShotAssetMedia,
  type ResolvedCharacterAsset,
  type ResolvedLocationAsset,
} from '../semantics/asset-media'
import { remakeReferenceRoleUsage } from '../video/reference-plan'
import { keyframeInputFingerprint, keyframeInputSnapshotSchema, keyframeSlotSchema, type KeyframeInputSnapshot } from './contracts'
import { buildRemakeKeyframeTaskDescriptor } from './task-contract'

type Client = typeof prisma

type CurrentKeyframe = {
  projectId: string
  remakeProjectId: string
  shotId: string
  stableKey: string
  sourceRevision: number
  revision: number
  revisionId: string
  sceneAssetId: string | null
  characterAssetIds: string[]
  propAssetIds: string[]
}

async function currentKeyframe(client: Client, input: { projectId: string; shotId: string }): Promise<CurrentKeyframe> {
  const shot = await client.remakeShot.findFirst({
    where: { id: input.shotId, remakeProject: { projectId: input.projectId, project: { type: 'remake' } } },
    include: { remakeProject: { include: { currentSource: true } }, revisions: { where: { lifecycleState: 'active' }, orderBy: { revision: 'desc' }, take: 1 } },
  })
  const revision = shot?.revisions[0]
  const sourceRevision = shot?.remakeProject.currentSource?.sourceRevision
  if (!shot || !revision || !Number.isSafeInteger(sourceRevision) || !sourceRevision) throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
  if (shot.currentRevision !== revision.revision || revision.sourceRevision !== sourceRevision) throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
  return {
    projectId: input.projectId,
    remakeProjectId: shot.remakeProjectId,
    shotId: shot.id,
    stableKey: shot.stableKey,
    sourceRevision,
    revision: revision.revision,
    revisionId: revision.id,
    sceneAssetId: shot.sceneAssetId ?? null,
    characterAssetIds: readAssetIdList(shot.characterAssetIds),
    propAssetIds: readAssetIdList(shot.propAssetIds),
  }
}

function promptTargetKey(slot: string) {
  return `image:${keyframeSlotSchema.parse(slot)}` as const
}

/** 单次分镜图片生成最多携带的参考图数量（与视频 omni-reference 图片上限一致）。 */
const REMAKE_KEYFRAME_REFERENCE_IMAGE_CAP = 9

type KeyframeReferenceCandidate = {
  role: 'character_reference' | 'scene_reference' | 'prop_reference'
  label: string
  usage: string
  mediaId?: string
  mediaUrl?: string
}

function referenceMediaFields(mediaId: string | null | undefined, url: string | null | undefined): Pick<KeyframeReferenceCandidate, 'mediaId' | 'mediaUrl'> {
  if (mediaId) return { mediaId }
  if (url) return { mediaUrl: url }
  return {}
}

/**
 * 从镜头语义绑定的资产（角色 / 场景 / 物品）构建参考候选，顺序与
 * 多镜头确认页 / 视频生成的 omni-reference 优先级一致：角色 -> 场景 -> 物品。
 */
function buildKeyframeAssetReferenceCandidates(input: {
  sceneAssetId: string | null
  characterAssetIds: string[]
  propAssetIds: string[]
  characters: Map<string, ResolvedCharacterAsset>
  locations: Map<string, ResolvedLocationAsset>
}): KeyframeReferenceCandidate[] {
  const candidates: KeyframeReferenceCandidate[] = []
  for (const assetId of input.characterAssetIds) {
    const character = input.characters.get(assetId)
    if (!character) continue
    const media = referenceMediaFields(character.imageMediaId, character.imageUrl)
    if (!media.mediaId && !media.mediaUrl) continue
    candidates.push({
      role: 'character_reference',
      label: `角色 ${character.name}`,
      usage: remakeReferenceRoleUsage('character_reference'),
      ...media,
    })
  }
  if (input.sceneAssetId) {
    const scene = input.locations.get(input.sceneAssetId)
    if (scene) {
      const media = referenceMediaFields(scene.imageMediaId, scene.imageUrl)
      if (media.mediaId || media.mediaUrl) {
        candidates.push({
          role: 'scene_reference',
          label: `场景 ${scene.name}`,
          usage: remakeReferenceRoleUsage('scene_reference'),
          ...media,
        })
      }
    }
  }
  for (const assetId of input.propAssetIds) {
    const prop = input.locations.get(assetId)
    if (!prop) continue
    const media = referenceMediaFields(prop.imageMediaId, prop.imageUrl)
    if (!media.mediaId && !media.mediaUrl) continue
    candidates.push({
      role: 'prop_reference',
      label: `物品 ${prop.name}`,
      usage: remakeReferenceRoleUsage('prop_reference'),
      ...media,
    })
  }
  return candidates
}

/** 参考素材使用说明后缀：与多镜头确认页 / 视频生成一致，明确 @ImageN 的用途。 */
function buildKeyframeReferencePromptSuffix(refs: KeyframeReferenceCandidate[]): string {
  if (refs.length === 0) return ''
  const lines = refs.map((ref, index) => `@Image${index + 1}（${ref.label}）：${ref.usage}。`)
  return [
    '参考素材使用说明：',
    ...lines,
    '请严格按上述 @Image 引用理解素材用途，优先保证角色外观、场景质感和关键物品一致。',
  ].join('\n')
}

export async function buildKeyframeGenerationSubmission(input: {
  projectId: string
  userId: string
  shotId: string
  slot: string
  operationKey: string
  count: number
  model?: string
  options: Record<string, unknown>
  referenceMediaIds: string[]
}) {
  const slot = keyframeSlotSchema.parse(input.slot)
  const project = await prisma.project.findFirst({ where: { id: input.projectId, userId: input.userId, type: 'remake' }, select: { id: true } })
  if (!project) throw new Error('REMAKE_KEYFRAME_PROJECT_NOT_FOUND')
  const current = await currentKeyframe(prisma, input)
  const track = await prisma.remakeKeyframeTrack.findUnique({ where: { shotRevisionId_slot: { shotRevisionId: current.revisionId, slot } } })
  if (!track?.selectedForGeneration) throw new Error('REMAKE_KEYFRAME_SLOT_NOT_SELECTED')
  const prompt = await getAdoptedPromptForGeneration({ projectId: input.projectId, shotId: input.shotId, targetKey: promptTargetKey(slot) })
  if (!prompt) throw new Error('REMAKE_KEYFRAME_PROMPT_NOT_APPROVED')

  // 参考图：优先解析镜头语义中绑定的角色 / 场景 / 物品资产（多镜头确认页同款服务端推导），
  // 再追加客户端显式传入的参考图；全部归一为 MediaObject id 后冻结进 snapshot。
  const assetMedia = await resolveShotAssetMedia({
    projectId: input.projectId,
    sceneAssetId: current.sceneAssetId,
    characterAssetIds: current.characterAssetIds,
    propAssetIds: current.propAssetIds,
  })
  const referenceCandidates = buildKeyframeAssetReferenceCandidates({
    sceneAssetId: current.sceneAssetId,
    characterAssetIds: current.characterAssetIds,
    propAssetIds: current.propAssetIds,
    characters: assetMedia.characterById,
    locations: assetMedia.locationById,
  })
  const referenceMediaIds: string[] = []
  const includedReferenceCandidates: KeyframeReferenceCandidate[] = []
  for (const candidate of referenceCandidates) {
    if (referenceMediaIds.length >= REMAKE_KEYFRAME_REFERENCE_IMAGE_CAP) break
    const media = await resolveMediaRef(candidate.mediaId ?? null, candidate.mediaUrl ?? null)
    if (!media?.id || referenceMediaIds.includes(media.id)) continue
    referenceMediaIds.push(media.id)
    includedReferenceCandidates.push(candidate)
  }
  for (const mediaId of input.referenceMediaIds) {
    if (referenceMediaIds.length >= REMAKE_KEYFRAME_REFERENCE_IMAGE_CAP) break
    if (!referenceMediaIds.includes(mediaId)) referenceMediaIds.push(mediaId)
  }
  const promptSuffix = buildKeyframeReferencePromptSuffix(includedReferenceCandidates)
  const promptText = promptSuffix ? `${prompt.integratedGenerationPrompt}\n\n${promptSuffix}` : prompt.integratedGenerationPrompt

  // 解析最终使用的模型：显式 model > 项目 storyboardModel > 用户 storyboardModel
  let resolvedModel = input.model?.trim() || null
  if (!resolvedModel) {
    const projectConfig = await getProjectModelConfig(input.projectId, input.userId)
    resolvedModel = projectConfig.storyboardModel
  }
  if (!resolvedModel) {
    const userConfig = await getUserModelConfig(input.userId)
    resolvedModel = userConfig.storyboardModel
  }
  if (!resolvedModel) throw new Error("REMAKE_KEYFRAME_MODEL_NOT_CONFIGURED")

  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.projectId,
    userId: input.userId,
    modelType: 'image',
    modelKey: resolvedModel,
    runtimeSelections: input.options as Record<string, string | number | boolean>,
  })
  const snapshot = keyframeInputSnapshotSchema.parse({
    projectId: input.projectId,
    remakeProjectId: current.remakeProjectId,
    shotId: current.shotId,
    stableKey: current.stableKey,
    sourceRevision: current.sourceRevision,
    shotRevision: current.revision,
    shotRevisionId: current.revisionId,
    slot,
    promptVersionId: prompt.id,
    promptText,
    model: { id: resolvedModel },
    options: capabilityOptions,
    referenceMediaIds,
    requestedCandidateCount: input.count,
  })
  return buildRemakeKeyframeTaskDescriptor({ projectId: input.projectId, operationKey: input.operationKey, inputSnapshot: snapshot })
}

export async function assertKeyframeSubmissionCurrent(snapshot: KeyframeInputSnapshot, client: Client = prisma) {
  const parsed = keyframeInputSnapshotSchema.parse(snapshot)
  const current = await currentKeyframe(client, parsed)
  if (current.remakeProjectId !== parsed.remakeProjectId || current.revisionId !== parsed.shotRevisionId || current.revision !== parsed.shotRevision || current.sourceRevision !== parsed.sourceRevision) {
    throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
  }
  const track = await client.remakeKeyframeTrack.findUnique({ where: { shotRevisionId_slot: { shotRevisionId: parsed.shotRevisionId, slot: parsed.slot } } })
  if (!track?.selectedForGeneration) throw new Error('REMAKE_KEYFRAME_SLOT_NOT_SELECTED')
  const prompt = await getAdoptedPromptForGeneration({ projectId: parsed.projectId, shotId: parsed.shotId, targetKey: promptTargetKey(parsed.slot) })
  if (!prompt || prompt.id !== parsed.promptVersionId || !parsed.promptText.startsWith(prompt.integratedGenerationPrompt)) throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
}

export async function resolveKeyframeReferenceStorageKeys(snapshot: KeyframeInputSnapshot) {
  keyframeInputSnapshotSchema.parse(snapshot)
  const refs = await Promise.all(snapshot.referenceMediaIds.map(async (mediaId) => {
    const media = await resolveMediaRef(mediaId, null)
    if (!media?.storageKey) throw new Error('REMAKE_KEYFRAME_REFERENCE_UNAVAILABLE')
    return getSignedUrl(media.storageKey)
  }))
  return refs
}

export async function setKeyframeSelection(input: { projectId: string; userId: string; shotId: string; slot: string; selectedForGeneration?: boolean; selected?: boolean }) {
  const slot = keyframeSlotSchema.parse(input.slot)
  const project = await prisma.project.findFirst({ where: { id: input.projectId, userId: input.userId, type: 'remake' }, select: { id: true } })
  if (!project) throw new Error('REMAKE_KEYFRAME_PROJECT_NOT_FOUND')
  const current = await currentKeyframe(prisma, input)
  const selectedForGeneration = input.selectedForGeneration ?? input.selected ?? false
  if (selectedForGeneration) {
    const prompt = await getAdoptedPromptForGeneration({ projectId: input.projectId, shotId: input.shotId, targetKey: promptTargetKey(slot) })
    if (!prompt) throw new Error('REMAKE_KEYFRAME_PROMPT_NOT_APPROVED')
  }
  return await prisma.remakeKeyframeTrack.upsert({
    where: { shotRevisionId_slot: { shotRevisionId: current.revisionId, slot } },
    create: { shotRevisionId: current.revisionId, slot, selectedForGeneration },
    update: { selectedForGeneration },
  })
}

export async function getKeyframeTrackHistory(input: { projectId: string; userId: string; trackId: string }) {
  const batches = await prisma.remakeKeyframeBatch.findMany({
    where: { trackId: input.trackId, track: { shotRevision: { shot: { remakeProject: { projectId: input.projectId, project: { userId: input.userId } } } } } },
    orderBy: { createdAt: 'desc' },
    include: { candidates: { orderBy: { ordinal: 'asc' }, include: { outputVersion: true } } },
  })
  return {
    trackId: input.trackId,
    adoptedCandidateId: null,
    batches: batches.map((batch) => ({ id: batch.id, operationKey: batch.operationKey, requestedCandidateCount: batch.requestedCandidateCount, createdAt: batch.createdAt, candidates: batch.candidates.map((candidate) => ({ id: candidate.id, ordinal: candidate.ordinal, mediaId: candidate.outputVersion.mediaId, status: candidate.outputVersion.status, invalidated: Boolean(candidate.outputVersion.invalidatedAt) })) })),
  }
}

export async function getKeyframeTrackDetail(input: { projectId: string; userId: string; trackId: string }) {
  const track = await prisma.remakeKeyframeTrack.findFirst({
    where: { id: input.trackId, shotRevision: { shot: { remakeProject: { projectId: input.projectId, project: { userId: input.userId } } } } },
    include: {
      adoptedCandidate: true,
      batches: { orderBy: { createdAt: 'desc' }, include: { candidates: { orderBy: { ordinal: 'asc' }, include: { outputVersion: true } } } },
      adoptionEvents: { orderBy: { createdAt: 'desc' } },
      shotRevision: { include: { shot: { select: { id: true, currentRevision: true } } } },
    },
  })
  if (!track) return null
  return {
    track: { id: track.id, slot: track.slot, selectedForGeneration: track.selectedForGeneration, adoptedCandidateId: track.adoptedCandidateId, shotId: track.shotRevision.shot.id, revision: track.shotRevision.revision, isCurrent: track.shotRevision.shot.currentRevision === track.shotRevision.revision },
    history: track.batches.map((batch) => ({ id: batch.id, taskId: batch.taskId, operationKey: batch.operationKey, modelId: batch.modelId, options: batch.modelOptions, referenceMediaIds: batch.referenceMediaIds, requestedCandidateCount: batch.requestedCandidateCount, createdAt: batch.createdAt, candidates: batch.candidates.map((candidate) => ({ id: candidate.id, ordinal: candidate.ordinal, outputVersionId: candidate.outputVersionId, mediaId: candidate.outputVersion.mediaId, status: candidate.outputVersion.status, invalidated: Boolean(candidate.outputVersion.invalidatedAt) })) })),
    adoptionEvents: track.adoptionEvents.map((event) => ({ id: event.id, previousCandidateId: event.previousCandidateId, nextCandidateId: event.nextCandidateId, createdAt: event.createdAt })),
  }
}

export async function adoptKeyframeCandidate(input: { projectId: string; userId: string; trackId: string; candidateId: string }) {
  return await prisma.$transaction(async (tx) => {
    const track = await (tx.remakeKeyframeTrack.findFirst ?? tx.remakeKeyframeTrack.findUnique)({
      where: { id: input.trackId, shotRevision: { shot: { remakeProject: { projectId: input.projectId, project: { userId: input.userId } } } } },
      include: { shotRevision: { include: { shot: true } }, adoptedCandidate: true },
    })
    if (!track) throw new Error('REMAKE_KEYFRAME_TRACK_NOT_FOUND')
    if (track.shotRevision && (track.shotRevision.shot.currentRevision !== track.shotRevision.revision || track.shotRevision.lifecycleState !== 'active')) throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
    const candidate = await tx.remakeKeyframeCandidate.findFirst({ where: { id: input.candidateId, batch: { trackId: track.id }, outputVersion: { invalidatedAt: null, status: 'completed' } } })
    if (!candidate) throw new Error('REMAKE_KEYFRAME_CANDIDATE_NOT_FOUND')
    const updated = await tx.remakeKeyframeTrack.update({ where: { id: track.id }, data: { adoptedCandidateId: candidate.id } })
    await tx.remakeKeyframeAdoptionEvent.create({ data: { trackId: track.id, previousCandidateId: track.adoptedCandidateId, nextCandidateId: candidate.id, reviewerId: input.userId } })
    return updated ?? { id: track.id, adoptedCandidateId: candidate.id }
  })
}

export async function appendKeyframeGenerationBatch(input: {
  taskId: string
  operationKey: string
  inputSnapshot: KeyframeInputSnapshot
  inputFingerprint: string
  mediaIds: string[]
}) {
  const snapshot = keyframeInputSnapshotSchema.parse(input.inputSnapshot)
  if (input.inputFingerprint !== keyframeInputFingerprint(snapshot)) throw new Error('REMAKE_KEYFRAME_FINGERPRINT_INVALID')
  if (input.mediaIds.length !== snapshot.requestedCandidateCount) throw new Error('REMAKE_KEYFRAME_CANDIDATE_COUNT_MISMATCH')
  return await prisma.$transaction(async (tx) => {
    await assertKeyframeSubmissionCurrent(snapshot, tx as Client)
    const track = await tx.remakeKeyframeTrack.findUnique({ where: { shotRevisionId_slot: { shotRevisionId: snapshot.shotRevisionId, slot: snapshot.slot } } })
    if (!track?.selectedForGeneration) throw new Error('REMAKE_KEYFRAME_SLOT_NOT_SELECTED')
    const existing = await tx.remakeKeyframeBatch.findUnique({ where: { trackId_operationKey: { trackId: track.id, operationKey: input.operationKey } }, include: { candidates: { orderBy: { ordinal: 'asc' }, select: { id: true } } } })
    if (existing) return { batchId: existing.id, candidateIds: existing.candidates.map((candidate) => candidate.id) }
    const batch = await tx.remakeKeyframeBatch.create({
      data: {
        trackId: track.id,
        promptVersionId: snapshot.promptVersionId,
        taskId: input.taskId,
        operationKey: input.operationKey,
        inputFingerprint: input.inputFingerprint,
        inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
        modelId: snapshot.model.id,
        modelOptions: JSON.parse(JSON.stringify(snapshot.options)),
        referenceMediaIds: JSON.parse(JSON.stringify(snapshot.referenceMediaIds)),
        requestedCandidateCount: snapshot.requestedCandidateCount,
        candidates: {
          create: input.mediaIds.map((mediaId, index) => ({
            ordinal: index + 1,
            outputVersion: {
              create: {
                shotId: snapshot.shotId,
                revisionId: snapshot.shotRevisionId,
                mediaId,
                kind: 'keyframe_candidate',
                fingerprint: `${input.operationKey}:${input.inputFingerprint}:${index + 1}`,
                taskId: input.taskId,
                inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
                status: 'completed',
              },
            },
          })),
        },
      },
    })
    const candidates = await tx.remakeKeyframeCandidate.findMany({ where: { batchId: batch.id }, orderBy: { ordinal: 'asc' }, select: { id: true } })
    await tx.remakeProvenanceRecord.create({ data: { shotId: snapshot.shotId, keyframeBatchId: batch.id, schema: 'remake-keyframe-generation@1', executor: 'image-worker', payload: JSON.stringify({ inputFingerprint: input.inputFingerprint, model: snapshot.model.id, slot: snapshot.slot }) } })
    return { batchId: batch.id, candidateIds: candidates.map((candidate) => candidate.id) }
  })
}
