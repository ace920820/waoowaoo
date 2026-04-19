import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { requestJsonWithError } from './mutation-shared'

export function useEnsureEpisodeMultiShotDrafts(projectId: string, episodeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload?: { episodeId?: string }) => {
      return await requestJsonWithError(
        `/api/novel-promotion/${projectId}/multi-shot-drafts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId: payload?.episodeId || episodeId }),
        },
        '创建多镜头片段草稿失败',
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
    },
  })
}
