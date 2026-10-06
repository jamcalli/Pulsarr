import { useArrInstances } from '@/hooks/useArrInstances'
import { useMinLoading } from '@/hooks/useMinLoading'
import type { ArrTarget } from '@/lib/approval'
import { ARR_API_KEY_PLACEHOLDER } from '@/lib/constants'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function useArrInstanceOptions(
  type: ArrTarget['type'],
  instanceId: number | null,
  enabled: boolean,
) {
  const instances = useArrInstances(type)
  const target = instanceId === null ? null : instances.findTarget(instanceId)
  const connected =
    target !== null && target.instance.apiKey !== ARR_API_KEY_PLACEHOLDER
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

  return {
    connected,
    qualityProfiles: (profilesQuery.data?.qualityProfiles ?? []).map(
      (profile) => ({ value: String(profile.id), label: profile.name }),
    ),
    rootFolders: (foldersQuery.data?.rootFolders ?? []).map((folder) => ({
      value: folder.path,
      label: folder.path,
    })),
    tags: (tagsQuery.data?.tags ?? []).map((tag) => ({
      value: String(tag.id),
      label: tag.label,
    })),
    isLoading:
      instances.isLoading ||
      profilesQuery.isLoading ||
      foldersQuery.isLoading ||
      tagsQuery.isLoading,
    errorMessage: notConnected
      ? 'This instance is not connected. Check its API key.'
      : (queryError ?? null),
  }
}
