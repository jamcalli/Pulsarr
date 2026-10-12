import { useQuery } from '@tanstack/react-query'
import type { ArrCredentials } from '@/features/library/hooks/instances/useConnectionTest'
import type { ArrType } from '@/features/library/lib/instances/instance-form'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { useMinLoading } from '@/hooks/useMinLoading'
import { toArrOptions } from '@/lib/arr-options'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

/** A saved instance reads by id, a new one by the credentials of its passed test, null until it passes. */
export type RoutingSource =
  | { kind: 'saved'; id: number }
  | { kind: 'probe'; credentials: ArrCredentials | null }

async function probe(type: ArrType, body: ArrCredentials) {
  const { data, error } =
    type === 'radarr'
      ? await apiFetch.POST('/v1/radarr/probe', { body })
      : await apiFetch.POST('/v1/sonarr/probe', { body })
  if (error) throw error
  return data
}

export function useRoutingOptions(type: ArrType, source: RoutingSource) {
  const saved = useArrInstanceOptions(
    type,
    source.kind === 'saved' ? source.id : null,
    source.kind === 'saved',
  )
  const credentials = source.kind === 'probe' ? source.credentials : null
  const probed = useMinLoading(
    useQuery({
      queryKey: ['instance-probe', type, credentials],
      queryFn: () => (credentials ? probe(type, credentials) : null),
      enabled: credentials !== null,
      retry: false,
    }),
  )

  if (source.kind === 'saved') {
    return {
      qualityProfiles: saved.qualityProfiles,
      rootFolders: saved.rootFolders,
      tags: saved.tags,
      ready: !saved.isLoading && saved.errorMessage === null,
      errorMessage: saved.errorMessage,
      retrying: saved.retrying,
      retry: saved.retry,
    }
  }
  const data = probed.data ?? null
  return {
    ...toArrOptions({
      qualityProfiles: data?.qualityProfiles,
      rootFolders: data?.rootFolders,
      tags: data?.tags,
    }),
    ready: data !== null,
    errorMessage: probed.isError
      ? (apiErrorMessage(probed.error) ?? 'Options failed to load.')
      : null,
    retrying: probed.isError && probed.isFetching,
    retry: () => void probed.refetch(),
  }
}
