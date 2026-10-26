import { configuredIds } from '@/features/system/lib/plex-connection/library-refresh'
import { useConfig } from '@/hooks/useConfig'
import { $api, firstLoadError, isSettled } from '@/lib/tanstackApi'

export function usePlexConnectionPage() {
  const config = useConfig()
  const users = $api.useQuery('get', '/v1/users/list/with-counts')
  const pass = $api.useQuery('get', '/v1/plex/plex-pass-status')
  const radarr = $api.useQuery('get', '/v1/radarr/instances')
  const sonarr = $api.useQuery('get', '/v1/sonarr/instances')
  const queries = [users, pass, radarr, sonarr]
  const settled =
    isSettled(users) &&
    isSettled(pass) &&
    isSettled(radarr) &&
    isSettled(sonarr)

  return {
    config: config.config,
    users: users.data?.users ?? null,
    hasPlexPass: pass.data?.hasPlexPass ?? false,
    configured: {
      radarr: configuredIds(radarr.data ?? []),
      sonarr: configuredIds(sonarr.data ?? []),
    },
    isReady: config.isReady && settled,
    errorMessage:
      config.error ??
      firstLoadError(queries, "Couldn't load the Plex connection."),
    retry: () => {
      if (config.isError) void config.initialize(true)
      for (const query of queries) {
        if (query.isError) void query.refetch()
      }
    },
  }
}

export type PlexConnectionPage = ReturnType<typeof usePlexConnectionPage>
