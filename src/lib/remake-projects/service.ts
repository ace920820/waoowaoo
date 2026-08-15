import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { isArtStyleValue } from '@/lib/constants'
import { serializeStoryboardMoodPresets, DEFAULT_STORYBOARD_MOOD_PRESETS } from '@/lib/storyboard-mood-presets'
import { evaluateSceneDetectReviewGate } from './scenedetect/review-gate'
import { invalidateKeyframeOutputsForRevision } from './keyframes/invalidation'

type Row = Record<string, unknown>
type PromptSlot = 'start' | 'middle' | 'end'

function parseObject(value: unknown): Row {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Row
  try { return JSON.parse(String(value)) as Row } catch { return {} }
}

function mediaUrl(projectId: string, mediaId: unknown): string | null {
  return typeof mediaId === 'string' && mediaId.trim()
    ? `/api/remake-projects/${encodeURIComponent(projectId)}/scenedetect/media/${encodeURIComponent(mediaId)}`
    : null
}

function promptSlotFromCreatedEvent(task: Row): PromptSlot | null {
  if (task.type !== TASK_TYPE.REMAKE_IMAGE_PROMPT_ANALYZE) return null
  const events = Array.isArray(task.events) ? task.events : []
  const payload = parseObject(parseObject(events[0]).payload)
  const slot = payload.slot
  return slot === 'start' || slot === 'middle' || slot === 'end' ? slot : null
}

type RemakeClient = {
  project: {
    findFirst: (args: unknown) => Promise<Row | null>
    findUnique: (args: unknown) => Promise<Row | null>
    create: (args: unknown) => Promise<Row>
  }
  userPreference: { findUnique: (args: unknown) => Promise<Row | null> }
  novelPromotionProject: {
    create: (args: unknown) => Promise<Row>
    findUnique: (args: unknown) => Promise<Row | null>
    findFirst: (args: unknown) => Promise<Row | null>
  }
  remakeProject: { create: (args: unknown) => Promise<Row> }
  remakeShot: { findUnique: (args: unknown) => Promise<Row | null>; update: (args: unknown) => Promise<Row> }
  remakeShotRevision: { create: (args: unknown) => Promise<Row> }
  remakeInvalidation: { createMany: (args: unknown) => Promise<Row> }
  task: { create: (args: unknown) => Promise<Row>; findMany: (args: unknown) => Promise<Row[]> }
}

function remakeClient(): RemakeClient {
  return prisma as unknown as RemakeClient
}

type TransactionClient = RemakeClient & {
  $transaction: <T>(callback: (tx: RemakeClient) => Promise<T>) => Promise<T>
}

export async function createRemakeProject(input: {
  userId: string
  name: string
  description: string | null
  creationRequestId: string
}): Promise<{ project: Row; created: boolean }> {
  const transactionClient = prisma as unknown as TransactionClient
  return transactionClient.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { userId: input.userId, remakeProject: { creationRequestId: input.creationRequestId } },
      include: { remakeProject: true },
    })
    if (existing) return { project: existing, created: false }

    const project = await tx.project.create({
      data: { name: input.name, description: input.description, userId: input.userId, type: 'remake' },
    })
    const remakeProject = await tx.remakeProject.create({
        data: { projectId: String(project.id), creationRequestId: input.creationRequestId, importStatus: 'not_imported' },
    })
    // Create a NovelPromotionProject container to host project-scoped assets for the remake project.
    // This reuses the existing asset CRUD, generation, and media pipeline without duplicating code.
    const userPreference = await tx.userPreference.findUnique({
      where: { userId: input.userId },
    })
    const prefRow = userPreference as Row | null
    const prefArtStyle = prefRow && typeof (prefRow as Record<string, unknown>).artStyle === 'string'
      ? (prefRow as Record<string, unknown>).artStyle as string
      : 'american-comic'
    await tx.novelPromotionProject.create({
      data: {
        projectId: String(project.id),
        ...(prefRow ? {
          analysisModel: (prefRow as Record<string, unknown>).analysisModel as string | undefined,
          characterModel: (prefRow as Record<string, unknown>).characterModel as string | undefined,
          locationModel: (prefRow as Record<string, unknown>).locationModel as string | undefined,
          storyboardModel: (prefRow as Record<string, unknown>).storyboardModel as string | undefined,
          editModel: (prefRow as Record<string, unknown>).editModel as string | undefined,
          videoModel: (prefRow as Record<string, unknown>).videoModel as string | undefined,
          audioModel: (prefRow as Record<string, unknown>).audioModel as string | undefined,
          videoRatio: (prefRow as Record<string, unknown>).videoRatio as string | undefined,
          artStyle: isArtStyleValue(prefArtStyle) ? prefArtStyle : 'american-comic',
          ttsRate: (prefRow as Record<string, unknown>).ttsRate as string | undefined,
        } : {
          artStyle: 'american-comic',
        }),
        storyboardMoodPresets: serializeStoryboardMoodPresets(DEFAULT_STORYBOARD_MOOD_PRESETS),
      },
    })
    await tx.task.create({
      data: {
        userId: input.userId,
        projectId: String(project.id),
        type: TASK_TYPE.REMAKE_PROJECT_INITIALIZE,
        targetType: 'remake_project',
        targetId: String(remakeProject.id),
        status: 'queued',
        payload: { meta: { locale: 'zh' } },
      },
    })
    return { project, created: true }
  })
}

export async function getRemakeProjectSnapshot(input: { projectId: string; userId: string }) {
  const client = remakeClient()
  const project = await client.project.findUnique({
    where: { id: input.projectId },
    include: {
      novelPromotionData: true,
      remakeProject: {
        include: {
          currentSource: true,
          units: {
            include: {
              members: {
                include: { unit: false },
              },
              tracks: {
                include: {
                  batches: {
                    include: {
                      versions: { include: { outputVersion: true }, orderBy: { ordinal: 'asc' } },
                    },
                    orderBy: { createdAt: 'desc' },
                  },
                  adoptionEvents: { orderBy: { createdAt: 'desc' } },
                  invalidations: true,
                },
              },
              actionSheets: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          shots: {
            include: {
              outputs: { include: { invalidations: true, provenanceRecords: true } },
              revisions: {
                include: {
                  keyframeTracks: {
                    include: {
                      batches: { include: { candidates: { include: { outputVersion: true } } } },
                      adoptionEvents: true,
                      invalidations: true,
                    },
                  },
                  videoTracks: {
                    include: {
                      batches: { include: { versions: { include: { outputVersion: true } } } },
                      adoptionEvents: true,
                      invalidations: true,
                    },
                  },
                },
              },
              provenance: true,
              promptTracks: { include: { versions: { include: { invalidations: true }, orderBy: { versionNumber: 'desc' } } } },
            },
            orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  })
  if (!project) return null
  const projectRow = project as Row
  if (projectRow.userId !== input.userId || projectRow.type !== 'remake') return null
  const remake = projectRow.remakeProject as Row | null | undefined
  const tasks = await client.task.findMany({
    where: { projectId: input.projectId, userId: input.userId },
    select: {
      id: true, type: true, targetType: true, targetId: true, status: true, errorCode: true, errorMessage: true, createdAt: true, updatedAt: true,
      events: { where: { eventType: 'task.created' }, orderBy: { id: 'asc' }, take: 1, select: { payload: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return {
    project: (() => {
      // Also load the NovelPromotionProject asset container so config (artStyle, models, etc.)
      // shows up correctly in the project config UI for remake projects.
      const novelPromo = (projectRow as Row).novelPromotionData as Row | null | undefined
      const baseProject = {
        id: projectRow.id,
        name: projectRow.name,
        description: projectRow.description,
        type: projectRow.type,
      }
      if (novelPromo) {
        return { ...baseProject, novelPromotionData: novelPromo }
      }
      return baseProject
    })(),
    source: (() => {
      const current = remake?.currentSource as Row | null | undefined
      return {
        status: current?.status ?? remake?.importStatus ?? 'not_imported',
        // Older sources predate mediaId. Their database id remains a safe opaque fallback.
        mediaId: current?.mediaId ?? current?.id ?? null,
        mediaUrl: mediaUrl(input.projectId, current?.mediaId ?? current?.id),
        ...(current ? {
          sourceRevision: current.sourceRevision ?? null,
          metadata: current.probeMetadata ? (typeof current.probeMetadata === 'string' ? JSON.parse(current.probeMetadata) : current.probeMetadata) : null,
        } : {}),
      }
    })(),
    shots: ((remake?.shots as Row[] | undefined) ?? []).map((shot) => {
      const revisions = ((shot.revisions as Row[] | undefined) ?? [])
      const current = revisions.find((revision) => Number(revision.revision) === Number(shot.currentRevision)) ?? revisions.find((revision) => revision.lifecycleState === 'active')
      const payload = parseObject(current?.payload)
      const refs = parseObject(current?.keyframeMediaRefs)
      const tracks = ((current?.keyframeTracks as Row[] | undefined) ?? [])
      const actionSheets = ((shot.outputs as Row[] | undefined) ?? []).filter((output) => output.kind === 'action_sheet')
      const review = evaluateSceneDetectReviewGate({
        status: payload.status === 'keep' || payload.status === 'discard' ? payload.status : 'pending', needsReview: Boolean(shot.needsReview),
        revisionState: typeof current?.lifecycleState === 'string' ? current.lifecycleState : null,
        sourceRevision: typeof current?.sourceRevision === 'number' ? current.sourceRevision : null,
        currentSourceRevision: typeof (remake?.currentSource as Row | undefined)?.sourceRevision === 'number' ? (remake?.currentSource as Row).sourceRevision as number : null,
        keyframeMediaRefs: refs,
      })
      return {
      id: shot.id,
      stableKey: shot.stableKey,
      sequence: shot.sequence,
      reviewStatus: shot.reviewStatus,
      needsReview: shot.needsReview,
      currentRevision: shot.currentRevision ?? null,
      version: shot.version ?? 0,
      semantics: {
        shotType: shot.shotType ?? null,
        cameraMove: shot.cameraMove ?? null,
        description: shot.description ?? null,
        moodPresetId: shot.moodPresetId ?? null,
        customMood: shot.customMood ?? null,
        sceneTag: shot.sceneTag ?? null,
        characterTags: shot.characterTags
          ? (() => {
              try { return JSON.parse(String(shot.characterTags)) } catch { return [] }
            })()
          : [],
        sceneAssetId: shot.sceneAssetId ?? null,
        characterAssetIds: shot.characterAssetIds
          ? (() => {
              try { return JSON.parse(String(shot.characterAssetIds)) } catch { return [] }
            })()
          : [],
        propAssetIds: shot.propAssetIds
          ? (() => {
              try { return JSON.parse(String(shot.propAssetIds)) } catch { return [] }
            })()
          : [],
      },
      review,
      timeRange: {
        start: payload.startTimecode ?? payload.startTime ?? null,
        end: payload.endTimecode ?? payload.endTime ?? null,
      },
      keyframes: Object.fromEntries(['start', 'middle', 'end'].map((slot) => {
        const mediaId = refs[slot === 'start' ? 'first' : slot === 'end' ? 'last' : 'middle'] ?? null
        const legacyField = slot === 'start' ? 'firstFrameUrl' : slot === 'end' ? 'lastFrameUrl' : 'middleFrameUrl'
        // Pre-media-ID analyses stored server-generated signed frame URLs in their payload.
        // Keep them readable while new analyses use the opaque media route above.
        const legacyUrl = typeof payload[legacyField] === 'string' && payload[legacyField] ? payload[legacyField] : null
        return [slot, { mediaId, mediaUrl: mediaUrl(input.projectId, mediaId) ?? legacyUrl }]
      })),
      keyframeGeneration: {
        tracks: [...tracks]
          .sort((left, right) => {
            const order = ['start', 'middle', 'end']
            return order.indexOf(String(left.slot)) - order.indexOf(String(right.slot))
          })
          .map((track) => ({
          id: track.id,
          slot: track.slot,
          selectedForGeneration: Boolean(track.selectedForGeneration),
          adoptedCandidateId: track.adoptedCandidateId ?? null,
          eligible: !((track.invalidations as Row[] | undefined) ?? []).length,
          batches: ((track.batches as Row[] | undefined) ?? []).map((batch) => ({
            id: batch.id,
            operationKey: batch.operationKey,
            inputFingerprint: batch.inputFingerprint,
            createdAt: batch.createdAt,
            candidates: ((batch.candidates as Row[] | undefined) ?? []).map((candidate) => ({
              id: candidate.id,
              ordinal: candidate.ordinal,
              outputVersionId: candidate.outputVersionId,
              mediaId: (candidate.outputVersion as Row | undefined)?.mediaId ?? null,
              mediaUrl: mediaUrl(input.projectId, (candidate.outputVersion as Row | undefined)?.mediaId),
              status: (candidate.outputVersion as Row | undefined)?.status ?? 'pending',
              eligible: !Boolean((candidate.outputVersion as Row | undefined)?.invalidatedAt),
            })),
          })),
          adoptionEvents: track.adoptionEvents ?? [],
        })),
        actionSheet: (() => {
          const sheet = actionSheets.find((output) => output.revisionId === current?.id && !output.invalidatedAt)
          if (sheet) return { status: 'current' as const, id: sheet.id, mediaId: sheet.mediaId ?? null, fingerprint: sheet.fingerprint }
          // 有关键帧即可生成动作表，不需等状态审批通过
          const hasKeyframes = refs.first && refs.middle && refs.last
          return { status: hasKeyframes ? 'missing' as const : 'waiting' as const, id: null, mediaId: null, fingerprint: null }
        })(),
        history: actionSheets.map((output) => ({ id: output.id, revisionId: output.revisionId, mediaId: output.mediaId ?? null, fingerprint: output.fingerprint, invalidated: Boolean(output.invalidatedAt) })),
      },
      videoGeneration: (() => {
        const videoTracks = ((current?.videoTracks as Row[] | undefined) ?? [])
        const track = videoTracks[0]
        if (!track) {
          return { track: null }
        }
        const batches = ((track.batches as Row[] | undefined) ?? []).map((batch) => ({
          id: batch.id,
          operationKey: batch.operationKey,
          versions: ((batch.versions as Row[] | undefined) ?? []).map((version) => {
            const outputVersion = (version.outputVersion as Row | undefined)
            return {
              id: version.id,
              ordinal: version.ordinal,
              mediaUrl: mediaUrl(input.projectId, outputVersion?.mediaId),
              status: outputVersion?.status ?? 'pending',
              invalidated: Boolean(outputVersion?.invalidatedAt),
              note: version.note ?? null,
            }
          }),
        }))
        const hasInvalidated = batches.some((batch) =>
          batch.versions.some((version) => version.invalidated),
        )
        return {
          track: {
            id: track.id,
            adoptedVersionId: track.adoptedVersionId ?? null,
            hasInvalidated,
            batches,
          },
        }
      })(),
      promptTracks: ((shot.promptTracks as Row[] | undefined) ?? []).map((track) => {
        const versions = (track.versions as Row[] | undefined) ?? []
        const latest = versions[0]
        const adopted = versions.find((version) => version.id === track.adoptedVersionId)
        const hasOpenInvalidation = (version: Row | undefined) =>
          ((version?.invalidations as Row[] | undefined) ?? []).some((invalidation) => invalidation.status === 'needs_review')
        return {
          id: track.id,
          targetKey: track.targetKey,
          latestVersion: latest ? { id: latest.id, versionNumber: latest.versionNumber, reviewStatus: latest.invalidatedAt || hasOpenInvalidation(latest) ? 'needs_review' : latest.status } : null,
          adoptedVersion: adopted
            ? {
                id: adopted.id,
                versionNumber: adopted.versionNumber,
                reviewStatus: adopted.invalidatedAt || hasOpenInvalidation(adopted) ? 'needs_review' : adopted.status,
                coreText: adopted.integratedGenerationPrompt ?? null,
                negativeConstraints: Array.isArray(adopted.negativeConstraints)
                  ? adopted.negativeConstraints.filter((item): item is string => typeof item === 'string')
                  : [],
              }
            : null,
          // Review state belongs to the version currently adopted by this track.
          // Historical versions may remain invalidated after a re-analysis; they
          // must not keep a newly saved-and-adopted version in "needs review".
          needsReview: Boolean(adopted && (adopted.invalidatedAt || hasOpenInvalidation(adopted))),
        }
      }),
      revisions: revisions.map((revision) => ({ id: revision.id, revision: revision.revision, sourceRevision: revision.sourceRevision ?? null, lifecycleState: revision.lifecycleState, changeReason: revision.changeReason, payload: revision.payload ?? null, keyframeMediaRefs: revision.keyframeMediaRefs ?? null })),
      provenance: ((shot.provenance as Row[] | undefined) ?? []).map((record) => ({ id: record.id, schema: record.schema, executor: record.executor, capability: record.capability, payload: record.payload ?? null })),
    }}).filter((shot) => {
      const sourceRevision = (remake?.currentSource as Row | null | undefined)?.sourceRevision
      if (sourceRevision == null) return true
      const active = (shot.revisions as Array<{ sourceRevision?: number | null; lifecycleState?: string }> | undefined)
        ?.find((revision) => revision.lifecycleState === 'active' && Number(revision.sourceRevision) === Number(sourceRevision))
      return Boolean(active)
    }),
    units: ((remake?.units as Row[] | undefined) ?? []).map((unit) => {
      const unitMembers = (unit.members as Row[] | undefined) ?? []
      const unitTracks = (unit.tracks as Row[] | undefined) ?? []
      const track = unitTracks[0]
      const batches = ((track?.batches as Row[] | undefined) ?? []).map((batch) => ({
        id: batch.id,
        operationKey: batch.operationKey,
        modelId: batch.modelId ?? null,
        createdAt: batch.createdAt,
        versions: ((batch.versions as Row[] | undefined) ?? []).map((version) => {
          const outputVersion = version.outputVersion as Row | undefined
          return {
            id: version.id,
            ordinal: version.ordinal,
            mediaUrl: mediaUrl(input.projectId, outputVersion?.mediaId),
            status: outputVersion?.status ?? 'pending',
            invalidated: Boolean(outputVersion?.invalidatedAt),
            note: version.note ?? null,
          }
        }),
      }))
      const hasInvalidated = batches.some((batch) =>
        batch.versions.some((version) => version.invalidated),
      )
      return {
        id: unit.id,
        userLabel: unit.userLabel ?? null,
        dissolvedAt: unit.dissolvedAt ?? null,
        dissolvedReason: unit.dissolvedReason ?? null,
        actionSheetGrid: (() => {
          const grid = parseObject(unit.actionSheetGrid)
          const cells = Array.isArray(grid.cells) ? grid.cells : []
          return {
            columns: typeof grid.columns === 'number' ? grid.columns : 3,
            cells: cells.map((cell: Row) => ({
              shotNumber: typeof cell.shotNumber === 'number' ? cell.shotNumber : 0,
              slot: cell.slot === 'start' || cell.slot === 'middle' || cell.slot === 'end'
                ? cell.slot
                : 'middle',
              mediaId: typeof cell.mediaId === 'string' ? cell.mediaId : null,
              mediaUrl: mediaUrl(input.projectId, typeof cell.mediaId === 'string' ? cell.mediaId : null),
            })),
          }
        })(),
        members: unitMembers
          .sort((left, right) => Number(left.ordinal) - Number(right.ordinal))
          .map((member) => {
            // Resolve the owning shot + its active revision for the member's
            // durationSeconds / sequence / label via the already-loaded shots.
            const revisionId = String(member.shotRevisionId)
            const owningShot = ((remake?.shots as Row[] | undefined) ?? []).find((shot) =>
              ((shot.revisions as Row[] | undefined) ?? []).some(
                (revision) => String(revision.id) === revisionId,
              ),
            )
            const owningRevision = ((owningShot?.revisions as Row[] | undefined) ?? []).find(
              (revision) => String(revision.id) === revisionId,
            )
            const payload = parseObject(owningRevision?.payload)
            const start = payload.startTimecode ?? payload.startTime ?? null
            const end = payload.endTimecode ?? payload.endTime ?? null
            const startSeconds = typeof start === 'number' ? start : null
            const endSeconds = typeof end === 'number' ? end : null
            const durationSeconds =
              startSeconds !== null && endSeconds !== null
                ? Math.max(0.1, endSeconds - startSeconds)
                : 3
            return {
              shotRevisionId: member.shotRevisionId,
              ordinal: Number(member.ordinal),
              keyframeSlot: typeof member.keyframeSlot === 'string' ? member.keyframeSlot : null,
              shotId: owningShot?.id ?? null,
              sequence: owningShot?.sequence ?? null,
              label: typeof owningShot?.sequence === 'number' ? `镜头${owningShot.sequence}` : null,
              durationSeconds,
            }
          }),
        track: track
          ? {
              id: track.id,
              adoptedVersionId: track.adoptedVersionId ?? null,
              hasInvalidated,
              batches,
            }
          : null,
        actionSheets: ((unit.actionSheets as Row[] | undefined) ?? []).map((sheet) => ({
          id: sheet.id,
          mediaId: sheet.mediaId ?? null,
          mediaUrl: mediaUrl(input.projectId, sheet.mediaId),
          fingerprint: sheet.fingerprint ?? null,
          status: sheet.status ?? 'pending',
        })),
      }
    }),
    tasks: (tasks as Row[]).map((task) => {
      const { events: _events, ...safeTask } = task
      return { ...safeTask, promptSlot: promptSlotFromCreatedEvent(task) }
    }),
  }
}


/**
 * Ensure the remake project has a NovelPromotionProject asset container.
 * For projects created before the asset library was added to remake mode,
 * this lazily creates the container on first asset access.
 */
export async function ensureRemakeAssetContainer(input: { projectId: string; userId: string }): Promise<Row | null> {
  const client = remakeClient()
  const project = await client.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, userId: true, type: true },
  })
  if (!project) return null
  const projectRow = project as Row
  if (projectRow.userId !== input.userId || projectRow.type !== 'remake') return null

  const existing = await client.novelPromotionProject.findUnique({
    where: { projectId: input.projectId },
    select: { id: true, projectId: true },
  })
  if (existing) return existing as Row

  const userPreference = await client.userPreference.findUnique({
    where: { userId: input.userId },
  })
  const prefRow = userPreference as Row | null
  const prefArtStyle = prefRow && typeof (prefRow as Record<string, unknown>).artStyle === 'string'
    ? (prefRow as Record<string, unknown>).artStyle as string
    : 'american-comic'
  const created = await client.novelPromotionProject.create({
    data: {
      projectId: input.projectId,
      ...(prefRow ? {
        analysisModel: (prefRow as Record<string, unknown>).analysisModel as string | undefined,
        characterModel: (prefRow as Record<string, unknown>).characterModel as string | undefined,
        locationModel: (prefRow as Record<string, unknown>).locationModel as string | undefined,
        storyboardModel: (prefRow as Record<string, unknown>).storyboardModel as string | undefined,
        editModel: (prefRow as Record<string, unknown>).editModel as string | undefined,
        videoModel: (prefRow as Record<string, unknown>).videoModel as string | undefined,
        audioModel: (prefRow as Record<string, unknown>).audioModel as string | undefined,
        videoRatio: (prefRow as Record<string, unknown>).videoRatio as string | undefined,
        artStyle: isArtStyleValue(prefArtStyle) ? prefArtStyle : 'american-comic',
        ttsRate: (prefRow as Record<string, unknown>).ttsRate as string | undefined,
      } : {
        artStyle: 'american-comic',
      }),
      storyboardMoodPresets: serializeStoryboardMoodPresets(DEFAULT_STORYBOARD_MOOD_PRESETS),
    },
  })
  return created as Row
}

export async function createRemakeShotRevision(input: { shotId: string; changeReason: string; userId: string }) {
  const client = prisma as unknown as TransactionClient
  return client.$transaction(async (tx) => {
    const shot = await tx.remakeShot.findUnique({ where: { id: input.shotId }, include: { revisions: { orderBy: { revision: 'desc' }, take: 1 }, remakeProject: { select: { project: { select: { userId: true } } } } } })
    if (!shot) return null
    const shotRow = shot as Row
    const project = ((shotRow.remakeProject as Row | undefined)?.project as Row | undefined)
    if (project?.userId !== input.userId) return null
    const revisions = (shotRow.revisions as Row[] | undefined) ?? []
    const revision = await tx.remakeShotRevision.create({ data: { shotId: String(shotRow.id), revision: Number(revisions[0]?.revision ?? 0) + 1, changeReason: input.changeReason } })
    await tx.remakeShot.update({ where: { id: shotRow.id }, data: { currentRevision: revision.revision, reviewStatus: 'needs_review', needsReview: true } })
    await invalidateKeyframeOutputsForRevision({ tx: tx as unknown, shotId: String(shotRow.id), revisionId: String(revision.id), reason: input.changeReason })
    return { revision, reviewStatus: 'needs_review' as const }
  })
}
