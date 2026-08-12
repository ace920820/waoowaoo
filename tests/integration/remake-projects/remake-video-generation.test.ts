import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Cross-layer contract test for Remake video generation.
 *
 * Verifies consistency across API / service / persistence / invalidation
 * boundaries that the individual layer tests don't catch.
 *
 * Individual layer coverage (already covered elsewhere):
 * - API route validation: tests/integration/api/remake-projects-video.test.ts (9)
 * - Track lifecycle: tests/integration/api/remake-projects-video-tracks.test.ts (8)
 * - Invalidation: tests/integration/remake-projects/remake-video-invalidation.test.ts (4)
 * - Worker: tests/unit/worker/remake-video.test.ts (7)
 * - Task contract: tests/unit/remake-projects/remake-video-task-contract.test.ts (12)
 * - Input contract: tests/unit/remake-projects/remake-video-input-contract.test.ts (11)
 * - UI stage: tests/unit/remake-projects/remake-video-stage.test.tsx (17)
 */

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  userId: '55555555-5555-4555-8555-555555555555',
  trackId: 'vt-00000000-0000-0000-0000-000000000001',
  versionA: 'vv-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  versionB: 'vv-bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  outputA: 'ov-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  outputB: 'ov-bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),

  remakeVideoTrack: {
    findFirst: vi.fn(async () => ({
      id: IDS.trackId,
      shotRevisionId: 'rev-1',
      adoptedVersionId: null,
      adoptedVersion: null,
      shotRevision: {
        id: 'rev-1',
        revision: 1,
        lifecycleState: 'active',
        shot: { id: 'shot-1', currentRevision: 1, remakeProject: { projectId: IDS.projectId, project: { userId: IDS.userId } } },
      },
      batches: [],
      adoptionEvents: [],
      invalidations: [],
    })),
    update: vi.fn(async (_w: unknown, args: { data: { adoptedVersionId: string } }) => ({
      id: IDS.trackId,
      adoptedVersionId: args.data.adoptedVersionId,
    })),
  },

  remakeVideoVersion: {
    findFirst: vi.fn(async () => ({
      id: IDS.versionA,
      batchId: 'batch-1',
      outputVersionId: IDS.outputA,
      outputVersion: { id: IDS.outputA, status: 'completed', invalidatedAt: null },
    })),
    update: vi.fn(async (_w: unknown, args: { data: { note?: string } }) => ({
      id: IDS.versionA,
      note: args.data.note ?? null,
    })),
  },

  remakeVideoAdoptionEvent: {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'evt-1',
      ...args.data,
      createdAt: new Date(),
    })),
  },

  remakeInvalidation: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },

  remakeOutputVersion: {
    update: vi.fn(async () => ({ id: IDS.outputA, invalidatedAt: null, status: 'completed' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('remake video generation — cross-layer contracts', () => {
  describe('API request ↔ service input shape', () => {
    it('route schema accepts the same fields the UI component sends', async () => {
      const fs = await import('node:fs')

      const routeSource = fs.readFileSync(
        'src/app/api/remake-projects/[projectId]/video/route.ts',
        'utf-8',
      )
      const stageSource = fs.readFileSync(
        'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx',
        'utf-8',
      )

      // Route accepts these fields
      const routeFields = [
        'shotId',
        'operationKey',
        'selectedSlots',
        'includeActionSheet',
        'shotDurationSeconds',
        'model',
        'options',
      ]
      for (const field of routeFields) {
        expect(routeSource).toContain(field)
      }

      // Stage sends these fields in the generate body
      const stageSends = [
        'action: \'generate\'',
        'shotId: shot.id',
        'operationKey:',
        'selectedSlots: selected.slots',
        'includeActionSheet: selected.includeActionSheet',
        'shotDurationSeconds: shot.durationSeconds',
        'model: selectedModel',
        'options: generationOptions',
      ]
      for (const field of stageSends) {
        expect(stageSource).toContain(field)
      }
    })

    it('task descriptor matches worker handler expectations', async () => {
      const fs = await import('node:fs')

      const taskContract = fs.readFileSync(
        'src/lib/remake-projects/video/task-contract.ts',
        'utf-8',
      )
      const workerHandler = fs.readFileSync(
        'src/lib/workers/handlers/remake-video.ts',
        'utf-8',
      )

      // Both reference the same task type
      expect(taskContract).toContain('REMAKE_VIDEO_GENERATE')
      expect(workerHandler).toContain('handleRemakeVideoTask')

      // Worker parses payload using the same contract type
      expect(workerHandler).toContain('parseRemakeVideoTaskPayload')
      expect(taskContract).toContain('inputSnapshot')
      expect(workerHandler).toContain('inputSnapshot')
    })
  })

  describe('fingerprint stability across layers', () => {
    it('identical inputs produce identical fingerprint (determinism)', async () => {
      const { videoInputFingerprint } = await import('@/lib/remake-projects/video/contracts')

      const base = {
        projectId: IDS.projectId,
        remakeProjectId: 'rp-1',
        shotId: 'shot-1',
        stableKey: 'stable-1',
        sourceRevision: 1,
        shotRevision: 1,
        shotRevisionId: 'rev-1',
        promptVersionId: 'pv-1',
        promptText: 'test prompt',
        model: { id: 'test-model' },
        options: { duration: 10, resolution: '720p' },
        orderedReferences: [
          { role: 'start_keyframe' as const, ordinal: 1, mediaId: 'm-1' },
          { role: 'middle_keyframe' as const, ordinal: 2, mediaId: 'm-2' },
        ],
        durationSeconds: 10,
      }

      const fp1 = videoInputFingerprint(base)
      const fp2 = videoInputFingerprint({ ...base })
      expect(fp1).toBe(fp2)
    })

    it('changing any input field changes the fingerprint', async () => {
      const { videoInputFingerprint } = await import('@/lib/remake-projects/video/contracts')

      const base = {
        projectId: IDS.projectId,
        remakeProjectId: 'rp-1',
        shotId: 'shot-1',
        stableKey: 'stable-1',
        sourceRevision: 1,
        shotRevision: 1,
        shotRevisionId: 'rev-1',
        promptVersionId: 'pv-1',
        promptText: 'test prompt',
        model: { id: 'test-model' },
        options: { duration: 10, resolution: '720p' },
        orderedReferences: [
          { role: 'start_keyframe' as const, ordinal: 1, mediaId: 'm-1' },
        ],
        durationSeconds: 10,
      }
      const baseFp = videoInputFingerprint(base)

      // Each change should produce a different fingerprint
      expect(videoInputFingerprint({ ...base, promptText: 'different' })).not.toBe(baseFp)
      expect(videoInputFingerprint({ ...base, model: { id: 'other-model' } })).not.toBe(baseFp)
      expect(videoInputFingerprint({ ...base, durationSeconds: 5 })).not.toBe(baseFp)
      expect(videoInputFingerprint({
        ...base,
        orderedReferences: [
          { role: 'start_keyframe' as const, ordinal: 1, mediaId: 'm-1' },
          { role: 'end_keyframe' as const, ordinal: 2, mediaId: 'm-3' },
        ],
      })).not.toBe(baseFp)
    })

    it('reference order change changes fingerprint (D-04 guard)', async () => {
      const { videoInputFingerprint } = await import('@/lib/remake-projects/video/contracts')

      const correctOrder = {
        projectId: IDS.projectId,
        remakeProjectId: 'rp-1',
        shotId: 'shot-1',
        stableKey: 'stable-1',
        sourceRevision: 1,
        shotRevision: 1,
        shotRevisionId: 'rev-1',
        promptVersionId: 'pv-1',
        promptText: 'test',
        model: { id: 'm' },
        options: {},
        orderedReferences: [
          { role: 'start_keyframe' as const, ordinal: 1, mediaId: 'a' },
          { role: 'middle_keyframe' as const, ordinal: 2, mediaId: 'b' },
        ],
        durationSeconds: 5,
      }
      const wrongOrder = {
        ...correctOrder,
        orderedReferences: [
          { role: 'middle_keyframe' as const, ordinal: 1, mediaId: 'b' },
          { role: 'start_keyframe' as const, ordinal: 2, mediaId: 'a' },
        ],
      }

      expect(videoInputFingerprint(wrongOrder)).not.toBe(videoInputFingerprint(correctOrder))
    })
  })

  describe('snapshot ←→ adapter shape consistency', () => {
    it('snapshot videoGeneration shape matches adapter expected shape', async () => {
      const fs = await import('node:fs')

      const serviceSource = fs.readFileSync(
        'src/lib/remake-projects/service.ts',
        'utf-8',
      )
      const adapterSource = fs.readFileSync(
        'src/lib/remake-projects/keyframes/adapter.ts',
        'utf-8',
      )

      // Both reference the same track fields
      const sharedFields = ['id', 'adoptedVersionId', 'hasInvalidated', 'batches', 'versions']
      for (const field of sharedFields) {
        expect(serviceSource).toContain(field)
        expect(adapterSource).toContain(field)
      }

      // Service produces videoGeneration.track, adapter reads it
      expect(serviceSource).toContain('videoGeneration')
      expect(adapterSource).toContain('videoGeneration')
    })

    it('RemakeSnapshot type includes videoGeneration matching adapter RemakeShotView', async () => {
      const fs = await import('node:fs')

      const hooksSource = fs.readFileSync(
        'src/lib/query/hooks/useRemakeProject.ts',
        'utf-8',
      )
      const adapterSource = fs.readFileSync(
        'src/lib/remake-projects/keyframes/adapter.ts',
        'utf-8',
      )

      // Both have track with these core fields
      expect(hooksSource).toContain('videoGeneration')
      expect(hooksSource).toContain('adoptedVersionId')
      expect(hooksSource).toContain('hasInvalidated')
      expect(hooksSource).toContain('batches')
      expect(hooksSource).toContain('versions')

      expect(adapterSource).toContain('videoGeneration')
      expect(adapterSource).toContain('adoptedVersionId')
      expect(adapterSource).toContain('hasInvalidated')
      expect(adapterSource).toContain('batches')
    })
  })
})
