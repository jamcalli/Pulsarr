import type { UserWithCount } from '@root/schemas/users/users-list.schema'
import { queryClient } from '@/lib/queryClient'
import { $api } from '@/lib/tanstackApi'

const plexUserKeys = {
  users: $api.queryOptions('get', '/v1/users/list/with-counts').queryKey,
  quotaConfigs: $api.queryOptions('get', '/v1/quota/users').queryKey,
  // Prefix key: matches every body variant of the bulk status query
  quotaStatuses: ['post', '/v1/quota/users/status/bulk'] as const,
  userStatus: $api.queryOptions('get', '/v1/plex/user-status').queryKey,
}

// Mirrors the old store's 5s cache window between refetches
const USER_DATA_STALE_TIME = 5000

function invalidateQuotaData() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: plexUserKeys.quotaConfigs }),
    queryClient.invalidateQueries({ queryKey: plexUserKeys.quotaStatuses }),
  ])
}

export function invalidateUserData() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: plexUserKeys.users }),
    queryClient.invalidateQueries({ queryKey: plexUserKeys.userStatus }),
    invalidateQuotaData(),
  ])
}

export function useUsers() {
  return $api.useQuery(
    'get',
    '/v1/users/list/with-counts',
    {},
    { staleTime: USER_DATA_STALE_TIME },
  )
}

/**
 * The user list, or null before the first load.
 */
export function useUserList(): UserWithCount[] | null {
  const { data } = useUsers()
  return data?.users ?? null
}

export function useSelfWatchlistInfo(): UserWithCount | null {
  const users = useUserList()
  return users?.find((user) => user.is_primary_token) ?? null
}

export function useOthersWatchlistInfo(): {
  users: UserWithCount[]
  totalCount: number
} | null {
  const users = useUserList()
  const otherUsers = users?.filter((user) => !user.is_primary_token) ?? []

  return otherUsers.length > 0
    ? {
        users: otherUsers,
        totalCount: otherUsers.reduce(
          (acc, user) => acc + (user.watchlist_count || 0),
          0,
        ),
      }
    : null
}
