import type {
  PlexFriendStatus,
  UserStatusResponse,
} from '@root/schemas/plex/user-status.schema'
import type {
  QuotaStatusResponse,
  UserQuotaResponse,
} from '@root/schemas/quota/quota.schema'
import type { UserWithCount } from '@root/schemas/users/users-list.schema'
import { useMutation } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { z } from 'zod'
import type { plexUserSchema } from '@/features/plex/store/schemas'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'

export type UserWatchlistInfo = UserWithCount

// Type for quota with both config and status data
type QuotaWithStatus = UserQuotaResponse & {
  currentUsage?: number
  exceeded?: boolean
  resetDate?: string | null
  watchlistUsage?: number | null
  watchlistCapExceeded?: boolean
}

export type UserQuotas = {
  userId: number
  movieQuota?: QuotaWithStatus
  showQuota?: QuotaWithStatus
}

export type UserWithQuotaInfo = UserWatchlistInfo & {
  userQuotas: UserQuotas | null
  friendStatus?: PlexFriendStatus
  pendingSince?: string | null
  isTracked?: boolean
}

export const plexUserKeys = {
  users: $api.queryOptions('get', '/v1/users/users/list/with-counts').queryKey,
  quotaConfigs: $api.queryOptions('get', '/v1/quota/users').queryKey,
  // Prefix key: matches every body variant of the bulk status query
  quotaStatuses: ['post', '/v1/quota/users/status/bulk'] as const,
  userStatus: $api.queryOptions('get', '/v1/plex/user-status').queryKey,
}

// Mirrors the old store's 5s cache window between refetches
const USER_DATA_STALE_TIME = 5000

export function invalidateQuotaData() {
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
    '/v1/users/users/list/with-counts',
    {},
    { staleTime: USER_DATA_STALE_TIME },
  )
}

/**
 * The user list, or null before the first load.
 */
export function useUserList(): UserWatchlistInfo[] | null {
  const { data } = useUsers()
  return data?.users ?? null
}

export function useSelfWatchlistInfo(): UserWatchlistInfo | null {
  const users = useUserList()
  return users?.find((user) => user.is_primary_token) ?? null
}

export function useOthersWatchlistInfo(): {
  users: UserWatchlistInfo[]
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

function mapStatusesByUser(
  data:
    | {
        quotaStatuses: Array<{
          userId: number
          quotaStatus: QuotaStatusResponse | null
        }>
      }
    | undefined,
): Map<number, QuotaStatusResponse> {
  const statuses = new Map<number, QuotaStatusResponse>()
  for (const item of data?.quotaStatuses ?? []) {
    if (item.quotaStatus) {
      statuses.set(item.userId, item.quotaStatus)
    }
  }
  return statuses
}

function mergeStatus(
  quota: QuotaWithStatus | undefined,
  status: QuotaStatusResponse | undefined,
): QuotaWithStatus | undefined {
  if (!quota || !status) return quota
  return {
    ...quota,
    currentUsage: status.currentUsage,
    exceeded: status.exceeded,
    resetDate: status.resetDate,
    watchlistUsage: status.watchlistUsage,
    watchlistCapExceeded: status.watchlistCapExceeded,
  }
}

/**
 * Users enriched with quota configs, quota usage statuses, and Plex friend
 * status, including synthetic entries for untracked Plex friends, derived
 * from four cached queries.
 */
export function useUsersWithQuota() {
  const usersQuery = useUsers()
  const users = usersQuery.data?.users

  const userIds = useMemo(() => users?.map((user) => user.id) ?? [], [users])

  const quotaConfigsQuery = $api.useQuery(
    'get',
    '/v1/quota/users',
    {},
    { staleTime: USER_DATA_STALE_TIME },
  )
  const movieStatusQuery = $api.useQuery(
    'post',
    '/v1/quota/users/status/bulk',
    { body: { userIds, contentType: 'movie' } },
    { enabled: userIds.length > 0, staleTime: USER_DATA_STALE_TIME },
  )
  const showStatusQuery = $api.useQuery(
    'post',
    '/v1/quota/users/status/bulk',
    { body: { userIds, contentType: 'show' } },
    { enabled: userIds.length > 0, staleTime: USER_DATA_STALE_TIME },
  )
  const userStatusQuery = $api.useQuery(
    'get',
    '/v1/plex/user-status',
    {},
    { staleTime: USER_DATA_STALE_TIME },
  )

  const usersWithQuota = useMemo<UserWithQuotaInfo[] | null>(() => {
    if (!users) return null

    const quotaConfigsByUser = new Map<
      number,
      { movieQuota?: QuotaWithStatus; showQuota?: QuotaWithStatus }
    >()
    for (const config of quotaConfigsQuery.data?.userQuotas ?? []) {
      if (!quotaConfigsByUser.has(config.userId)) {
        quotaConfigsByUser.set(config.userId, {})
      }
      const userConfigs = quotaConfigsByUser.get(config.userId)
      if (!userConfigs) continue

      const quota: QuotaWithStatus = {
        userId: config.userId,
        contentType: config.contentType,
        quotaType: config.quotaType,
        quotaLimit: config.quotaLimit,
        bypassApproval: config.bypassApproval,
        watchlistCap: config.watchlistCap,
      }
      if (config.contentType === 'movie') {
        userConfigs.movieQuota = quota
      } else if (config.contentType === 'show') {
        userConfigs.showQuota = quota
      }
    }

    const movieStatuses = mapStatusesByUser(movieStatusQuery.data)
    const showStatuses = mapStatusesByUser(showStatusQuery.data)

    const status: UserStatusResponse | undefined = userStatusQuery.data
    const classifiedByUuid = status
      ? new Map(status.users.map((info) => [info.uuid, info]))
      : null

    const enriched: UserWithQuotaInfo[] = users.map((user) => {
      const userQuotaConfig = quotaConfigsByUser.get(user.id)
      const userQuotas: UserQuotas | null = userQuotaConfig
        ? {
            userId: user.id,
            movieQuota: mergeStatus(
              userQuotaConfig.movieQuota,
              movieStatuses.get(user.id),
            ),
            showQuota: mergeStatus(
              userQuotaConfig.showQuota,
              showStatuses.get(user.id),
            ),
          }
        : null

      if (!classifiedByUuid) {
        return { ...user, userQuotas }
      }

      const uuid = user.plex_uuid
      if (uuid && classifiedByUuid.has(uuid)) {
        const info = classifiedByUuid.get(uuid)
        return {
          ...user,
          userQuotas,
          friendStatus: info?.status ?? 'friend_only',
          pendingSince: info?.pendingSince ?? null,
          isTracked: true,
        }
      }
      // Tracked user not found in status response
      return {
        ...user,
        userQuotas,
        friendStatus: user.is_primary_token
          ? ('self' as const)
          : ('friend' as const),
        pendingSince: null,
        isTracked: true,
      }
    })

    // Add untracked users as synthetic entries
    for (const untracked of status?.untracked ?? []) {
      enriched.push({
        id: 0,
        name: untracked.username,
        apprise: null,
        alias: null,
        discord_id: null,
        notify_apprise: false,
        notify_discord: false,
        notify_discord_mention: false,
        notify_plex_mobile: false,
        can_sync: false,
        requires_approval: false,
        is_primary_token: false,
        plex_uuid: untracked.uuid,
        avatar: untracked.avatar,
        display_name: null,
        friend_created_at: null,
        created_at: '',
        updated_at: '',
        watchlist_count: 0,
        userQuotas: null,
        friendStatus: untracked.status,
        pendingSince: untracked.pendingSince,
        isTracked: false,
      })
    }

    return enriched
  }, [
    users,
    quotaConfigsQuery.data,
    movieStatusQuery.data,
    showStatusQuery.data,
    userStatusQuery.data,
  ])

  const queries = [
    usersQuery,
    quotaConfigsQuery,
    movieStatusQuery,
    showStatusQuery,
    userStatusQuery,
  ]

  return {
    usersWithQuota,
    hasUserData: (users?.length ?? 0) > 0,
    // pending or failed source data is indistinguishable from a user having
    // no quotas or friend status, so the aggregate must cover every query
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError && q.data === undefined),
    refetch: () => {
      for (const q of queries) {
        if (q.isError) q.refetch()
      }
    },
  }
}

export function useUpdateUser() {
  return useMutation({
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: number
      updates: z.input<typeof plexUserSchema>
    }) => {
      const { error } = await apiFetch.PATCH('/v1/users/users/{id}', {
        params: { path: { id: userId } },
        body: {
          name: updates.name,
          apprise: updates.apprise,
          alias: updates.alias,
          discord_id: updates.discord_id,
          notify_apprise: updates.notify_apprise,
          notify_discord: updates.notify_discord,
          notify_discord_mention: updates.notify_discord_mention,
          notify_plex_mobile: updates.notify_plex_mobile,
          can_sync: updates.can_sync,
          requires_approval: updates.requires_approval,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateUserData()
    },
  })
}
