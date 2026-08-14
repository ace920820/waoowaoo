import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from './helpers/call-route'
import { ROUTE_CATALOG } from '../../contracts/route-catalog'
import { getAdoptedPromptForGeneration } from '@/lib/remake-projects/prompt/service'
import { resolveMediaRef } from '@/lib/media/service'

/**
 * Phase 09.1-04 unit API routes (D-02/D-04/D-19/D-21/W5):
 *  - POST /units: create a unit from >= 2 member revisions; D-04 conflicts;
 *    unauthenticated / cross-project requests rejected.
 *  - PATCH /units/[unitId]/members: add/remove/reorder pre-freeze; 409 after
 *    submit (REMAKE_VIDEO_UNIT_MEMBERS_FROZEN / GENERATION_IN_FLIGHT).
 *  - POST /units/[unitId] (action generate): 202 + taskId + inputFingerprint;
 *    a unit with a missing member input returns the aggregated D-21 error
 *    mapped to CONFLICT.
 *  - GET /units/preview: on-demand merged-sheet render (auth'd, no persist).
 *  - GET /units/[unitId] + unit track note/adopt/reconfirm mirror the
 *    single-shot track routes.
 *  - Route-coverage guard expectation: every new route is registered in
 *    tests/contracts/route-catalog.ts.
 */

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: '33333333-3333-4333-8333-333333333333',
  userId: '55555555-5555-4555-8555-555555555555',
  shot1: '44444444-4444-4444-8444-444444444441',
  shot2: '44444444-4444-4444-8444-444444444442',
  rev1: '55555555-5555-4555-8555-555555555551',
  rev2: '55555555-5555-4555-8555-555555555552',
  kf1: 'a1111111-1111-4111-8111-111111111111',
  kf2: 'a2222222-2222-4222-8222-222222222222',
  promptV1: '66666666-6666-4666-8666-666666666661',
  promptV2: '66666666-6666-4666-8666-666666666662',
  taskId: '77777777-7777-4777-8777-777777777777',
  trackId: '88888888-8888-4888-8888-888888888888',
  versionA: '99999999-9999-4999-8999-999999999991',
  outputA: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
  batchId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1',
  mediaId: 'cccccccc-cccc-4ccc-cccc-ccccccccccc1',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const authState = vi.hoisted<{ authenticated: boolean }>(() => ({ authenticated: true }))

const fixture = vi.hoisted(() => {
  const keyframeMediaBySlot = new Map<string, string>()
  const promptByShot = new Map<string, { id: string; integratedGenerationPrompt: string }>()
  return { keyframeMediaBySlot, promptByShot }
})

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: { findFirst: vi.fn() },
  remakeVideoUnit: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  remakeShotRevision: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  remakeKeyframeTrack: {
    findUnique: vi.fn(),
  },
  remakeVideoUnitTrack: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitBatch: {
    findFirst: vi.fn(),
  },
  remakeVideoUnitVersion: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  remakeVideoUnitAdoptionEvent: {
    create: vi.fn(),
  },
  remakeInvalidation: {
    updateMany: vi.fn(),
  },
  remakeOutputVersion: {
    update: vi.fn(),
  },
  remakeVideoUnitActionSheet: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => {
    if (!authState.authenticated) {
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    return { session: { user: { id: IDS.userId } } }
  }),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

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
  readAssetIdList: vi.fn(() => []),
}))

vi.mock('@/lib/media/service', () => ({
  resolveMediaRef: vi.fn(),
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: '99999999-9999-4999-8999-999999999999',
    storageKey,
  })),
  getMediaObjectById: vi.fn(async () => ({ id: IDS.mediaId, storageKey: `storage/${IDS.mediaId}` })),
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/unit-sheet-1.${ext}`),
  uploadObject: vi.fn(async (_body: unknown, key: string) => key),
  getObjectBuffer: vi.fn(async () => Buffer.from('fake-keyframe-buffer')),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async () => ({ taskId: IDS.taskId })),
}))

vi.mock('@/lib/remake-projects/keyframes/action-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/remake-projects/keyframes/action-sheet')>()
  return {
    ...actual,
    renderUnitActionSheet: vi.fn(async () => Buffer.from('fake-unit-sheet-jpeg')),
  }
})

function revisionRow(revId: string, shotId: string) {
  return {
    id: revId,
    lifecycleState: 'active',
    revision: 1,
    payload: JSON.stringify({ startTimecode: '00:00:00.000', endTimecode: '00:00:05.000' }),
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

function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.unitId,
    remakeProjectId: IDS.remakeProjectId,
    userLabel: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    members: [
      { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1 },
      { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2 },
    ],
    tracks: [],
    ...overrides,
  }
}

function trackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.trackId,
    unitId: IDS.unitId,
    adoptedVersionId: null,
    batches: [],
    adoptionEvents: [],
    unit: { id: IDS.unitId },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.authenticated = true

  fixture.keyframeMediaBySlot.clear()
  fixture.keyframeMediaBySlot.set(`${IDS.rev1}:middle`, IDS.kf1)
  fixture.keyframeMediaBySlot.set(`${IDS.rev2}:middle`, IDS.kf2)

  fixture.promptByShot.clear()
  fixture.promptByShot.set(IDS.shot1, { id: IDS.promptV1, integratedGenerationPrompt: 'member 1 prompt' })
  fixture.promptByShot.set(IDS.shot2, { id: IDS.promptV2, integratedGenerationPrompt: 'member 2 prompt' })

  prismaMock.project.findFirst.mockResolvedValue({ id: IDS.projectId })
  prismaMock.remakeVideoUnit.findFirst.mockResolvedValue(unitRow())
  prismaMock.remakeVideoUnit.findUnique.mockResolvedValue({
    id: IDS.unitId,
    remakeProjectId: IDS.remakeProjectId,
  })
  prismaMock.remakeVideoUnitMember.findMany.mockResolvedValue([
    { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1 },
    { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2 },
  ])
  prismaMock.remakeShotRevision.findMany.mockResolvedValue([
    revisionRow(IDS.rev1, IDS.shot1),
    revisionRow(IDS.rev2, IDS.shot2),
  ])
  prismaMock.remakeShotRevision.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const map: Record<string, ReturnType<typeof revisionRow>> = {
        [IDS.rev1]: revisionRow(IDS.rev1, IDS.shot1),
        [IDS.rev2]: revisionRow(IDS.rev2, IDS.shot2),
      }
      return map[where.id] ?? null
    },
  )
  prismaMock.remakeKeyframeTrack.findUnique.mockImplementation(
    async ({ where }: { where: { shotRevisionId_slot: { shotRevisionId: string; slot: string } } }) => {
      const mediaId = fixture.keyframeMediaBySlot.get(
        `${where.shotRevisionId_slot.shotRevisionId}:${where.shotRevisionId_slot.slot}`,
      )
      return mediaId ? { adoptedCandidate: { outputVersion: { mediaId } } } : null
    },
  )
  prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValue(trackRow())
  prismaMock.remakeVideoUnitBatch.findFirst.mockResolvedValue(null)
  prismaMock.task.findFirst.mockResolvedValue(null)

  vi.mocked(getAdoptedPromptForGeneration).mockImplementation(
    async ({ shotId }: { shotId: string }) => fixture.promptByShot.get(shotId) ?? null,
  )

  vi.mocked(resolveMediaRef).mockImplementation(
    ((async (mediaId?: unknown) => {
      if (typeof mediaId === 'string' && UUID_RE.test(mediaId)) return { id: mediaId, storageKey: `storage/${mediaId}` }
      return { id: '99999999-9999-4999-8999-999999999999', storageKey: typeof mediaId === 'string' ? mediaId : '' }
    }) as unknown) as typeof resolveMediaRef,
  )
})

describe('POST /units — create (D-02/D-04)', () => {
  it('creates a unit from >= 2 member revisions and returns unit id + members', async () => {
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([])
    prismaMock.remakeVideoUnit.create.mockResolvedValueOnce({ id: IDS.unitId })
    prismaMock.remakeVideoUnitMember.createMany.mockResolvedValueOnce({ count: 2 })

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/route')
    const res = await callRoute(
      POST,
      'POST',
      { memberShotRevisionIds: [IDS.rev1, IDS.rev2] },
      { params: { projectId: IDS.projectId } },
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.unitId).toBe(IDS.unitId)
    expect(body.members).toHaveLength(2)
    expect(body.members[0]).toEqual({ shotRevisionId: IDS.rev1, ordinal: 1 })
    expect(prismaMock.remakeVideoUnitMember.createMany).toHaveBeenCalled()
  })

  it('rejects a member that already belongs to another unit with a D-04 conflict', async () => {
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValueOnce([{ shotRevisionId: IDS.rev2 }])

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/route')
    const res = await callRoute(
      POST,
      'POST',
      { memberShotRevisionIds: [IDS.rev1, IDS.rev2] },
      { params: { projectId: IDS.projectId } },
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('REMAKE_VIDEO_UNIT_MEMBER_ALREADY_ASSIGNED')
  })

  it('rejects unauthenticated requests', async () => {
    authState.authenticated = false
    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/route')
    const res = await callRoute(
      POST,
      'POST',
      { memberShotRevisionIds: [IDS.rev1, IDS.rev2] },
      { params: { projectId: IDS.projectId } },
    )
    expect(res.status).toBe(401)
  })
})

describe('PATCH /units/[unitId]/members (D-19)', () => {
  it('reorders members before freeze', async () => {
    prismaMock.remakeVideoUnitMember.findMany.mockResolvedValue([
      { id: 'm1', shotRevisionId: IDS.rev1, ordinal: 1 },
      { id: 'm2', shotRevisionId: IDS.rev2, ordinal: 2 },
    ])
    prismaMock.remakeVideoUnitMember.update.mockResolvedValue({ id: 'm1' })

    const { PATCH } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/members/route')
    const res = await callRoute(
      PATCH,
      'PATCH',
      { members: [{ shotRevisionId: IDS.rev2, ordinal: 1 }, { shotRevisionId: IDS.rev1, ordinal: 2 }] },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unitId).toBe(IDS.unitId)
    expect(body.members).toHaveLength(2)
  })

  it('returns 409 CONFLICT once the unit members are frozen after submit (D-19)', async () => {
    prismaMock.remakeVideoUnitBatch.findFirst.mockResolvedValueOnce({ id: IDS.batchId })

    const { PATCH } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/members/route')
    const res = await callRoute(
      PATCH,
      'PATCH',
      { members: [{ shotRevisionId: IDS.rev1, ordinal: 1 }, { shotRevisionId: IDS.rev2, ordinal: 2 }] },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('REMAKE_VIDEO_UNIT_MEMBERS_FROZEN')
  })
})

describe('POST /units/[unitId] — generate action (D-21/D-22)', () => {
  it('returns 202 with taskId + inputFingerprint for a complete unit', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'generate', operationKey: 'gen-unit-001' },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.taskId).toBe(IDS.taskId)
    expect(body.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('maps the aggregated per-member missing error (D-21) to a CONFLICT response', async () => {
    fixture.keyframeMediaBySlot.delete(`${IDS.rev1}:middle`)

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'generate', operationKey: 'gen-missing' },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('REMAKE_VIDEO_UNIT_MEMBER_MISSING')
    expect(JSON.stringify(body)).toContain('1:KEYFRAME')
  })

  it('returns INVALID_PARAMS for a malformed generate body', async () => {
    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'generate' },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )
    expect(res.status).toBe(400)
  })
})

describe('GET /units/preview (W5 on-demand render, no persist)', () => {
  it('renders the merged action sheet and returns an image/jpeg buffer without persisting', async () => {
    const { GET } = await import('@/app/api/remake-projects/[projectId]/units/preview/route')
    const { renderUnitActionSheet } = await import('@/lib/remake-projects/keyframes/action-sheet')

    const res = await callRoute(
      GET,
      'GET',
      undefined,
      { params: { projectId: IDS.projectId }, query: { unitId: IDS.unitId } },
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    const bytes = await res.arrayBuffer()
    expect(Buffer.from(bytes).length).toBeGreaterThan(0)
    expect(renderUnitActionSheet).toHaveBeenCalled()
    // W5: preview never persists the sheet.
    expect(prismaMock.remakeVideoUnitActionSheet.create).not.toHaveBeenCalled()
  })

  it('rejects preview when no unitId / memberShotRevisionIds is provided', async () => {
    const { GET } = await import('@/app/api/remake-projects/[projectId]/units/preview/route')
    const res = await callRoute(GET, 'GET', undefined, { params: { projectId: IDS.projectId } })
    expect(res.status).toBe(400)
  })
})

describe('GET /units/[unitId] — detail', () => {
  it('returns members + track detail for an owned unit', async () => {
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValue(
      unitRow({
        tracks: [{
          id: IDS.trackId,
          adoptedVersionId: null,
          batches: [],
          adoptionEvents: [],
        }],
      }),
    )

    const { GET } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/route')
    const res = await callRoute(
      GET,
      'GET',
      undefined,
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unit.id).toBe(IDS.unitId)
    expect(body.members).toHaveLength(2)
    expect(body.track.id).toBe(IDS.trackId)
  })

  it('returns NOT_FOUND for a unit outside the authenticated project', async () => {
    prismaMock.remakeVideoUnit.findFirst.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/route')
    const res = await callRoute(
      GET,
      'GET',
      undefined,
      { params: { projectId: IDS.projectId, unitId: IDS.unitId } },
    )
    expect(res.status).toBe(404)
  })
})

describe('unit track routes — note/adopt/reconfirm mirror the single-shot track routes', () => {
  it('PATCH note sets a review note on an owned unit version', async () => {
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({ id: IDS.versionA })
    prismaMock.remakeVideoUnitVersion.update.mockResolvedValueOnce({ id: IDS.versionA, note: 'needs polish' })

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/tracks/[trackId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'note', versionId: IDS.versionA, note: 'needs polish' },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId, trackId: IDS.trackId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version.id).toBe(IDS.versionA)
  })

  it('POST adopt sets the unit adoption pointer and records the event', async () => {
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce(
      trackRow({ adoptedVersionId: null }),
    )
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: IDS.versionA,
      batchId: IDS.batchId,
      batch: {
        inputSnapshot: {
          projectId: IDS.projectId,
          remakeProjectId: IDS.remakeProjectId,
          unitId: IDS.unitId,
          members: [
            {
              shotRevisionId: IDS.rev1,
              ordinal: 1,
              selectedKeyframe: { slot: 'middle', mediaId: IDS.kf1 },
              promptVersionId: IDS.promptV1,
              timeRangeSeconds: { start: 0, end: 5 },
            },
            {
              shotRevisionId: IDS.rev2,
              ordinal: 2,
              selectedKeyframe: { slot: 'middle', mediaId: IDS.kf2 },
              promptVersionId: IDS.promptV2,
              timeRangeSeconds: { start: 0, end: 5 },
            },
          ],
          orderedReferences: [
            { role: 'shot_keyframe', ordinal: 1, mediaId: IDS.kf1, mediaType: 'image', sourceType: 'shot_keyframe' },
            { role: 'shot_keyframe', ordinal: 2, mediaId: IDS.kf2, mediaType: 'image', sourceType: 'shot_keyframe' },
          ],
          model: { id: 'test-video-model' },
          options: {},
          durationSeconds: 9,
          promptText: 'timed prompt',
        },
      },
      outputVersion: { id: IDS.outputA, status: 'completed', invalidatedAt: null },
    })
    prismaMock.remakeVideoUnitTrack.update.mockResolvedValueOnce({
      id: IDS.trackId,
      adoptedVersionId: IDS.versionA,
    })
    prismaMock.remakeVideoUnitAdoptionEvent.create.mockResolvedValueOnce({ id: 'event-1' })

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/tracks/[trackId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'adopt', versionId: IDS.versionA },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId, trackId: IDS.trackId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.track.adoptedVersionId).toBe(IDS.versionA)
    expect(prismaMock.remakeVideoUnitAdoptionEvent.create).toHaveBeenCalled()
  })

  it('POST reconfirm clears invalidation on the adopted version', async () => {
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce(
      trackRow({ adoptedVersionId: IDS.versionA }),
    )
    prismaMock.remakeVideoUnitVersion.findFirst.mockResolvedValueOnce({
      id: IDS.versionA,
      outputVersionId: IDS.outputA,
      outputVersion: { id: IDS.outputA, status: 'needs_review', invalidatedAt: new Date() },
    })
    prismaMock.remakeInvalidation.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.remakeOutputVersion.update.mockResolvedValueOnce({ id: IDS.outputA })
    prismaMock.remakeVideoUnitAdoptionEvent.create.mockResolvedValueOnce({ id: 'event-2' })

    const { POST } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/tracks/[trackId]/route')
    const res = await callRoute(
      POST,
      'POST',
      { action: 'reconfirm', versionId: IDS.versionA },
      { params: { projectId: IDS.projectId, unitId: IDS.unitId, trackId: IDS.trackId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reconfirmed).toBe(true)
    expect(prismaMock.remakeInvalidation.updateMany).toHaveBeenCalled()
  })

  it('GET returns the unit track detail', async () => {
    prismaMock.remakeVideoUnitTrack.findFirst.mockResolvedValueOnce(
      trackRow({
        adoptedVersion: null,
        batches: [
          {
            id: IDS.batchId,
            taskId: IDS.taskId,
            operationKey: 'gen-unit-001',
            modelId: 'test-video-model',
            modelOptions: {},
            orderedReferences: [],
            createdAt: new Date('2026-08-14T00:00:00Z'),
            versions: [
              {
                id: IDS.versionA,
                ordinal: 1,
                outputVersionId: IDS.outputA,
                note: null,
                outputVersion: { id: IDS.outputA, mediaId: 'video-1', status: 'completed', invalidatedAt: null },
              },
            ],
          },
        ],
      }),
    )

    const { GET } = await import('@/app/api/remake-projects/[projectId]/units/[unitId]/tracks/[trackId]/route')
    const res = await callRoute(
      GET,
      'GET',
      undefined,
      { params: { projectId: IDS.projectId, unitId: IDS.unitId, trackId: IDS.trackId } },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.track.unitId).toBe(IDS.unitId)
    expect(body.history).toHaveLength(1)
  })
})

describe('route-coverage guard expectation', () => {
  it('registers every new unit route in the route catalog', () => {
    const catalogFiles = ROUTE_CATALOG.map((entry) => entry.routeFile)
    for (const routeFile of [
      'src/app/api/remake-projects/[projectId]/units/route.ts',
      'src/app/api/remake-projects/[projectId]/units/[unitId]/route.ts',
      'src/app/api/remake-projects/[projectId]/units/[unitId]/members/route.ts',
      'src/app/api/remake-projects/[projectId]/units/[unitId]/tracks/[trackId]/route.ts',
      'src/app/api/remake-projects/[projectId]/units/preview/route.ts',
    ]) {
      expect(catalogFiles).toContain(routeFile)
    }
  })
})
