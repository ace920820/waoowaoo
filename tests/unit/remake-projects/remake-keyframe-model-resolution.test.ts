import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const resolveProjectModelCapabilityGenerationOptions = vi.fn(async () => ({ resolution: '1024x1024' }))
  const getProjectModelConfig = vi.fn(async () => ({ storyboardModel: 'project::storyboard-model' }))
  const getUserModelConfig = vi.fn(async () => ({ storyboardModel: 'user::storyboard-model' }))
  return {
    resolveProjectModelCapabilityGenerationOptions,
    getProjectModelConfig,
    getUserModelConfig,
    getAdoptedPromptForGeneration: vi.fn(async () => ({ id: '55555555-5555-4555-8555-555555555555', integratedGenerationPrompt: 'a prompt' })),
    projectFindFirst: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
    shotFindFirst: vi.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333', currentRevision: 1, stableKey: 'shot-1', remakeProjectId: '22222222-2222-4222-8222-222222222222',
      remakeProject: { currentSource: { sourceRevision: 1 } },
      revisions: [{ id: '44444444-4444-4444-8444-444444444444', revision: 1, sourceRevision: 1, lifecycleState: 'active' }],
    })),
    trackFindUnique: vi.fn(async () => ({ id: 'track-1', selectedForGeneration: true })),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    remakeShot: { findFirst: mocks.shotFindFirst },
    remakeKeyframeTrack: { findUnique: mocks.trackFindUnique },
  },
}))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: mocks.getProjectModelConfig,
  getUserModelConfig: mocks.getUserModelConfig,
  resolveProjectModelCapabilityGenerationOptions: mocks.resolveProjectModelCapabilityGenerationOptions,
}))
vi.mock('@/lib/remake-projects/prompt/service', () => ({ getAdoptedPromptForGeneration: mocks.getAdoptedPromptForGeneration }))
vi.mock('@/lib/storage', () => ({ getSignedUrl: vi.fn(() => '/signed') }))
vi.mock('@/lib/media/service', () => ({ resolveMediaRef: vi.fn() }))

describe('keyframe model resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  const base = {
    projectId: '11111111-1111-4111-8111-111111111111', userId: 'user-1', shotId: '33333333-3333-4333-8333-333333333333', slot: 'start',
    operationKey: 'generate-1', count: 1, options: {},
    referenceMediaIds: [],
  }

  it('uses the project storyboardModel over the user model', async () => {
    const { buildKeyframeGenerationSubmission } = await import('@/lib/remake-projects/keyframes/service')
    await buildKeyframeGenerationSubmission({ ...base, model: '' })
    expect(mocks.getProjectModelConfig).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'user-1')
    expect(mocks.resolveProjectModelCapabilityGenerationOptions).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'project::storyboard-model' }))
  })

  it('explicit model takes precedence over project config', async () => {
    const { buildKeyframeGenerationSubmission } = await import('@/lib/remake-projects/keyframes/service')
    await buildKeyframeGenerationSubmission({ ...base, model: 'explicit::model' })
    expect(mocks.resolveProjectModelCapabilityGenerationOptions).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'explicit::model' }))
  })
})
