import { useQueries } from '@tanstack/react-query'
import { useArrInstances } from '@/hooks/useArrInstances'
import { type ArrTarget, isConfiguredTarget } from '@/lib/approval'
import { $api } from '@/lib/tanstackApi'

export function useQualityProfileNames(
  type: ArrTarget['type'],
  instanceIds: readonly number[],
) {
  const instances = useArrInstances(type)
  const connectedIds = [...new Set(instanceIds)].filter((id) => {
    const target = instances.findTarget(id)
    return target !== null && isConfiguredTarget(target)
  })
  const profileQueries = useQueries({
    queries: connectedIds.map((instanceId) =>
      $api.queryOptions(
        'get',
        type === 'radarr'
          ? '/v1/radarr/quality-profiles'
          : '/v1/sonarr/quality-profiles',
        { params: { query: { instanceId } } },
      ),
    ),
  })

  return {
    isLoading:
      instances.isLoading || profileQueries.some((query) => query.isLoading),
    /** Null while loading or when the instance has no profile with that id. */
    profileName: (instanceId: number, profile: string | number) => {
      const index = connectedIds.indexOf(instanceId)
      const profiles = profileQueries[index]?.data?.qualityProfiles ?? []
      return (
        profiles.find((candidate) => String(candidate.id) === String(profile))
          ?.name ?? null
      )
    },
  }
}
