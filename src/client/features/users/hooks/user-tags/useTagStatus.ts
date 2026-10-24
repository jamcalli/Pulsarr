import { useMinLoading } from '@/hooks/useMinLoading'
import { queryClient } from '@/lib/queryClient'
import { $api } from '@/lib/tanstackApi'

const tagStatusKey = $api.queryOptions('get', '/v1/tags/status').queryKey

export function invalidateTagStatus() {
  return queryClient.invalidateQueries({ queryKey: tagStatusKey })
}

export function useTagStatus() {
  const query = useMinLoading($api.useQuery('get', '/v1/tags/status'))
  const instances = query.data?.instances ?? []
  const tagsExist = query.data?.tagsExist ?? false
  const unreachable = instances.find((instance) => !instance.reachable)
  const lockReason = tagsExist
    ? 'Delete the existing tag definitions to change the format.'
    : unreachable
      ? `Can't verify tags while ${unreachable.name} is unreachable.`
      : null

  return {
    loaded: query.data !== undefined && !query.isError,
    tagsExist,
    locked: lockReason !== null,
    lockReason,
    tagTotal: instances.reduce((sum, instance) => sum + instance.tagCount, 0),
    taggedItemTotal: instances.reduce(
      (sum, instance) => sum + instance.taggedItemCount,
      0,
    ),
    instanceCount: instances.length,
    invalidate: invalidateTagStatus,
  }
}
