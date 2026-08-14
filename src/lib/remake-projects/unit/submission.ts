import { prisma } from '@/lib/prisma'
import {
  getProjectModelConfig,
  getUserModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { getAdoptedPromptForGeneration } from '../prompt/service'
import { readAssetIdList, resolveShotAssetMedia } from '../semantics/asset-media'
import { collectUnitMemberKeyframeCandidates, type UnitMemberKeyframeCandidate } from './references'
import { dedupeUnitAssetCandidates } from './reference-plan'
import { buildUnitSubmissionPreview } from './preview'
import { buildVideoUnitTaskDescriptor } from './task-contract'
import { assertVideoUnitSubmissionCurrent } from './service'
import { videoUnitInputSnapshotSchema } from './contracts'
import { unitActionSheetFingerprint } from '../keyframes/action-sheet'
import { parseTimecodeSeconds } from './timecode'
import { deriveDefaultVideoDuration } from '../video/duration'
import {
  buildRemakeReferencePromptSuffix,
  type RemakeReferenceCandidate,
} from '../video/reference-plan'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
  type OrderedVideoReference,
} from '../video/contracts'
import { buildAssetReferenceCandidates, getVideoCapabilityDefinitions } from '../video/service'
import { supportsShotGroupMultiReferenceModes } from '@/lib/shot-group/video-config'
import type { CapabilityValue } from '@/lib/model-config-contract'

/**
 * D-02/D-04/D-05/D-21/D-22/W5 unit submission service (Plan 09.1-04).
 *
 * `buildVideoUnitSubmission` is the enforcement point for the merged unit:
 *   - D-02: purely manual — the server only validates, it never suggests
 *     merge targets (D-03 已取消 — no sceneTag/characterTags homogeneity
 *     judgment anywhere in the submission path).
 *   - D-21: EVERY member is gated (adopted keyframe / approved Video Prompt /
 *     legal params) and all missing items are aggregated into one
 *     `REMAKE_VIDEO_UNIT_MEMBER_MISSING:{ordinal}:{reason}` error before any
 *     provider work.
 *   - D-05: total member duration is normalized via deriveDefaultVideoDuration;
 *     a raw sum over the model max throws REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG with
 *     an explicit split hint instead of silently truncating.
 *   - D-16/D-22: the frozen snapshot is exactly `buildUnitSubmissionPreview`
 *     output (WYSIWYG) and the descriptor fingerprint changes when any member
 *     input changes.
 *   - W5: the merged action sheet enters the plan as a deterministic deferred
 *     entry (member ordinals + keyframe mediaIds, covered by
 *     unitActionSheetFingerprint) — nothing is rendered or persisted in this
 *     request path; the worker (Plan 09.1-05) renders+persists it, and the
 *     preview endpoint renders on demand without persisting.
 */

/** Deterministic marker for the deferred merged-sheet entry in the frozen plan
 * (W5). The worker replaces it with the persisted media ref after rendering. */
export const UNIT_ACTION_SHEET_DEFERRED_PREFIX = 'unit-action-sheet://deferred/'

/** Best-effort JSON parse of the shot-revision payload text column. */
function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** One side of a shot time range → seconds (Pitfall 1: no silent 3s fallback
 * when a parseable timecode exists). */
function timeRangeSideToSeconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return parseTimecodeSeconds(value)
  return null
}

/** Legal numeric time range for a member, or null when nothing is parseable
 * (D-21 PARAMS gate). Partial data falls back to the 3s convention: missing
 * end -> start + 3s, missing start -> 0. */
function memberTimeRangeSeconds(payload: unknown): { start: number; end: number } | null {
  const parsed = parseObject(payload)
  const start = timeRangeSideToSeconds(parsed.startTimecode ?? parsed.startTime ?? null)
  const end = timeRangeSideToSeconds(parsed.endTimecode ?? parsed.endTime ?? null)
  if (start === null && end === null) return null
  const resolvedStart = start ?? 0
  const resolvedEnd = end ?? resolvedStart + 3
  return { start: resolvedStart, end: Math.max(resolvedEnd, resolvedStart + 0.1) }
}

type CollectedMember = {
  shotRevisionId: string
  ordinal: number
  shotId: string
  durationSeconds: number
  adoptedPrompt: string
  promptVersionId: string
  timeRangeSeconds: { start: number; end: number }
  keyframe: UnitMemberKeyframeCandidate
}

export async function buildVideoUnitSubmission(input: {
  projectId: string
  userId: string
  unitId: string
  operationKey: string
  model?: string
  options?: Record<string, unknown>
}) {
  // Project ownership (T-091-14: every unit service call is project-scoped).
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId, type: 'remake' },
    select: { id: true },
  })
  if (!project) throw new Error('REMAKE_VIDEO_UNIT_PROJECT_NOT_FOUND')

  const unit = await prisma.remakeVideoUnit.findFirst({
    where: {
      id: input.unitId,
      remakeProject: { projectId: input.projectId, project: { userId: input.userId } },
    },
    include: {
      members: { orderBy: { ordinal: 'asc' } },
      tracks: { select: { id: true } },
    },
  })
  if (!unit) throw new Error('REMAKE_VIDEO_UNIT_NOT_FOUND')

  const revisionIds = unit.members.map((member) => member.shotRevisionId)
  const revisions = await prisma.remakeShotRevision.findMany({
    where: { id: { in: revisionIds } },
    include: {
      shot: {
        select: {
          id: true,
          currentRevision: true,
          remakeProjectId: true,
          sceneAssetId: true,
          characterAssetIds: true,
          propAssetIds: true,
        },
      },
    },
  })
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]))

  // D-21: per-member gate — collect every missing item into ONE aggregate error.
  const missing: string[] = []
  const collected: CollectedMember[] = []
  for (const member of unit.members) {
    const revision = revisionById.get(member.shotRevisionId)
    if (!revision) {
      missing.push(`${member.ordinal}:PARAMS`)
      continue
    }

    let keyframe: UnitMemberKeyframeCandidate | undefined
    try {
      const [candidate] = await collectUnitMemberKeyframeCandidates({
        members: [{ shotRevisionId: member.shotRevisionId, ordinal: member.ordinal }],
      })
      keyframe = candidate
    } catch {
      // falls through to the aggregate gate below
    }
    if (!keyframe) {
      missing.push(`${member.ordinal}:KEYFRAME`)
      continue
    }

    const prompt = await getAdoptedPromptForGeneration({
      projectId: input.projectId,
      shotId: revision.shot.id,
      targetKey: 'video',
    })
    if (!prompt) {
      missing.push(`${member.ordinal}:PROMPT`)
      continue
    }

    const range = memberTimeRangeSeconds(revision.payload)
    if (!range) {
      missing.push(`${member.ordinal}:PARAMS`)
      continue
    }

    collected.push({
      shotRevisionId: member.shotRevisionId,
      ordinal: member.ordinal,
      shotId: revision.shot.id,
      durationSeconds: Math.max(0.1, range.end - range.start),
      adoptedPrompt: prompt.integratedGenerationPrompt,
      promptVersionId: prompt.id,
      timeRangeSeconds: range,
      keyframe,
    })
  }

  if (missing.length > 0) {
    throw new Error(`REMAKE_VIDEO_UNIT_MEMBER_MISSING:${missing.join(';')}`)
  }

  // Resolve model: explicit > project videoModel > user videoModel.
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

  const capabilityDefinitions = getVideoCapabilityDefinitions(resolvedModel)
  const rawSum = collected.reduce((acc, member) => acc + member.durationSeconds, 0)

  // D-05: the raw sum over the model max fails with an explicit split hint —
  // never silently truncate to the max (the user splits the unit instead).
  const durationDef = capabilityDefinitions.find((definition) => definition.field === 'duration')
  const durationOptions = durationDef?.options
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)
  const modelMax = durationOptions && durationOptions.length > 0
    ? durationOptions[durationOptions.length - 1]!
    : 15
  if (rawSum > modelMax) {
    const rounded = Math.round(rawSum * 10) / 10
    throw new Error(
      `REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG:${rounded}:${modelMax}` +
        ` — unit 总时长 ${rounded}s 超过模型上限 ${modelMax}s，请拆分为多个 unit 或移除部分成员`,
    )
  }

  const defaultDuration = deriveDefaultVideoDuration(rawSum, capabilityDefinitions)

  // Server-authoritative capability normalization (same as the single-shot path).
  const runtimeSelections: Record<string, CapabilityValue> = {
    ...Object.fromEntries(
      Object.entries(input.options || {}).map(([key, value]) => [key, value as CapabilityValue]),
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
  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.projectId,
    userId: input.userId,
    modelType: 'video',
    modelKey: resolvedModel,
    runtimeSelections,
  })
  const finalDuration = Number(capabilityOptions.duration || defaultDuration)

  // D-08: cross-member asset candidates (per member, same construction as the
  // single-shot path), deduped by (role, assetId) before the capped plan.
  const assetCandidates: RemakeReferenceCandidate[] = []
  await Promise.all(
    collected.map(async (member) => {
      const revision = revisionById.get(member.shotRevisionId)
      if (!revision) return
      const sceneAssetId = revision.shot.sceneAssetId ?? null
      const characterAssetIds = readAssetIdList(revision.shot.characterAssetIds)
      const propAssetIds = readAssetIdList(revision.shot.propAssetIds)
      const assetMedia = await resolveShotAssetMedia({
        projectId: input.projectId,
        sceneAssetId,
        characterAssetIds,
        propAssetIds,
      })
      assetCandidates.push(
        ...buildAssetReferenceCandidates({
          sceneAssetId,
          characterAssetIds,
          propAssetIds,
          includeLocationImage: true,
          includePropImages: true,
          includeCharacterImages: true,
          includeCharacterAudio: false,
          characters: assetMedia.characterById,
          locations: assetMedia.locationById,
        }),
      )
    }),
  )
  const dedupedAssets = dedupeUnitAssetCandidates(assetCandidates)

  // W5: the merged action sheet is a deterministic deferred entry — its source
  // list (member ordinals + adopted keyframe mediaIds) is frozen and covered by
  // unitActionSheetFingerprint; rendering + persisting is the worker's job
  // (Plan 09.1-05) and the preview endpoint renders on demand without persisting.
  const deferredSheetRef = {
    mediaUrl:
      `${UNIT_ACTION_SHEET_DEFERRED_PREFIX}` +
      unitActionSheetFingerprint({
        unitId: input.unitId,
        sources: collected.map((member) => ({
          ordinal: member.ordinal,
          mediaId: member.keyframe.mediaId ?? '',
        })),
      }),
  }

  // D-16: the frozen inputs are exactly the previewed inputs.
  const preview = buildUnitSubmissionPreview({
    members: collected.map((member) => ({
      ordinal: member.ordinal,
      durationSeconds: member.durationSeconds,
      adoptedPrompt: member.adoptedPrompt,
      keyframeMediaRef: {
        mediaId: member.keyframe.mediaId,
        mediaUrl: member.keyframe.mediaUrl,
      },
    })),
    actionSheetMediaRef: deferredSheetRef,
    assetCandidates: dedupedAssets,
    totalDurationSeconds: finalDuration,
    durationCapabilityDefinitions: capabilityDefinitions,
  })

  const orderedReferences: OrderedVideoReference[] = preview.orderedReferences.map((item) => ({
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

  // Omni-reference parity: Ark r2v models use content[] multi-modal references +
  // the 参考素材使用说明 suffix; non-Ark models degrade to composite_image_mvp.
  const referenceMode = supportsShotGroupMultiReferenceModes(resolvedModel)
    ? 'ark_content_multireference'
    : 'composite_image_mvp'
  const promptSuffix =
    referenceMode === 'ark_content_multireference'
      ? buildRemakeReferencePromptSuffix(orderedReferences)
      : ''
  const promptText = promptSuffix
    ? `${preview.promptText}\n\n${promptSuffix}`
    : preview.promptText

  const snapshot = videoUnitInputSnapshotSchema.parse({
    projectId: input.projectId,
    remakeProjectId: unit.remakeProjectId,
    unitId: input.unitId,
    members: collected.map((member) => ({
      shotRevisionId: member.shotRevisionId,
      ordinal: member.ordinal,
      selectedKeyframe: {
        slot: member.keyframe.slot,
        mediaId: member.keyframe.mediaId,
      },
      promptVersionId: member.promptVersionId,
      timeRangeSeconds: member.timeRangeSeconds,
    })),
    orderedReferences,
    model: { id: resolvedModel },
    options: capabilityOptions,
    referenceMode,
    durationSeconds: finalDuration,
    promptText,
  })

  // D-22 currentness re-verification at freeze time (T-091-16): the unit
  // exists, the member set is unchanged, revisions are active/current, and the
  // adopted keyframes are unchanged.
  await assertVideoUnitSubmissionCurrent(snapshot)

  return buildVideoUnitTaskDescriptor({
    projectId: input.projectId,
    operationKey: input.operationKey,
    inputSnapshot: snapshot,
  })
}
