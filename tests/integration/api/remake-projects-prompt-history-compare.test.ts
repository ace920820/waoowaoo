import { describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  remakePromptTrack: { findFirst: vi.fn(async () => ({
    id: '22222222-2222-4222-8222-222222222222', targetKey: 'image:start', adoptedVersionId: '33333333-3333-4333-8333-333333333333',
    versions: [
      { id: '44444444-4444-4444-8444-444444444444', versionNumber: 2, status: 'pending_review', runId: null, integratedGenerationPrompt: 'latest', negativeConstraints: ['blur'], parsedSections: {}, rawOutput: 'raw', inputSnapshot: {}, createdAt: new Date('2026-08-09'), skillVersion: null, schemaVersion: null, modelVersion: null, executorVersion: null, taskId: null, invalidatedAt: null },
      { id: '33333333-3333-4333-8333-333333333333', versionNumber: 1, status: 'approved', runId: 'run-1', integratedGenerationPrompt: 'adopted', negativeConstraints: [], parsedSections: {}, rawOutput: 'old raw', inputSnapshot: {}, createdAt: new Date('2026-08-08'), skillVersion: '1', schemaVersion: '1', modelVersion: 'm', executorVersion: 'e', taskId: 'task-1', invalidatedAt: null },
    ],
  })) },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('remake prompt track history projection', () => {
  it('keeps raw output out of history while returning exactly two selected versions for comparison', async () => {
    const { getPromptTrackDetail } = await import('@/lib/remake-projects/prompt/service')
    const result = await getPromptTrackDetail({ projectId: '11111111-1111-4111-8111-111111111111', userId: 'user-1', trackId: '22222222-2222-4222-8222-222222222222', versionIds: ['44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333'] })

    expect(result?.history).toEqual([expect.not.objectContaining({ rawOutput: expect.anything() }), expect.not.objectContaining({ rawOutput: expect.anything() })])
    expect(result?.selected).toHaveLength(2)
    expect(result?.selected.map((version) => version.isAdopted)).toEqual([false, true])
  })
})
