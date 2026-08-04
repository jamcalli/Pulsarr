import type { ArrApp } from '@/features/arr/types'
import { queryClient } from '@/lib/queryClient'
import { $api } from '@/lib/tanstackApi'

export function invalidateArrInstances(app: ArrApp) {
  return queryClient.invalidateQueries({
    queryKey:
      app === 'sonarr'
        ? $api.queryOptions('get', '/v1/sonarr/instances').queryKey
        : $api.queryOptions('get', '/v1/radarr/instances').queryKey,
  })
}
