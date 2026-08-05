import { useCallback } from 'react'
import type { ArrApp } from '@/features/arr/types'
import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

/**
 * Fetches root folders and quality profiles for a single instance. Queries are
 * keyed per app and instance id, so any number of components share the cache.
 */
export function useArrInstanceData(
  app: ArrApp,
  instanceId: number | null | undefined,
  enabled = true,
) {
  const id = instanceId ?? -1
  const queryEnabled = enabled && id > 0

  const foldersQuery = useMinLoading(
    $api.useQuery(
      'get',
      app === 'sonarr' ? '/v1/sonarr/root-folders' : '/v1/radarr/root-folders',
      { params: { query: { instanceId: id } } },
      { enabled: queryEnabled },
    ),
  )
  const profilesQuery = useMinLoading(
    $api.useQuery(
      'get',
      app === 'sonarr'
        ? '/v1/sonarr/quality-profiles'
        : '/v1/radarr/quality-profiles',
      { params: { query: { instanceId: id } } },
      { enabled: queryEnabled },
    ),
  )

  const rootFolders = foldersQuery.data?.rootFolders ?? []
  const qualityProfiles = profilesQuery.data?.qualityProfiles ?? []

  const foldersRefetch = foldersQuery.refetch
  const profilesRefetch = profilesQuery.refetch
  const refetch = useCallback(async () => {
    await Promise.all([foldersRefetch(), profilesRefetch()])
  }, [foldersRefetch, profilesRefetch])

  return {
    rootFolders,
    qualityProfiles,
    hasData:
      foldersQuery.data !== undefined && profilesQuery.data !== undefined,
    isLoading: foldersQuery.isLoading || profilesQuery.isLoading,
    refetch,
  }
}
