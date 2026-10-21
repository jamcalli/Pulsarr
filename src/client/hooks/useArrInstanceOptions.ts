import { useArrInstances } from '@/hooks/useArrInstances'
import { useMinDuration, useMinLoading } from '@/hooks/useMinLoading'
import { type ArrTarget, isConfiguredTarget } from '@/lib/approval'
import { toArrOptions } from '@/lib/arr-options'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function useArrInstanceOptions(
  type: ArrTarget['type'],
  instanceId: number | null,
  enabled: boolean,
) {
  const instances = useArrInstances(type)
  const target = instanceId === null ? null : instances.findTarget(instanceId)
  const connected = target !== null && isConfiguredTarget(target)
  const notConnected = instances.hasData && instanceId !== null && !connected

  const params = { params: { query: { instanceId: instanceId ?? -1 } } }
  const options = { enabled: enabled && connected }
  const profilesQuery = useMinLoading(
    $api.useQuery(
      'get',
      type === 'radarr'
        ? '/v1/radarr/quality-profiles'
        : '/v1/sonarr/quality-profiles',
      params,
      options,
    ),
  )
  const foldersQuery = useMinLoading(
    $api.useQuery(
      'get',
      type === 'radarr' ? '/v1/radarr/root-folders' : '/v1/sonarr/root-folders',
      params,
      options,
    ),
  )
  const tagsQuery = useMinLoading(
    $api.useQuery(
      'get',
      type === 'radarr' ? '/v1/radarr/tags' : '/v1/sonarr/tags',
      params,
      options,
    ),
  )

  const queryError = [
    instances.errorMessage,
    ...[profilesQuery, foldersQuery, tagsQuery].map((query) =>
      query.isError
        ? (apiErrorMessage(query.error) ?? 'Instance options failed to load.')
        : null,
    ),
  ].find((message) => message !== null)

  const retrying = useMinDuration(
    [profilesQuery, foldersQuery, tagsQuery].some(
      (query) => query.isError && query.isFetching,
    ),
  )

  return {
    connected,
    ...toArrOptions({
      qualityProfiles: profilesQuery.data?.qualityProfiles,
      rootFolders: foldersQuery.data?.rootFolders,
      tags: tagsQuery.data?.tags,
    }),
    isLoading:
      instances.isLoading ||
      profilesQuery.isLoading ||
      foldersQuery.isLoading ||
      tagsQuery.isLoading,
    errorMessage: notConnected
      ? 'This instance is not connected. Check its API key.'
      : (queryError ?? null),
    retrying,
    retry: () => {
      for (const query of [profilesQuery, foldersQuery, tagsQuery]) {
        if (query.isError) void query.refetch()
      }
    },
  }
}
