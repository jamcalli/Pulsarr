import type { CreatableOption } from '@/hooks/useCreatableOptions'
import type { ArrTarget } from '@/lib/approval'
import { queryClient } from '@/lib/queryClient'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

/** Rejects with an Error carrying a display message, so `TagsField` can show it. */
export function useCreateArrTag(
  type: ArrTarget['type'],
  instanceId: number | null,
) {
  const mutation = $api.useMutation(
    'post',
    type === 'radarr' ? '/v1/radarr/create-tag' : '/v1/sonarr/create-tag',
  )

  return async (label: string): Promise<CreatableOption> => {
    if (instanceId === null) {
      throw new Error('Choose an instance before you create a tag.')
    }
    try {
      const tag = await mutation.mutateAsync({ body: { instanceId, label } })
      await queryClient.invalidateQueries({
        queryKey: $api.queryOptions(
          'get',
          type === 'radarr' ? '/v1/radarr/tags' : '/v1/sonarr/tags',
          { params: { query: { instanceId } } },
        ).queryKey,
      })
      return { value: String(tag.id), label: tag.label }
    } catch (error) {
      throw new Error(
        mutationErrorMessage(error, 'Tag could not be created. Try again.'),
      )
    }
  }
}
