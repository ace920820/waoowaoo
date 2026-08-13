import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  revisionId: '44444444-4444-4444-8444-444444444444',
  userId: '55555555-5555-4555-8555-555555555555',
  promptVersionId: '66666666-6666-4666-8666-666666666666',
  taskId: '77777777-7777-4777-8777-777777777777',
  mediaStart: 'a1111111-1111-4111-8111-111111111111',
  mediaMiddle: 'a2222222-2222-4222-8222-222222222222',
  mediaEnd: 'a3333333-3333-4333-8333-333333333333',
  mediaActionSheet: 'a4444444-4444-4444-8444-444444444444',
}

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  project: {
    findFirst: vi.fn(async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '55555555-5555-4555-8555-555555555555',
      type: 'remake',
    })),
    findUnique: vi.fn(async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Remake project',
      description: null,
      userId: '55555555-5555-4555-8555-555555555555',
      type: 'remake',
      remakeProject: {
        id: '22222222-2222-4222-8222-222222222222',
        importStatus: 'analyzed',
        currentSource: { sourceRevision: 1 },
      },
    })),
  },
  remakeShot: {
    findFirst: vi.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      remakeProjectId: '22222222-2222-4222-8222-222222222222',
      stableKey: 'shot-01',
      currentRevision: 1,
      remakeProject: {
        projectId: '11111111-1111-4111-8111-111111111111',
        currentSource: { sourceRevision: 1 },
      },
      revisions: [{
        id: '44444444-4444-4444-8444-444444444444',
        revision: 1,
        lifecycleState: 'active',
        sourceRevision: 1,
      }],
    })),
  },
  remakeKeyframeTrack: {
    findUnique: vi.fn(async (args: { where: { shotRevisionId_slot: { slot: string } } }) => {
      const slot = args?.where?.shotRevisionId_slot?.slot
      const mediaMap: Record<string, string> = {
        start: 'a1111111-1111-4111-8111-111111111111',
        middle: 'a2222222-2222-4222-8222-222222222222',
        end: 'a3333333-3333-4333-8333-333333333333',
      }
      return {
        id: `track-${slot}`,
        slot,
        adoptedCandidateId: `cand-${slot}`,
        adoptedCandidate: {
          id: `cand-${slot}`,
          outputVersion: { id: `output-${slot}`, mediaId: mediaMap[slot] || '' },
        },
      }
    }),
  },
  remakeOutputVersion: {
    findFirst: vi.fn(async () => ({
      id: 'action-sheet-out',
      mediaId: 'a4444444-4444-4444-8444-444444444444',
      status: 'completed',
    })),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({ id: 'asset-container-1' })),
  },
  novelPromotionCharacter: {
    findMany: vi.fn(async () => [
      {
        id: 'char-1',
        name: '萨姆',
        appearances: [{
          id: 'appearance-1',
          appearanceIndex: 0,
          imageMediaId: 'b1111111-1111-4111-8111-111111111111',
          imageUrl: null,
          imageUrls: null,
          selectedIndex: null,
        }],
        customVoiceMediaId: 'e1111111-1111-4111-8111-111111111111',
        customVoiceUrl: null,
      },
    ]),
  },
  novelPromotionLocation: {
    findMany: vi.fn(async () => [
      {
        id: 'scene-1',
        name: '机舱内部',
        assetKind: 'location',
        selectedImage: { id: 'img-scene', imageMediaId: 'c1111111-1111-4111-8111-111111111111', imageUrl: null },
        images: [],
      },
      {
        id: 'prop-1',
        name: '公文包',
        assetKind: 'prop',
        selectedImage: { id: 'img-prop', imageMediaId: 'd1111111-1111-4111-8111-111111111111', imageUrl: null },
        images: [],
      },
    ]),
  },
  task: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'task-1', ...data })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ videoModel: 'test-video-model' })),
  getUserModelConfig: vi.fn(async () => ({ videoModel: 'user-video-model' })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '720p',
    generateAudio: false,
    duration: 5,
    generationMode: 'normal',
  })),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async () => ({
    taskId: '77777777-7777-4777-8777-777777777777',
  })),
}))

vi.mock('@/lib/remake-projects/prompt/service', () => ({
  getAdoptedPromptForGeneration: vi.fn(async () => ({
    id: '66666666-6666-4666-8666-666666666666',
    integratedGenerationPrompt: 'character runs through alley',
  })),
}))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
vi.mock('@/lib/media/service', () => ({
  resolveMediaRef: vi.fn(async (id?: string, legacy?: string) => {
    const raw = id || legacy || ''
    if (UUID_RE.test(raw)) return { id: raw, storageKey: `storage/${raw}` }
    // Storage key -> simulate ensureMediaObjectFromStorageKey producing a uuid MediaObject.
    return { id: '99999999-9999-4999-8999-999999999999', storageKey: raw }
  }),
  ensureMediaObjectFromStorageKey: vi.fn(async (key: string) => ({ id: `media-${key}`, storageKey: key })),
}))

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `https://cdn.example.com/${key}?sig=1`),
}))

describe('remake video generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a valid submission descriptor with frozen ordered references', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-shot01-v1',
      selectedSlots: ['middle'],
      includeActionSheet: true,
      shotDurationSeconds: 4.2,
      options: { resolution: '720p' },
    })

    expect(descriptor.taskType).toBe('remake_video_generate')
    expect(descriptor.targetType).toBe('remake_shot')
    expect(descriptor.targetId).toBe(IDS.shotId)
    expect(descriptor.payload.kind).toBe('video')
    expect(descriptor.payload.operationKey).toBe('gen-shot01-v1')
    expect(descriptor.dedupeKey).toContain('gen-shot01-v1')
    expect(descriptor.payload.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(descriptor.payload.inputSnapshot.orderedReferences.length).toBe(2)
  })

  it('orders references Start->Middle->End->action-sheet regardless of client order (D-04)', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-order-test',
      selectedSlots: ['end', 'start', 'middle'],
      includeActionSheet: true,
      shotDurationSeconds: 3,
    })

    const roles = descriptor.payload.inputSnapshot.orderedReferences.map((r: { role: string }) => r.role)
    expect(roles).toEqual([
      'start_keyframe',
      'middle_keyframe',
      'end_keyframe',
      'action_sheet',
    ])
    const ordinals = descriptor.payload.inputSnapshot.orderedReferences.map((r: { ordinal: number }) => r.ordinal)
    expect(ordinals).toEqual([1, 2, 3, 4])
  })

  it('rejects submissions with no keyframe slots selected (D-03)', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    await expect(buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'bad-action-only',
      selectedSlots: [],
      includeActionSheet: true,
      shotDurationSeconds: 2,
    })).rejects.toThrow('REMAKE_VIDEO_NO_KEYFRAME_SELECTED')
  })

  it('rejects when no adopted video prompt exists', async () => {
    const { getAdoptedPromptForGeneration } = await import('@/lib/remake-projects/prompt/service')
    vi.mocked(getAdoptedPromptForGeneration).mockResolvedValueOnce(null)
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    await expect(buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'no-prompt',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 2,
    })).rejects.toThrow('REMAKE_VIDEO_PROMPT_NOT_APPROVED')
  })

  it('derives duration from shot duration with capability defaults (D-10)', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    const { resolveProjectModelCapabilityGenerationOptions } = await import('@/lib/config-service')

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'duration-test',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 6.1,
    })

    expect(resolveProjectModelCapabilityGenerationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: 'video',
        runtimeSelections: expect.objectContaining({ duration: expect.any(Number) }),
      }),
    )
    expect(descriptor.payload.inputSnapshot.durationSeconds).toBe(5)
  })

  it('freezes all parameters without mutating project defaults (D-07/D-12)', async () => {
    const { getProjectModelConfig } = await import('@/lib/config-service')
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    const before = vi.mocked(getProjectModelConfig).mock.calls.length
    await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'no-mutation',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 2,
      options: { duration: 10, resolution: '480p' },
    })
    expect(vi.mocked(getProjectModelConfig).mock.calls.length).toBe(before + 1)
  })

  it('fingerprint is deterministic and changes with any input change', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')

    const a = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'fp-test',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 3,
    })
    const b = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'fp-test',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 3,
    })

    expect(a.inputFingerprint).toBe(b.inputFingerprint)

    const c = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'fp-test',
      selectedSlots: ['middle'],
      includeActionSheet: true,
      shotDurationSeconds: 3,
    })
    expect(c.inputFingerprint).not.toBe(a.inputFingerprint)
  })
})

describe('remake video generation — omni-reference asset parity', () => {
  const assetBoundShot = {
    id: IDS.shotId,
    remakeProjectId: IDS.remakeProjectId,
    stableKey: 'shot-01',
    currentRevision: 1,
    sceneAssetId: 'scene-1',
    characterAssetIds: JSON.stringify(['char-1']),
    propAssetIds: JSON.stringify(['prop-1']),
    remakeProject: {
      projectId: IDS.projectId,
      currentSource: { sourceRevision: 1 },
    },
    revisions: [{
      id: IDS.revisionId,
      revision: 1,
      lifecycleState: 'active',
      sourceRevision: 1,
    }],
  }

  it('resolves bound scene/prop/character/voice assets into the frozen plan with Ark content[] mode', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(assetBoundShot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-assets',
      model: 'ark::doubao-seedance-2-0-260128',
      selectedSlots: ['start', 'middle', 'end'],
      includeActionSheet: true,
      includeCharacterImages: true,
      includeLocationImage: true,
      includePropImages: true,
      includeCharacterAudio: true,
      shotDurationSeconds: 4,
    })

    const refs = descriptor.payload.inputSnapshot.orderedReferences
    expect(refs.map((r: { role: string }) => r.role)).toEqual([
      'start_keyframe',
      'middle_keyframe',
      'end_keyframe',
      'action_sheet',
      'character_reference',
      'scene_reference',
      'prop_reference',
      'character_audio_reference',
    ])
    const byRole = Object.fromEntries(
      refs.map((r) => [r.role, r]),
    ) as Record<string, { role: string; label?: string; mediaId?: string; mediaType?: string }>
    expect(byRole.character_reference.label).toBe('角色 萨姆')
    expect(byRole.character_reference.mediaId).toBe('b1111111-1111-4111-8111-111111111111')
    expect(byRole.scene_reference.label).toBe('场景 机舱内部')
    expect(byRole.scene_reference.mediaId).toBe('c1111111-1111-4111-8111-111111111111')
    expect(byRole.prop_reference.label).toBe('物品 公文包')
    expect(byRole.prop_reference.mediaId).toBe('d1111111-1111-4111-8111-111111111111')
    expect(byRole.character_audio_reference.mediaType).toBe('audio')
    expect(byRole.character_audio_reference.mediaId).toBe('e1111111-1111-4111-8111-111111111111')

    expect(descriptor.payload.inputSnapshot.referenceMode).toBe('ark_content_multireference')
    const promptText = descriptor.payload.inputSnapshot.promptText
    expect(promptText).toContain('参考素材使用说明：')
    expect(promptText).toContain('@Image1（主画面参考关键帧 · Start 起始帧）')
    expect(promptText).toContain('@Image5（角色 萨姆）')
    expect(promptText).toContain('@Audio1（角色 萨姆 声音）')
  })

  it('skips asset categories that are toggled off or lack media', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(assetBoundShot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-no-assets',
      model: 'ark::doubao-seedance-2-0-260128',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      includeCharacterImages: false,
      includeLocationImage: false,
      includePropImages: false,
      includeCharacterAudio: false,
      shotDurationSeconds: 4,
    })

    const roles = descriptor.payload.inputSnapshot.orderedReferences.map((r: { role: string }) => r.role)
    expect(roles).toEqual(['middle_keyframe'])
  })

  it('degrades to composite_image_mvp without the reference suffix for non-Ark models', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(assetBoundShot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-degrade',
      model: 'openai::video-model',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 4,
    })

    expect(descriptor.payload.inputSnapshot.referenceMode).toBe('composite_image_mvp')
    expect(descriptor.payload.inputSnapshot.promptText).toBe('character runs through alley')
  })
})

describe('remake video generation — storage-key keyframe regression (REVIEW-01)', () => {
  const storageKeyShot = {
    id: IDS.shotId,
    remakeProjectId: IDS.remakeProjectId,
    stableKey: 'shot-01',
    currentRevision: 1,
    sceneAssetId: null,
    characterAssetIds: null,
    propAssetIds: null,
    remakeProject: {
      projectId: IDS.projectId,
      currentSource: { sourceRevision: 1 },
    },
    revisions: [{
      id: IDS.revisionId,
      revision: 1,
      lifecycleState: 'active',
      sourceRevision: 1,
    }],
  }

  it('normalizes keyframe output storage keys to a stable MediaObject uuid before freezing', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(storageKeyShot)
    prismaMock.remakeKeyframeTrack.findUnique.mockResolvedValueOnce({
      id: 'track-middle',
      slot: 'middle',
      adoptedCandidateId: 'cand-m',
      adoptedCandidate: {
        id: 'cand-m',
        outputVersion: {
          id: 'output-m',
          mediaId: 'images/remake/proj/keyframes-middle-abc123.jpg',
        },
      },
    })

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-storage-key',
      model: 'ark::doubao-seedance-2-0-260128',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      includeCharacterImages: false,
      includeLocationImage: false,
      includePropImages: false,
      includeCharacterAudio: false,
      shotDurationSeconds: 4,
    })

    const ref = descriptor.payload.inputSnapshot.orderedReferences[0]
    // mediaId must be a valid uuid (normalized from the storage key)
    expect(ref.mediaId).toBeDefined()
    expect(UUID_RE.test(ref.mediaId ?? '')).toBe(true)
    // raw storage key retained for currentness + traceability
    expect(ref.mediaUrl).toBe('images/remake/proj/keyframes-middle-abc123.jpg')
    expect(ref.role).toBe('middle_keyframe')
    expect(descriptor.payload.inputSnapshot.referenceMode).toBe('ark_content_multireference')
  })
})

describe('remake video generation — server-authoritative capability defaults', () => {
  it('defaults required capability fields (generationMode/generateAudio/resolution) when the client omits them', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    const { resolveProjectModelCapabilityGenerationOptions } = await import('@/lib/config-service')
    const shot = {
      id: IDS.shotId,
      remakeProjectId: IDS.remakeProjectId,
      stableKey: 'shot-01',
      currentRevision: 1,
      sceneAssetId: null,
      characterAssetIds: null,
      propAssetIds: null,
      remakeProject: { projectId: IDS.projectId, currentSource: { sourceRevision: 1 } },
      revisions: [{ id: IDS.revisionId, revision: 1, lifecycleState: 'active', sourceRevision: 1 }],
    }
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(shot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-defaults',
      model: 'ark::doubao-seedance-2-0-260128',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 4,
      options: {},
    })

    // Runtime selections passed to capability normalization must include the defaults.
    const runtimeCall = vi.mocked(resolveProjectModelCapabilityGenerationOptions).mock.calls.at(-1)
    expect(runtimeCall?.[0].runtimeSelections).toMatchObject({
      generationMode: 'normal',
      generateAudio: expect.any(Boolean),
      resolution: expect.any(String),
      duration: expect.any(Number),
    })
    // The frozen snapshot options must be complete so the worker/provider never see missing fields.
    expect(descriptor.payload.inputSnapshot.options).toMatchObject({
      generationMode: 'normal',
    })
  })
})

describe('remake video generation — r2v capability gate (REVIEW: seedance-1.5-pro)', () => {
  const plainShot = {
    id: IDS.shotId,
    remakeProjectId: IDS.remakeProjectId,
    stableKey: 'shot-01',
    currentRevision: 1,
    sceneAssetId: null,
    characterAssetIds: null,
    propAssetIds: null,
    remakeProject: { projectId: IDS.projectId, currentSource: { sourceRevision: 1 } },
    revisions: [{ id: IDS.revisionId, revision: 1, lifecycleState: 'active', sourceRevision: 1 }],
  }

  it('degrades to composite_image_mvp without the reference suffix for models that do not support r2v', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(plainShot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-15pro',
      model: 'ark::doubao-seedance-1-5-pro-251215',
      selectedSlots: ['middle'],
      includeActionSheet: true,
      includeCharacterImages: true,
      includeLocationImage: true,
      includePropImages: true,
      includeCharacterAudio: false,
      shotDurationSeconds: 4,
    })

    expect(descriptor.payload.inputSnapshot.referenceMode).toBe('composite_image_mvp')
    expect(descriptor.payload.inputSnapshot.promptText).toBe('character runs through alley')
    expect(descriptor.payload.inputSnapshot.promptText).not.toContain('参考素材使用说明')
  })

  it('keeps ark_content_multireference for Seedance 2.0 which supports r2v', async () => {
    const { buildVideoGenerationSubmission } = await import('@/lib/remake-projects/video/service')
    prismaMock.remakeShot.findFirst.mockResolvedValueOnce(plainShot)

    const descriptor = await buildVideoGenerationSubmission({
      projectId: IDS.projectId,
      userId: IDS.userId,
      shotId: IDS.shotId,
      operationKey: 'gen-20',
      model: 'ark::doubao-seedance-2-0-260128',
      selectedSlots: ['middle'],
      includeActionSheet: false,
      shotDurationSeconds: 4,
    })

    expect(descriptor.payload.inputSnapshot.referenceMode).toBe('ark_content_multireference')
    expect(descriptor.payload.inputSnapshot.promptText).toContain('参考素材使用说明：')
  })
})

describe('remake video route request schema', () => {
  const generateSchema = z.object({
    action: z.literal('generate'),
    shotId: z.string().uuid(),
    operationKey: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).optional(),
    options: z.record(z.unknown()).default({}),
    selectedSlots: z.array(z.enum(['start', 'middle', 'end'])).min(1).max(3),
    includeActionSheet: z.boolean().default(false),
    shotDurationSeconds: z.number().min(0.1),
  }).strict()

  it('accepts a valid generate request', () => {
    const result = generateSchema.safeParse({
      action: 'generate',
      shotId: IDS.shotId,
      operationKey: 'gen-001',
      selectedSlots: ['middle'],
      includeActionSheet: true,
      shotDurationSeconds: 5.2,
    })
    expect(result.success).toBe(true)
  })

  it('rejects request with empty selectedSlots', () => {
    const result = generateSchema.safeParse({
      action: 'generate',
      shotId: IDS.shotId,
      operationKey: 'gen-001',
      selectedSlots: [],
      includeActionSheet: false,
      shotDurationSeconds: 2,
    })
    expect(result.success).toBe(false)
  })
})
