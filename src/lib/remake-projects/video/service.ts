import { prisma } from '@/lib/prisma'
import {
  resolveProjectModelCapabilityGenerationOptions,
  getProjectModelConfig,
  getUserModelConfig,
} from '@/lib/config-service'
import {
  readAssetIdList,
  resolveShotAssetMedia,
  type ResolvedCharacterAsset,
  type ResolvedLocationAsset,
} from '../semantics/asset-media'
import { resolveMediaRef } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'
import { keyToSignedUrl } from '@/lib/storage/signed-urls'
import { getAdoptedPromptForGeneration } from '../prompt/service'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
  videoInputFingerprint,
  videoInputSnapshotSchema,
  type OrderedVideoReference,
  type VideoInputSnapshot,
  type VideoReferenceRole,
} from './contracts'
import {
  buildRemakeReferencePlan,
  buildRemakeReferencePromptSuffix,
  remakeReferenceRoleLabel,
  remakeReferenceRoleUsage,
  type RemakeReferenceCandidate,
} from './reference-plan'
import { buildRemakeVideoTaskDescriptor } from './task-contract'
import { deriveDefaultVideoDuration } from './duration'
import type { CapabilityValue } from '@/lib/model-config-contract'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { resolveEffectiveVideoCapabilityDefinitions } from '@/lib/model-capabilities/video-effective'
import { supportsShotGroupMultiReferenceModes } from '@/lib/shot-group/video-config'

type Client = typeof prisma

type CurrentShotInfo = {
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

async function getCurrentShot(
  client: Client,
  input: { projectId: string; shotId: string },
): Promise<CurrentShotInfo> {
  const shot = await client.remakeShot.findFirst({
    where: {
      id: input.shotId,
      remakeProject: { projectId: input.projectId, project: { type: 'remake' } },
    },
    include: {
      remakeProject: { include: { currentSource: true } },
      revisions: {
        where: { lifecycleState: 'active' },
        orderBy: { revision: 'desc' },
        take: 1,
      },
    },
  })
  const revision = shot?.revisions[0]
  const sourceRevision = shot?.remakeProject.currentSource?.sourceRevision
  if (
    !shot ||
    !revision ||
    !Number.isSafeInteger(sourceRevision) ||
    !sourceRevision
  ) {
    throw new Error('REMAKE_VIDEO_INPUT_STALE')
  }
  if (
    shot.currentRevision !== revision.revision ||
    revision.sourceRevision !== sourceRevision
  ) {
    throw new Error('REMAKE_VIDEO_INPUT_STALE')
  }
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

/**
 * Derive the default video duration for a Shot per D-10 / D-11.
 */


function getVideoCapabilityDefinitions(modelKey: string) {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return []
  const capabilities = findBuiltinCapabilities('video', parsed.provider, parsed.modelId)
  return resolveEffectiveVideoCapabilityDefinitions({
    videoCapabilities: capabilities?.video,
  })
}

function referenceMediaFields(mediaId: string | null | undefined, url: string | null | undefined): Pick<RemakeReferenceCandidate, 'mediaId' | 'mediaUrl'> {
  if (mediaId) return { mediaId }
  if (url) return { mediaUrl: url }
  return {}
}

/**
 * Normalize a raw media reference (MediaObject uuid OR storage key / COS url)
 * into a stable MediaObject id, while keeping the raw value as `mediaUrl` for
 * the D-17 currentness comparison. Real keyframe output rows store storage
 * keys in `RemakeOutputVersion.mediaId`, so we cannot freeze that value
 * directly into the uuid-typed snapshot field.
 */
async function resolveStableMediaRef(raw: string | null | undefined): Promise<{ mediaId?: string; mediaUrl?: string }> {
  if (!raw) return {}
  const media = await resolveMediaRef(raw, raw)
  const result: { mediaId?: string; mediaUrl?: string } = { mediaUrl: raw }
  if (media?.id) result.mediaId = media.id
  return result
}

const SLOT_ROLE_MAP: Record<'start' | 'middle' | 'end', VideoReferenceRole> = {
  start: 'start_keyframe',
  middle: 'middle_keyframe',
  end: 'end_keyframe',
}

/**
 * Resolve the explicitly selected keyframes + optional action sheet into
 * reference candidates in the fixed Start -> Middle -> End -> action-sheet
 * order (D-04). Missing adopted keyframes / action sheet fail before provider work.
 */
async function resolveKeyframeReferenceCandidates(params: {
  shotId: string
  revisionId: string
  selectedSlots: Array<'start' | 'middle' | 'end'>
  includeActionSheet: boolean
}): Promise<RemakeReferenceCandidate[]> {
  const candidates: RemakeReferenceCandidate[] = []
  const slotOrder = ['start', 'middle', 'end'] as const

  for (const slot of slotOrder) {
    if (!params.selectedSlots.includes(slot)) continue
    const track = await prisma.remakeKeyframeTrack.findUnique({
      where: { shotRevisionId_slot: { shotRevisionId: params.revisionId, slot } },
      include: { adoptedCandidate: { include: { outputVersion: true } } },
    })
    const rawMedia = track?.adoptedCandidate?.outputVersion?.mediaId
    if (!rawMedia) {
      throw new Error(`REMAKE_VIDEO_KEYFRAME_NOT_ADOPTED:${slot}`)
    }
    const stableMedia = await resolveStableMediaRef(rawMedia)
    if (!stableMedia.mediaId && !stableMedia.mediaUrl) {
      throw new Error(`REMAKE_VIDEO_KEYFRAME_NOT_ADOPTED:${slot}`)
    }
    candidates.push({
      role: SLOT_ROLE_MAP[slot],
      mediaType: 'image',
      sourceType: SLOT_ROLE_MAP[slot],
      label: remakeReferenceRoleLabel(SLOT_ROLE_MAP[slot]),
      usage: remakeReferenceRoleUsage(SLOT_ROLE_MAP[slot]),
      ...stableMedia,
    })
  }

  if (params.includeActionSheet) {
    const actionSheet = await prisma.remakeOutputVersion.findFirst({
      where: {
        shotId: params.shotId,
        revisionId: params.revisionId,
        kind: 'action_sheet',
        status: 'completed',
        mediaId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!actionSheet?.mediaId) {
      throw new Error('REMAKE_VIDEO_ACTION_SHEET_NOT_FOUND')
    }
    const stableActionSheet = await resolveStableMediaRef(actionSheet.mediaId)
    if (!stableActionSheet.mediaId && !stableActionSheet.mediaUrl) {
      throw new Error('REMAKE_VIDEO_ACTION_SHEET_NOT_FOUND')
    }
    candidates.push({
      role: 'action_sheet',
      mediaType: 'image',
      sourceType: 'action_sheet',
      label: remakeReferenceRoleLabel('action_sheet'),
      usage: remakeReferenceRoleUsage('action_sheet'),
      ...stableActionSheet,
    })
  }

  return candidates
}

/**
 * Build the asset-library reference candidates (scene / props / characters /
 * character voices), mirroring the shot-group omni-reference priority and
 * usage text. Only explicitly toggled categories with resolvable media are included.
 */
function buildAssetReferenceCandidates(input: {
  sceneAssetId: string | null
  characterAssetIds: string[]
  propAssetIds: string[]
  includeLocationImage: boolean
  includePropImages: boolean
  includeCharacterImages: boolean
  includeCharacterAudio: boolean
  characters: Map<string, ResolvedCharacterAsset>
  locations: Map<string, ResolvedLocationAsset>
}): RemakeReferenceCandidate[] {
  const candidates: RemakeReferenceCandidate[] = []

  for (const assetId of input.characterAssetIds) {
    const character = input.characters.get(assetId)
    if (!character) continue
    if (input.includeCharacterImages) {
      const media = referenceMediaFields(character.imageMediaId, character.imageUrl)
      if (media.mediaId || media.mediaUrl) {
        candidates.push({
          role: 'character_reference',
          mediaType: 'image',
          sourceType: 'character_reference',
          label: `角色 ${character.name}`,
          usage: remakeReferenceRoleUsage('character_reference'),
          assetId,
          ...media,
        })
      }
    }
    if (input.includeCharacterAudio) {
      const media = referenceMediaFields(character.voiceMediaId, character.voiceUrl)
      if (media.mediaId || media.mediaUrl) {
        candidates.push({
          role: 'character_audio_reference',
          mediaType: 'audio',
          sourceType: 'character_voice_reference',
          label: `角色 ${character.name} 声音`,
          usage: remakeReferenceRoleUsage('character_audio_reference'),
          assetId,
          ...media,
        })
      }
    }
  }

  if (input.includeLocationImage && input.sceneAssetId) {
    const scene = input.locations.get(input.sceneAssetId)
    if (scene) {
      const media = referenceMediaFields(scene.imageMediaId, scene.imageUrl)
      if (media.mediaId || media.mediaUrl) {
        candidates.push({
          role: 'scene_reference',
          mediaType: 'image',
          sourceType: 'location_reference',
          label: `场景 ${scene.name}`,
          usage: remakeReferenceRoleUsage('scene_reference'),
          assetId: input.sceneAssetId,
          ...media,
        })
      }
    }
  }

  if (input.includePropImages) {
    for (const assetId of input.propAssetIds) {
      const prop = input.locations.get(assetId)
      if (!prop) continue
      const media = referenceMediaFields(prop.imageMediaId, prop.imageUrl)
      if (media.mediaId || media.mediaUrl) {
        candidates.push({
          role: 'prop_reference',
          mediaType: 'image',
          sourceType: 'prop_reference',
          label: `物品 ${prop.name}`,
          usage: remakeReferenceRoleUsage('prop_reference'),
          assetId,
          ...media,
        })
      }
    }
  }

  return candidates
}

export async function buildVideoGenerationSubmission(input: {
  projectId: string
  userId: string
  shotId: string
  operationKey: string
  model?: string
  options?: Record<string, unknown>
  selectedSlots: Array<'start' | 'middle' | 'end'>
  includeActionSheet: boolean
  includeCharacterImages?: boolean
  includeLocationImage?: boolean
  includePropImages?: boolean
  includeCharacterAudio?: boolean
  shotDurationSeconds: number
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId, type: 'remake' },
    select: { id: true },
  })
  if (!project) throw new Error('REMAKE_VIDEO_PROJECT_NOT_FOUND')

  const current = await getCurrentShot(prisma, input)

  // D-03: at least one keyframe slot must be selected
  if (input.selectedSlots.length === 0) {
    throw new Error('REMAKE_VIDEO_NO_KEYFRAME_SELECTED')
  }

  // Must have adopted video prompt
  const prompt = await getAdoptedPromptForGeneration({
    projectId: input.projectId,
    shotId: input.shotId,
    targetKey: 'video',
  })
  if (!prompt) throw new Error('REMAKE_VIDEO_PROMPT_NOT_APPROVED')

  // Resolve model: explicit > project videoModel > user videoModel
  let resolvedModel = input.model?.trim() || null
  if (!resolvedModel) {
    const projectConfig = await getProjectModelConfig(input.projectId, input.userId)
    resolvedModel = projectConfig.videoModel
  }
  if (!resolvedModel) {
    const userConfig = await getUserModelConfig(input.userId)
    resolvedModel = userConfig.videoModel
  }
  if (!resolvedModel) throw new Error('REMAKE_VIDEO_MODEL_NOT_CONFIGURED')

  // Get model capability definitions for D-10/D-11 duration derivation
  const capabilityDefinitions = getVideoCapabilityDefinitions(resolvedModel)
  const defaultDuration = deriveDefaultVideoDuration(
    input.shotDurationSeconds,
    capabilityDefinitions,
  )

  // Build runtime selections with server-authoritative defaults. Duration is
  // derived from the shot; every other required capability field (e.g.
  // generationMode, generateAudio, resolution) defaults to the model's first
  // supported option when the client did not send it — otherwise
  // CAPABILITY_REQUIRED fails the request and the UI sees a silent no-op.
  const runtimeSelections: Record<string, CapabilityValue> = {
    ...Object.fromEntries(
      Object.entries(input.options || {}).map(([k, v]) => [k, v as CapabilityValue]),
    ),
  }
  if (runtimeSelections.duration === undefined) {
    runtimeSelections.duration = defaultDuration
  }
  for (const definition of capabilityDefinitions) {
    if (runtimeSelections[definition.field] === undefined && definition.options.length > 0) {
      runtimeSelections[definition.field] = definition.options[0]
    }
  }

  // Server-authoritative capability normalization (D-09, D-07)
  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.projectId,
    userId: input.userId,
    modelType: 'video',
    modelKey: resolvedModel,
    runtimeSelections,
  })

  // Resolve keyframe/action-sheet anchors in fixed order (D-04)
  const anchorCandidates = await resolveKeyframeReferenceCandidates({
    shotId: current.shotId,
    revisionId: current.revisionId,
    selectedSlots: input.selectedSlots,
    includeActionSheet: input.includeActionSheet,
  })

  // Resolve bound scene/prop/character/voice assets (omni-reference parity)
  const assetMedia = await resolveShotAssetMedia({
    projectId: input.projectId,
    sceneAssetId: current.sceneAssetId,
    characterAssetIds: current.characterAssetIds,
    propAssetIds: current.propAssetIds,
  })
  const assetCandidates = buildAssetReferenceCandidates({
    sceneAssetId: current.sceneAssetId,
    characterAssetIds: current.characterAssetIds,
    propAssetIds: current.propAssetIds,
    includeLocationImage: input.includeLocationImage !== false,
    includePropImages: input.includePropImages !== false,
    includeCharacterImages: input.includeCharacterImages !== false,
    includeCharacterAudio: input.includeCharacterAudio === true,
    characters: assetMedia.characterById,
    locations: assetMedia.locationById,
  })

  const plan = buildRemakeReferencePlan([...anchorCandidates, ...assetCandidates])
  const orderedReferences: OrderedVideoReference[] = plan.map((item) => ({
    role: item.role,
    ordinal: item.ordinal,
    mediaType: item.mediaType,
    sourceType: item.sourceType,
    label: item.label,
    usage: item.usage,
    ...(item.assetId ? { assetId: item.assetId } : {}),
    ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
  }))
  assertVideoReferencesHaveKeyframe(orderedReferences)
  assertVideoReferenceOrder(orderedReferences)

  // Omni-reference parity: Ark models use content[] multi-modal references +
  // the 参考素材使用说明 suffix; non-Ark models degrade to single main image.
  const referenceMode = supportsShotGroupMultiReferenceModes(resolvedModel)
    ? 'ark_content_multireference'
    : 'composite_image_mvp'
  const promptSuffix = referenceMode === 'ark_content_multireference'
    ? buildRemakeReferencePromptSuffix(orderedReferences)
    : ''
  const promptText = promptSuffix
    ? `${prompt.integratedGenerationPrompt}\n\n${promptSuffix}`
    : prompt.integratedGenerationPrompt

  const finalDuration = Number(capabilityOptions.duration || defaultDuration)

  const snapshot = videoInputSnapshotSchema.parse({
    projectId: input.projectId,
    remakeProjectId: current.remakeProjectId,
    shotId: current.shotId,
    stableKey: current.stableKey,
    sourceRevision: current.sourceRevision,
    shotRevision: current.revision,
    shotRevisionId: current.revisionId,
    promptVersionId: prompt.id,
    promptText,
    model: { id: resolvedModel },
    options: capabilityOptions,
    orderedReferences,
    referenceMode,
    durationSeconds: finalDuration,
  })
  return buildRemakeVideoTaskDescriptor({
    projectId: input.projectId,
    operationKey: input.operationKey,
    inputSnapshot: snapshot,
  })
}

export async function assertVideoSubmissionCurrent(
  snapshot: VideoInputSnapshot,
  client: Client = prisma,
) {
  const parsed = videoInputSnapshotSchema.parse(snapshot)
  const current = await getCurrentShot(client, parsed)
  if (
    current.remakeProjectId !== parsed.remakeProjectId ||
    current.revisionId !== parsed.shotRevisionId ||
    current.revision !== parsed.shotRevision ||
    current.sourceRevision !== parsed.sourceRevision
  ) {
    throw new Error('REMAKE_VIDEO_INPUT_STALE')
  }
  // Verify referenced keyframes are still adopted (D-17 currentness check)
  const slotFromRole = (role: string): 'start' | 'middle' | 'end' | null => {
    if (role === 'start_keyframe') return 'start'
    if (role === 'middle_keyframe') return 'middle'
    if (role === 'end_keyframe') return 'end'
    return null
  }
  for (const ref of parsed.orderedReferences) {
    const slot = slotFromRole(ref.role)
    if (!slot) continue
    const track = await client.remakeKeyframeTrack.findUnique({
      where: { shotRevisionId_slot: { shotRevisionId: parsed.shotRevisionId, slot } },
      include: { adoptedCandidate: { include: { outputVersion: true } } },
    })
    if (track?.adoptedCandidate?.outputVersion?.mediaId !== (ref.mediaUrl ?? ref.mediaId)) {
      throw new Error('REMAKE_VIDEO_KEYFRAME_INPUT_STALE')
    }
  }
}

export async function resolveVideoReferenceStorageKeys(snapshot: VideoInputSnapshot) {
  videoInputSnapshotSchema.parse(snapshot)
  const refs = await Promise.all(
    snapshot.orderedReferences.map(async (ref) => {
      // Assets without a MediaObject freeze a raw storage key / URL.
      if (!ref.mediaId && ref.mediaUrl) {
        const signedUrl = keyToSignedUrl(ref.mediaUrl, 3600)
        if (!signedUrl) throw new Error('REMAKE_VIDEO_REFERENCE_UNAVAILABLE')
        return { ...ref, signedUrl }
      }
      const media = await resolveMediaRef(ref.mediaId, ref.mediaUrl ?? null)
      if (media?.storageKey) {
        return { ...ref, signedUrl: getSignedUrl(media.storageKey, 3600) }
      }
      if (ref.mediaUrl) {
        const signedUrl = keyToSignedUrl(ref.mediaUrl, 3600)
        if (signedUrl) return { ...ref, signedUrl }
      }
      throw new Error('REMAKE_VIDEO_REFERENCE_UNAVAILABLE')
    }),
  )
  return refs
}

async function ensureVideoTrack(
  client: Client,
  params: { shotRevisionId: string },
) {
  const existing = await client.remakeVideoTrack.findUnique({
    where: { shotRevisionId: params.shotRevisionId },
  })
  if (existing) return existing
  return await client.remakeVideoTrack.create({
    data: { shotRevisionId: params.shotRevisionId },
  })
}

export async function appendVideoGenerationBatch(input: {
  taskId: string
  operationKey: string
  inputSnapshot: VideoInputSnapshot
  inputFingerprint: string
  mediaId: string
}) {
  const snapshot = videoInputSnapshotSchema.parse(input.inputSnapshot)
  if (input.inputFingerprint !== videoInputFingerprint(snapshot)) {
    throw new Error('REMAKE_VIDEO_FINGERPRINT_INVALID')
  }
  return await prisma.$transaction(async (tx) => {
    await assertVideoSubmissionCurrent(snapshot, tx as Client)

    const track = await ensureVideoTrack(tx as Client, {
      shotRevisionId: snapshot.shotRevisionId,
    })

    const existing = await tx.remakeVideoBatch.findUnique({
      where: {
        trackId_operationKey: { trackId: track.id, operationKey: input.operationKey },
      },
      include: { versions: { orderBy: { ordinal: 'asc' }, select: { id: true } } },
    })
    if (existing) {
      return { batchId: existing.id, versionIds: existing.versions.map((v) => v.id) }
    }

    const batch = await tx.remakeVideoBatch.create({
      data: {
        trackId: track.id,
        promptVersionId: snapshot.promptVersionId,
        taskId: input.taskId,
        operationKey: input.operationKey,
        inputFingerprint: input.inputFingerprint,
        inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
        modelId: snapshot.model.id,
        modelOptions: JSON.parse(JSON.stringify(snapshot.options)),
        orderedReferences: JSON.parse(JSON.stringify(snapshot.orderedReferences)),
        versions: {
          create: {
            ordinal: 1,
            outputVersion: {
              create: {
                shotId: snapshot.shotId,
                revisionId: snapshot.shotRevisionId,
                mediaId: input.mediaId,
                kind: 'video_candidate',
                fingerprint: `${input.operationKey}:${input.inputFingerprint}:1`,
                taskId: input.taskId,
                inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
                status: 'completed',
              },
            },
          },
        },
      },
    })
    const versions = await tx.remakeVideoVersion.findMany({
      where: { batchId: batch.id },
      orderBy: { ordinal: 'asc' },
      select: { id: true },
    })
    await tx.remakeProvenanceRecord.create({
      data: {
        shotId: snapshot.shotId,
        videoBatchId: batch.id,
        schema: 'remake-video-generation@1',
        executor: 'video-worker',
        payload: JSON.stringify({
          inputFingerprint: input.inputFingerprint,
          model: snapshot.model.id,
          durationSeconds: snapshot.durationSeconds,
          referenceCount: snapshot.orderedReferences.length,
        }),
      },
    })
    return { batchId: batch.id, versionIds: versions.map((v) => v.id) }
  })
}

export async function getVideoTrackDetail(input: {
  projectId: string
  userId: string
  trackId: string
}) {
  const track = await prisma.remakeVideoTrack.findFirst({
    where: {
      id: input.trackId,
      shotRevision: {
        shot: {
          remakeProject: {
            projectId: input.projectId,
            project: { userId: input.userId },
          },
        },
      },
    },
    include: {
      adoptedVersion: true,
      batches: {
        orderBy: { createdAt: 'desc' },
        include: {
          versions: {
            orderBy: { ordinal: 'asc' },
            include: { outputVersion: true },
          },
        },
      },
      adoptionEvents: { orderBy: { createdAt: 'desc' } },
      shotRevision: {
        include: { shot: { select: { id: true, currentRevision: true } } },
      },
    },
  })
  if (!track) return null
  return {
    track: {
      id: track.id,
      adoptedVersionId: track.adoptedVersionId,
      shotId: track.shotRevision.shot.id,
      revision: track.shotRevision.revision,
      isCurrent: track.shotRevision.shot.currentRevision === track.shotRevision.revision,
    },
    history: track.batches.map((batch) => ({
      id: batch.id,
      taskId: batch.taskId,
      operationKey: batch.operationKey,
      modelId: batch.modelId,
      options: batch.modelOptions,
      orderedReferences: batch.orderedReferences,
      createdAt: batch.createdAt,
      versions: batch.versions.map((version) => ({
        id: version.id,
        ordinal: version.ordinal,
        outputVersionId: version.outputVersionId,
        mediaId: version.outputVersion.mediaId,
        status: version.outputVersion.status,
        invalidated: Boolean(version.outputVersion.invalidatedAt),
        note: version.note ?? null,
      })),
    })),
    adoptionEvents: track.adoptionEvents.map((event) => ({
      id: event.id,
      previousVersionId: event.previousVersionId,
      nextVersionId: event.nextVersionId,
      createdAt: event.createdAt,
    })),
  }
}

export async function setVideoReviewNote(input: {
  projectId: string
  userId: string
  versionId: string
  note: string
}) {
  return await prisma.$transaction(async (tx) => {
    const version = await tx.remakeVideoVersion.findFirst({
      where: {
        id: input.versionId,
        batch: {
          track: {
            shotRevision: {
              shot: {
                remakeProject: {
                  projectId: input.projectId,
                  project: { userId: input.userId },
                },
              },
            },
          },
        },
      },
    })
    if (!version) throw new Error('REMAKE_VIDEO_VERSION_NOT_FOUND')
    const updated = await tx.remakeVideoVersion.update({
      where: { id: version.id },
      data: { note: input.note.slice(0, 2000), reviewerId: input.userId },
    })
    return { id: updated.id, note: updated.note }
  })
}

export async function adoptVideoVersion(input: {
  projectId: string
  userId: string
  trackId: string
  versionId: string
  confirmReplace?: boolean
}) {
  return await prisma.$transaction(async (tx) => {
    const track = await tx.remakeVideoTrack.findFirst({
      where: {
        id: input.trackId,
        shotRevision: {
          shot: {
            remakeProject: {
              projectId: input.projectId,
              project: { userId: input.userId },
            },
          },
        },
      },
      include: { shotRevision: { include: { shot: true } }, adoptedVersion: true },
    })
    if (!track) throw new Error('REMAKE_VIDEO_TRACK_NOT_FOUND')
    if (
      track.shotRevision &&
      (track.shotRevision.shot.currentRevision !== track.shotRevision.revision ||
        track.shotRevision.lifecycleState !== 'active')
    ) {
      throw new Error('REMAKE_VIDEO_INPUT_STALE')
    }

    // D-15: replacing existing adoption requires explicit confirmation
    if (track.adoptedVersionId && track.adoptedVersionId !== input.versionId && !input.confirmReplace) {
      throw new Error('REMAKE_VIDEO_REPLACE_CONFIRM_REQUIRED')
    }

    const version = await tx.remakeVideoVersion.findFirst({
      where: {
        id: input.versionId,
        batch: { trackId: track.id },
        outputVersion: { invalidatedAt: null, status: 'completed' },
      },
    })
    if (!version) throw new Error('REMAKE_VIDEO_VERSION_NOT_FOUND')

    // No-op if already adopted
    if (track.adoptedVersionId === version.id) {
      return { id: track.id, adoptedVersionId: track.adoptedVersionId }
    }

    const previousId = track.adoptedVersionId
    const updated = await tx.remakeVideoTrack.update({
      where: { id: track.id },
      data: { adoptedVersionId: version.id },
    })
    await tx.remakeVideoAdoptionEvent.create({
      data: {
        trackId: track.id,
        previousVersionId: previousId,
        nextVersionId: version.id,
        reviewerId: input.userId,
      },
    })
    return { id: updated.id, adoptedVersionId: updated.adoptedVersionId }
  })
}

export async function reconfirmVideoVersion(input: {
  projectId: string
  userId: string
  trackId: string
  versionId: string
}) {
  return await prisma.$transaction(async (tx) => {
    const track = await tx.remakeVideoTrack.findFirst({
      where: {
        id: input.trackId,
        shotRevision: {
          shot: {
            remakeProject: {
              projectId: input.projectId,
              project: { userId: input.userId },
            },
          },
        },
      },
      include: { adoptedVersion: true },
    })
    if (!track) throw new Error('REMAKE_VIDEO_TRACK_NOT_FOUND')

    // Only the currently adopted version can be reconfirmed (D-19)
    if (track.adoptedVersionId !== input.versionId) {
      throw new Error('REMAKE_VIDEO_RECONFIRM_NOT_ADOPTED')
    }

    const version = await tx.remakeVideoVersion.findFirst({
      where: { id: input.versionId, batch: { trackId: track.id } },
      include: { outputVersion: true },
    })
    if (!version) throw new Error('REMAKE_VIDEO_VERSION_NOT_FOUND')

    // Clear invalidation on this specific version (idempotent)
    await tx.remakeInvalidation.updateMany({
      where: {
        videoVersionId: version.id,
        status: 'needs_review',
      },
      data: { status: 'reconfirmed' },
    })

    // If the output version was marked invalidated, clear it
    if (version.outputVersion.invalidatedAt) {
      await tx.remakeOutputVersion.update({
        where: { id: version.outputVersionId },
        data: { invalidatedAt: null, status: 'completed' },
      })
    }

    // Record reconfirmation event (append-only history)
    await tx.remakeVideoAdoptionEvent.create({
      data: {
        trackId: track.id,
        previousVersionId: version.id,
        nextVersionId: version.id,
        reviewerId: input.userId,
      },
    })

    return { id: track.id, adoptedVersionId: track.adoptedVersionId, reconfirmed: true }
  })
}

export { deriveDefaultVideoDuration }
