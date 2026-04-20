import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query/keys'
import { requestJsonWithError } from '@/lib/query/mutations/mutation-shared'

const runtime = vi.hoisted(() => {
  const invalidateQueries = vi.fn(async () => undefined)
  return {
    invalidateQueries,
    useQueryClientMock: vi.fn(() => ({ invalidateQueries })),
    useMutationMock: vi.fn((options: unknown) => options),
    requestJsonWithErrorMock: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: runtime.useQueryClientMock,
  useMutation: (options: unknown) => runtime.useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', () => ({
  requestJsonWithError: runtime.requestJsonWithErrorMock,
}))

describe('useEnsureEpisodeMultiShotDrafts', () => {
  beforeEach(() => {
    runtime.invalidateQueries.mockClear()
    runtime.useMutationMock.mockClear()
    runtime.requestJsonWithErrorMock.mockReset()
    runtime.requestJsonWithErrorMock.mockResolvedValue({ success: true })
  })

  it('posts to the batch route and invalidates episode data after completion', async () => {
    const { useEnsureEpisodeMultiShotDrafts } = await import('@/lib/query/mutations/multi-shot-draft-mutations')
    const mutation = useEnsureEpisodeMultiShotDrafts('project-1', 'episode-1') as unknown as {
      mutationFn: (payload: { episodeId: string }) => Promise<unknown>
      onSettled: () => void
    }

    await mutation.mutationFn({ episodeId: 'episode-1' })
    mutation.onSettled()

    expect(requestJsonWithError).toHaveBeenCalledWith(
      '/api/novel-promotion/project-1/multi-shot-drafts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: 'episode-1' }),
      },
      '创建多镜头片段草稿失败',
    )
    expect(runtime.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.episodeData('project-1', 'episode-1'),
    })
  })
})
