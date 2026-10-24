import { keepPreviousData } from '@tanstack/react-query'
import { useMemo } from 'react'
import type {
  PlexUser,
  PlexUserRow,
} from '@/features/users/lib/plex-users/user-rows'
import { invalidatePlexUsers } from '@/features/users/lib/users-queries'
import { useMinLoading } from '@/hooks/useMinLoading'
import { useProgressEvents } from '@/hooks/useProgressEvents'
import { $api, firstLoadError, isSettled } from '@/lib/tanstackApi'
import type { components, paths } from '@/types/api.js'

type QuotaStatus = components['schemas']['UserQuotaStatus']
type BulkStatusData =
  paths['/v1/quota/users/status/bulk']['post']['responses'][200]['content']['application/json']

function statusesByUser(
  data: BulkStatusData | undefined,
): Map<number, QuotaStatus> {
  return new Map(
    (data?.quotaStatuses ?? []).flatMap(({ userId, quotaStatus }) =>
      quotaStatus ? [[userId, quotaStatus] as const] : [],
    ),
  )
}

function joinRows(
  users: PlexUser[],
  movie: BulkStatusData | undefined,
  show: BulkStatusData | undefined,
): PlexUserRow[] {
  const movies = statusesByUser(movie)
  const shows = statusesByUser(show)
  return users.map((user) => ({
    user,
    quotas: {
      movie: movies.get(user.id) ?? null,
      show: shows.get(user.id) ?? null,
    },
  }))
}

export function usePlexUsersList() {
  const users = useMinLoading(
    $api.useQuery('get', '/v1/users/list/with-counts'),
  )
  const userIds = useMemo(
    () => users.data?.users.map((user) => user.id) ?? [],
    [users.data],
  )
  const hasUsers = userIds.length > 0
  const movieStatus = useMinLoading(
    $api.useQuery(
      'post',
      '/v1/quota/users/status/bulk',
      { body: { userIds, contentType: 'movie' } },
      { enabled: hasUsers, placeholderData: keepPreviousData },
    ),
  )
  const showStatus = useMinLoading(
    $api.useQuery(
      'post',
      '/v1/quota/users/status/bulk',
      { body: { userIds, contentType: 'show' } },
      { enabled: hasUsers, placeholderData: keepPreviousData },
    ),
  )
  const plexStatus = useMinLoading($api.useQuery('get', '/v1/plex/user-status'))
  useProgressEvents('users', invalidatePlexUsers)

  const rows = useMemo(
    () =>
      users.data
        ? joinRows(users.data.users, movieStatus.data, showStatus.data)
        : null,
    [users.data, movieStatus.data, showStatus.data],
  )

  const queries = [users, movieStatus, showStatus, plexStatus]

  return {
    rows,
    untracked: plexStatus.data?.untracked ?? [],
    isLoading: queries.some((query) => query.isLoading),
    isReady:
      isSettled(users) &&
      (!hasUsers || (isSettled(movieStatus) && isSettled(showStatus))) &&
      isSettled(plexStatus),
    errorMessage: firstLoadError(queries, "Couldn't load the users."),
    retry: () => void invalidatePlexUsers(),
  }
}
