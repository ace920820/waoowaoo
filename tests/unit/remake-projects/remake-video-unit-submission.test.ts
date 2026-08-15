import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemakeReferencePlanItem } from '@/lib/remake-projects/video/reference-plan'
import type { OrderedVideoReference } from '@/lib/remake-projects/video/contracts'
import { buildUnitSubmissionPreview } from '@/lib/remake-projects/unit/preview'
import { unitActionSheetFingerprint } from '@/lib/remake-projects/keyframes/action-sheet'
import { getAdoptedPromptForGeneration } from '@/lib/remake-projects/prompt/service'
import { resolveMediaRef } from '@/lib/media/service'

/**
 * Phase 09.1-04 unit submission service (D-02/D-04/D-05/D-21/D-22/W5):
 *  - Test 1: buildVideoUnitSubmission aggregates EVERY missing member input
 *    (adopted keyframe / approved Video Prompt / legal params) into a single
 *    REMAKE_VIDEO_UNIT_MEMBER_MISSING:{ordinal}:{reason} error (D-21) before
 *    any provider work.
 *  - Test 2: the frozen snapshot is byte-identical to buildUnitSubmissionPreview
 *    for the same inputs (WYSIWYG, D-16/D-22), the descriptor fingerprint
 *    changes when any member input changes, and the merged action sheet enters
 *    the plan as a deterministic deferred entry — the submission path never
 *    renders nor persists it (W5; the worker does in Plan 09.1-05).
 *  - Test 3: total member duration is normalized via deriveDefaultVideoDuration;
 *    a sum over the model max throws REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG (D-05).
 *  - Test 4: buildVideoGenerationSubmission rejects a shot that is already a
 *    unit member (D-04), and renderAndPersistUnitActionSheet (worker-invoked)
 *    persists the merged sheet with fingerprint dedup + source provenance (D-07).
 */

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: '33333333-3333-4333-8333-333333333333',
  userId: '55555555-5555-4555-8555-555555555555',
  shot1: '44444444-4444-4444-8444-444444444441',
  shot2: '44444444-4444-4444-8444-444444444442',
  shot3: '44444444-4444-4444-8444-444444444443',
  rev1: '55555555-5555-4555-8555-555555555551',
  rev2: '55555555-5555-4555-8555-555555555552',
  rev3: '55555555-5555-4555-8555-555555555553',
  kf1: 'a1111111-1111-4111-8111-111111111111',
  kf2: 'a2222222-2222-4222-8222-222222222222',
  kf3: 'a3333333-3333-4333-8333-333333333333',
  kf1b: 'a4444444-4444-4444-8444-444444444444',
  kf1e: 'a5555555-5555-4555-8555-555555555555',
  promptV1: '66666666-6666-4666-8666-666666666661',
  promptV2: '66666666-6666-4666-8666-666666666662',
  promptV3: '66666666-6666-4666-8666-666666666663',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Map a plan item to the strict ordered-reference shape the service freezes. */
function toOrderedRefs(plan: RemakeReferencePlanItem[]): OrderedVideoReference[] {
  return plan.map((item) => ({
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
}

const fixture = vi.hoisted(() => {
  const keyframeMediaBySlot = new Map<string, string>()
  const promptByShot = new Map<string, { id: string; integratedGenerationPrompt: string }>()
  return { keyframeMediaBySlot, promptByShot }
})

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: {
    findFirst: vi.fn(),
  },
  remakeVideoUnit: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  remakeVideoUnitMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  remakeShotRevision: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  remakeKeyframeTrack: {
    findUnique: vi.fn(),
  },
  remakeVideoUnitActionSheet: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  remakeShot: {
    findFirst: vi.fn(async () => ({
      id: IDS.shot1,
      remakeProjectId: IDS.remakeProjectId,
      stableKey: 'shot-01',
      currentRevision: 1,
      remakeProject: {
        projectId: IDS.projectId,
        currentSource: { sourceRevision: 1 },
      },
      revisions: [{ id: IDS.rev1, revision: 1, lifecycleState: 'active', sourceRevision: 1 }],
    })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ videoModel: 'test-video-model' })),
  getUserModelConfig: vi.fn(async () => ({ videoModel: 'user-video-model' })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '720p',
    generateAudio: false,
    duration: 9,
    generationMode: 'normal',
  })),
}))

vi.mock('@/lib/remake-projects/prompt/service', () => ({
  getAdoptedPromptForGeneration: vi.fn(async () => null),
}))

vi.mock('@/lib/remake-projects/semantics/asset-media', () => ({
  resolveShotAssetMedia: vi.fn(async () => ({ characterById: new Map(), locationById: new Map() })),
  readAssetIdList: vi.fn((value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return [...new Set(parsed.filter((item): item is string => typeof item === 'string'))]
        }
      } catch {
        return []
      }
    }
    return []
  }),
}))

vi.mock('@/lib/media/service', () => ({
  resolveMediaRef: vi.fn(),
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: '99999999-9999-4999-8999-999999999999',
    storageKey,
  })),
  getMediaObjectById: vi.fn(async (mediaId: string) => ({ id: mediaId, storageKey: `storage/${mediaId}` })),
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/unit-sheet-1.${ext}`),
  uploadObject: vi.fn(async (_body: unknown, key: string) => key),
  getObjectBuffer: vi.fn(async () => Buffer.from('fake-frame-jpeg')),
}))

vi.mock('@/lib/remake-projects/keyframes/action-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/remake-projects/keyframes/action-sheet')>()
  return {
    ...actual,
    renderUnitActionSheet: vi.fn(async () => Buffer.from('fake-unit-sheet-jpeg')),
  }
})

function revisionRow(revId: string, shotId: string, payload: Record<string, unknown>) {
  return {
    id: revId,
    lifecycleState: 'active',
    revision: 1,
    payload: JSON.stringify(payload),
    shot: {
      id: shotId,
      currentRevision: 1,
      remakeProjectId: IDS.remakeProjectId,
      sceneAssetId: null,
      characterAssetIds: null,
      propAssetIds: null,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  fixture.keyframeMediaBySlot.clear()
  fixture.keyframeMediaBySlot.set(`${IDS.rev1}:middle`, IDS.kf1)
  fixture.keyframeMediaBySlot.set(`${IDS.rev2}:middle`, IDS.kf2)
  fixture.keyframeMediaBySlot.set(`${IDS.rev3}:middle`, IDS.kf3)

  fixture.promptByShot.clear()
  fixture.promptByShot.set(IDS.shot1, { id: IDS.promptV1, integratedGenerationPrompt: 'member 1 prompt' })
  fixture.promptByShot.set(IDS.shot2, { id: IDS.promptV2, integratedGenerationPrompt: 'member 2 prompt' })
  fixture.promptByShot.set(IDS.shot3, { id: IDS.promptV3, integratedGenerationPrompt: 'member 3 prompt' })

  const twoMembers = [
    { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1 },
    { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2 },
  ]
  prismaMock.project.findFirst.mockResolvedValue({ id: IDS.projectId })
  prismaMock.remakeVideoUnit.findFirst.mockResolvedValue({
    id: IDS.unitId,
    remakeProjectId: IDS.remakeProjectId,
    members: twoMembers,
    tracks: [],
  })
  prismaMock.remakeVideoUnit.findUnique.mockResolvedValue({
    id: IDS.unitId,
    remakeProjectId: IDS.remakeProjectId,
  })
  prismaMock.remakeVideoUnitMember.findMany.mockResolvedValue(twoMembers)

  prismaMock.remakeShotRevision.findMany.mockResolvedValue([
    revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:03.500' }),
    revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:05.000' }),
    revisionRow(IDS.rev3, IDS.shot3, { startTimecode: '00:00:00.000', endTimecode: '00:00:08.000' }),
  ])

  prismaMock.remakeShotRevision.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const map: Record<string, ReturnType<typeof revisionRow>> = {
      [IDS.rev1]: revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:03.500' }),
      [IDS.rev2]: revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:05.000' }),
      [IDS.rev3]: revisionRow(IDS.rev3, IDS.shot3, { startTimecode: '00:00:00.000', endTimecode: '00:00:08.000' }),
    }
    return map[where.id] ?? null
  })

  prismaMock.remakeKeyframeTrack.findUnique.mockImplementation(
    async ({ where }: { where: { shotRevisionId_slot: { shotRevisionId: string; slot: string } } }) => {
      const mediaId = fixture.keyframeMediaBySlot.get(
        `${where.shotRevisionId_slot.shotRevisionId}:${where.shotRevisionId_slot.slot}`,
      )
      return mediaId ? { adoptedCandidate: { outputVersion: { mediaId } } } : null
    },
  )

  vi.mocked(getAdoptedPromptForGeneration).mockImplementation(async ({ shotId }: { shotId: string }) => {
    return fixture.promptByShot.get(shotId) ?? null
  })

  vi.mocked(resolveMediaRef).mockImplementation(
    ((async (mediaId?: unknown) => {
      if (typeof mediaId === 'string' && UUID_RE.test(mediaId)) {
        return { id: mediaId, storageKey: `storage/${mediaId}` }
      }
      return {
        id: '99999999-9999-4999-8999-999999999999',
        storageKey: typeof mediaId === 'string' ? mediaId : '',
      }
    }) as unknown) as typeof resolveMediaRef,
  )
})

describe('buildVideoUnitSubmission (D-21 per-member gate)', () => {
  it('aggregates every missing member input into one error before any provider work', async () => {
    // Member 1: no adopted keyframe. Member 2: no approved prompt. Member 3: unparseable params.
    fixture.keyframeMediaBySlot.delete(`${IDS.rev1}:middle`)
    fixture.promptByShot.delete(IDS.shot2)
    const threeMembers = [
      { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1 },
      { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2 },
      { id: 'm3', shotRevisionId: IDS.rev3, ordinal: 3 },
    ]
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValue({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
      members: threeMembers,
      tracks: [],
    })
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValue(threeMembers)
    // rev-3 payload without any parseable time range -> PARAMS
    prismaMock.remakeShotRevision.findMany.mockResolvedValue([
      revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:03.500' }),
      revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:05.000' }),
      revisionRow(IDS.rev3, IDS.shot3, {}),
    ])
    prismaMock.remakeShotRevision.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const map = {
        [IDS.rev1]: revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:03.500' }),
        [IDS.rev2]: revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:05.000' }),
        [IDS.rev3]: revisionRow(IDS.rev3, IDS.shot3, {}),
      }
      return map[where.id as keyof typeof map] ?? null
    })

    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')
    const { getProjectModelConfig } = await import('@/lib/config-service')
    const { resolveProjectModelCapabilityGenerationOptions } = await import('@/lib/config-service')

    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-unit-001',
      }),
    ).rejects.toThrow(/REMAKE_VIDEO_UNIT_MEMBER_MISSING/)

    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-unit-001',
      }),
    ).rejects.toThrow(/1:KEYFRAME/)
    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-unit-001',
      }),
    ).rejects.toThrow(/2:PROMPT/)
    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-unit-001',
      }),
    ).rejects.toThrow(/3:PARAMS/)

    // No provider work starts: model resolution + capability normalization untouched.
    expect(getProjectModelConfig).not.toHaveBeenCalled()
    expect(resolveProjectModelCapabilityGenerationOptions).not.toHaveBeenCalled()
  })

  it('rejects units that do not belong to the authenticated project', async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null)
    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')
    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-unit-x',
      }),
    ).rejects.toThrow('REMAKE_VIDEO_UNIT_PROJECT_NOT_FOUND')
  })
})

describe('buildVideoUnitSubmission (D-16/D-22 WYSIWYG freeze + W5 deferred action sheet)', () => {
  it('freezes exactly the previewed inputs with a deferred action-sheet entry, without rendering or persisting', async () => {
    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')

    const descriptor = await buildVideoUnitSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
      operationKey: 'gen-unit-001',
    })

    expect(descriptor.taskType).toBe('remake_video_unit_generate')
    expect(descriptor.targetType).toBe('remake_unit')
    expect(descriptor.targetId).toBe(IDS.unitId)
    expect(descriptor.dedupeKey).toContain('gen-unit-001')
    expect(descriptor.payload.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)

    const snapshot = descriptor.payload.inputSnapshot
    // Members carry per-member keyframes, prompt versions, and numeric time ranges.
    expect(snapshot.members).toHaveLength(2)
    expect(snapshot.members[0]!.selectedKeyframe.mediaId).toBe(IDS.kf1)
    expect(snapshot.members[1]!.selectedKeyframe.mediaId).toBe(IDS.kf2)

    // Phase 09.3: the default action-sheet grid is frozen (members have no
    // original keyframeMediaRefs here → adopted keyframes fill the cells).
    expect(snapshot.actionSheetGrid).toEqual({
      columns: 3,
      cells: [
        { shotNumber: 1, slot: 'middle', mediaId: IDS.kf1 },
        { shotNumber: 2, slot: 'middle', mediaId: IDS.kf2 },
      ],
    })

    // WYSIWYG: the frozen snapshot equals the preview for the same inputs (D-16).
    const deferredFingerprint = unitActionSheetFingerprint({
      unitId: IDS.unitId,
      cells: [{ mediaId: IDS.kf1 }, { mediaId: IDS.kf2 }],
    })
    const deferredRef = { mediaUrl: `unit-action-sheet://deferred/${deferredFingerprint}` }
    const preview = buildUnitSubmissionPreview({
      members: [
        { ordinal: 1, durationSeconds: 3.5, adoptedPrompt: 'member 1 prompt', keyframeMediaRef: { mediaId: IDS.kf1 } },
        { ordinal: 2, durationSeconds: 5, adoptedPrompt: 'member 2 prompt', keyframeMediaRef: { mediaId: IDS.kf2 } },
      ],
      actionSheetMediaRef: deferredRef,
      assetCandidates: [],
      totalDurationSeconds: 9,
    })

    expect(snapshot.promptText).toBe(preview.promptText)
    expect(snapshot.durationSeconds).toBe(preview.totalDurationSeconds)
    expect(snapshot.durationSeconds).toBe(9) // derived via deriveDefaultVideoDuration(8.5)
    expect(snapshot.orderedReferences).toEqual(toOrderedRefs(preview.orderedReferences))

    // The merged action sheet enters the plan as a deterministic deferred entry (W5).
    const actionSheetRef = snapshot.orderedReferences.find((ref: OrderedVideoReference) => ref.role === 'action_sheet')
    expect(actionSheetRef).toBeDefined()
    expect(actionSheetRef?.mediaUrl).toBe(`unit-action-sheet://deferred/${deferredFingerprint}`)

    // No rendering and no persistence in the submission path (W5).
    expect(renderUnitActionSheet).not.toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnitActionSheet.create).not.toHaveBeenCalled()
  })

  it('changes the descriptor fingerprint when any member input changes (D-22)', async () => {
    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')

    const first = await buildVideoUnitSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
      operationKey: 'gen-fp',
    })

    // Swap member 1's adopted keyframe.
    fixture.keyframeMediaBySlot.set(`${IDS.rev1}:middle`, IDS.kf1b)
    const second = await buildVideoUnitSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
      operationKey: 'gen-fp',
    })

    expect(second.inputFingerprint).not.toBe(first.inputFingerprint)
    expect(second.dedupeKey).not.toBe(first.dedupeKey)
    expect(second.payload.inputSnapshot.members[0]!.selectedKeyframe.mediaId).toBe(IDS.kf1b)
  })

  it('uses the member keyframeSlot as the preferred slot, falling back when it has no adopted keyframe (Phase 09.2)', async () => {
    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')

    // rev1 pins 'end' (adopted); rev2 pins 'start' (no adopted) → falls back to middle.
    fixture.keyframeMediaBySlot.set(`${IDS.rev1}:end`, IDS.kf1e)
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValue({
      id: IDS.unitId,
      remakeProjectId: IDS.remakeProjectId,
      members: [
        { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1, keyframeSlot: 'end' },
        { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2, keyframeSlot: 'start' },
      ],
      tracks: [],
    })

    const descriptor = await buildVideoUnitSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
      operationKey: 'gen-slot',
    })

    const snapshot = descriptor.payload.inputSnapshot
    expect(snapshot.members[0]!.selectedKeyframe).toEqual({
      slot: 'end',
      mediaId: IDS.kf1e,
    })
    // 'start' has no adopted keyframe → middle fallback (D-06).
    expect(snapshot.members[1]!.selectedKeyframe).toEqual({
      slot: 'middle',
      mediaId: IDS.kf2,
    })
  })
})

describe('buildVideoUnitSubmission (D-05 duration policy)', () => {
  it('normalizes the member duration sum through deriveDefaultVideoDuration', async () => {
    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')
    const descriptor = await buildVideoUnitSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      unitId: IDS.unitId,
      operationKey: 'gen-duration',
    })
    // 3.5 + 5.0 = 8.5 -> ceil 9 (no capability definitions for the mocked model key).
    expect(descriptor.payload.inputSnapshot.durationSeconds).toBe(9)
  })

  it('throws REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG with a split hint when the raw sum exceeds the model max', async () => {
    prismaMock.remakeShotRevision.findMany.mockResolvedValue([
      revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:10.000' }),
      revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:10.000' }),
      revisionRow(IDS.rev3, IDS.shot3, { startTimecode: '00:00:00.000', endTimecode: '00:00:08.000' }),
    ])
    prismaMock.remakeShotRevision.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const map = {
        [IDS.rev1]: revisionRow(IDS.rev1, IDS.shot1, { startTimecode: '00:00:00.000', endTimecode: '00:00:10.000' }),
        [IDS.rev2]: revisionRow(IDS.rev2, IDS.shot2, { startTimecode: '00:00:00.000', endTimecode: '00:00:10.000' }),
        [IDS.rev3]: revisionRow(IDS.rev3, IDS.shot3, { startTimecode: '00:00:00.000', endTimecode: '00:00:08.000' }),
      }
      return map[where.id as keyof typeof map] ?? null
    })

    const { buildVideoUnitSubmission } = await import('@/lib/remake-projects/unit/submission')
    const { resolveProjectModelCapabilityGenerationOptions } = await import('@/lib/config-service')

    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-too-long',
      }),
    ).rejects.toThrow(/REMAKE_VIDEO_UNIT_TOTAL_TOO_LONG/)
    // 20s > 15s model max -> explicit split hint instead of silent truncation.
    await expect(
      buildVideoUnitSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        unitId: IDS.unitId,
        operationKey: 'gen-too-long',
      }),
    ).rejects.toThrow(/20/)
    expect(resolveProjectModelCapabilityGenerationOptions).not.toHaveBeenCalled()
  })
})

describe('D-04 single-shot membership gate + merged-sheet persist helper', () => {
  it('rejects single-shot generation for a shot that is already a unit member (D-04)', async () => {
    prismaMock.remakeVideoUnitMember.findUnique.mockResolvedValueOnce({ id: 'member-x' })
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    await expect(
      buildVideoGenerationSubmission({
        projectId: IDS.projectId,
        userId: IDS.userId,
        shotId: IDS.shot1,
        operationKey: 'gen-single',
        selectedSlots: ['middle'],
        includeActionSheet: false,
        shotDurationSeconds: 4,
      }),
    ).rejects.toThrow('REMAKE_VIDEO_SHOT_IN_UNIT')
  })

  it('renderAndPersistUnitActionSheet persists the merged sheet with fingerprint dedup + provenance', async () => {
    const { renderAndPersistUnitActionSheet } = await import('@/lib/remake-projects/unit/action-sheet')
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')
    const { ensureMediaObjectFromStorageKey } = await import('@/lib/media/service')
    const { generateUniqueKey, uploadObject } = await import('@/lib/storage')

    const sources = [
      { ordinal: 1, mediaId: IDS.kf1, timestamp: 0 },
      { ordinal: 2, mediaId: IDS.kf2, timestamp: 3500 },
    ]

    const created = {
      id: 'sheet-1',
      unitId: IDS.unitId,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
      mediaId: '99999999-9999-4999-8999-999999999999',
      status: 'completed',
    }
    prismaMock.remakeVideoUnitActionSheet.create.mockResolvedValue({ ...created, fingerprint: 'x'.repeat(64) })

    const first = await renderAndPersistUnitActionSheet({ projectId: IDS.projectId, unitId: IDS.unitId, sources })

    expect(renderUnitActionSheet).toHaveBeenCalledWith(
      expect.arrayContaining(sources.map((source) => expect.objectContaining(source))),
      undefined,
    )
    expect(generateUniqueKey).toHaveBeenCalledWith(`remake/${IDS.projectId}/action-sheets`, 'jpg')
    expect(uploadObject).toHaveBeenCalledWith(expect.any(Buffer), expect.any(String), 1, 'image/jpeg')
    expect(ensureMediaObjectFromStorageKey).toHaveBeenCalled()
    expect(prismaMock.remakeVideoUnitActionSheet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: IDS.unitId,
          mediaId: '99999999-9999-4999-8999-999999999999',
          status: 'completed',
          sources: expect.stringContaining(IDS.kf1),
        }),
      }),
    )
    expect(first.reused).toBe(false)

    // Fingerprint dedup: the second call with identical sources reuses the row.
    const storedFingerprint = 'x'.repeat(64)
    prismaMock.remakeVideoUnitActionSheet.findUnique.mockResolvedValueOnce({
      id: 'sheet-1',
      unitId: IDS.unitId,
      fingerprint: storedFingerprint,
      mediaId: '99999999-9999-4999-8999-999999999999',
      status: 'completed',
    })
    const second = await renderAndPersistUnitActionSheet({ projectId: IDS.projectId, unitId: IDS.unitId, sources })
    expect(second.reused).toBe(true)
    expect(prismaMock.remakeVideoUnitActionSheet.create).toHaveBeenCalledTimes(1)
  })
})
