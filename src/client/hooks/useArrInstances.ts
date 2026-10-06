import { useMinLoading } from '@/hooks/useMinLoading'
import type { ArrTarget } from '@/lib/approval'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function useArrInstances(type: ArrTarget['type']) {
  const radarr = useMinLoading(
    $api.useQuery('get', '/v1/radarr/instances', undefined, {
      enabled: type === 'radarr',
    }),
  )
  const sonarr = useMinLoading(
    $api.useQuery('get', '/v1/sonarr/instances', undefined, {
      enabled: type === 'sonarr',
    }),
  )
  const query = type === 'radarr' ? radarr : sonarr

  const targets: ArrTarget[] =
    type === 'radarr'
      ? (radarr.data ?? []).map((instance) => ({ type, instance }))
      : (sonarr.data ?? []).map((instance) => ({ type, instance }))

  return {
    targets,
    defaultTarget: targets.find(({ instance }) => instance.isDefault) ?? null,
    findTarget: (id: number) =>
      targets.find(({ instance }) => instance.id === id) ?? null,
    hasData: query.data !== undefined,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Instances failed to load.')
      : null,
  }
}
