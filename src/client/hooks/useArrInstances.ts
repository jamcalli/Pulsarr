import { useMinLoading } from '@/hooks/useMinLoading'
import { type ArrTarget, isConfiguredTarget } from '@/lib/approval'
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

  const defaultTarget =
    targets.find(({ instance }) => instance.isDefault) ?? null

  return {
    targets,
    defaultTarget,
    configuredTargets: targets.filter(isConfiguredTarget),
    /** Null when there is no default or it is the unconfigured placeholder. */
    configuredDefault:
      defaultTarget && isConfiguredTarget(defaultTarget) ? defaultTarget : null,
    findTarget: (id: number) =>
      targets.find(({ instance }) => instance.id === id) ?? null,
    hasData: query.data !== undefined,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Instances failed to load.')
      : null,
    retry: () => void query.refetch(),
  }
}
