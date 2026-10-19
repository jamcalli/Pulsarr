import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { invalidateUser } from '@/features/users/lib/users-queries'
import { useConfig } from '@/hooks/useConfig'
import { useMinLoading } from '@/hooks/useMinLoading'
import { useProgressEvents } from '@/hooks/useProgressEvents'
import { useWatchlistEvents } from '@/hooks/useWatchlistEvents'
import {
  userQuotaKeys,
  userStatsKeys,
  userWatchlistKeys,
} from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, firstLoadError, isSettled } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']

const NOT_FOUND = 404

function parseUserId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return id >= 1 ? id : null
}

function invalidateActivity(id: number) {
  return Promise.all(
    [
      userStatsKeys.byId(id),
      userWatchlistKeys.byUser(id),
      userQuotaKeys.status,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

function useQuotaStatus(
  userId: number,
  contentType: ContentType,
  enabled: boolean,
) {
  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/quota/users/{userId}/status',
      { params: { path: { userId }, query: { contentType } } },
      { enabled },
    ),
  )
}

export function useUserPage() {
  const parsed = parseUserId(useParams().id)
  const id = parsed ?? 0
  const valid = parsed !== null
  const { config, isReady: configReady } = useConfig()

  const user = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/users/{id}',
      { params: { path: { id } } },
      {
        enabled: valid,
        retry: (failureCount, error) =>
          error.statusCode !== NOT_FOUND && failureCount < 1,
      },
    ),
  )
  const stats = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/users/{id}/stats',
      { params: { path: { id } } },
      { enabled: valid },
    ),
  )
  const quotas = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/quota/users/{userId}',
      { params: { path: { userId: id } } },
      { enabled: valid },
    ),
  )
  const hasMovieQuota = quotas.data?.userQuotas.movieQuota !== undefined
  const hasShowQuota = quotas.data?.userQuotas.showQuota !== undefined
  const movieStatus = useQuotaStatus(id, 'movie', valid && hasMovieQuota)
  const showStatus = useQuotaStatus(id, 'show', valid && hasShowQuota)
  const watchlist = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/users/{userId}/watchlist',
      { params: { path: { userId: id } } },
      { enabled: valid },
    ),
  )

  useProgressEvents(
    'users',
    useCallback(() => invalidateUser(id), [id]),
  )
  useProgressEvents(
    'approval',
    useCallback(() => invalidateActivity(id), [id]),
  )
  useWatchlistEvents(id)

  const notFound = !valid || user.error?.statusCode === NOT_FOUND
  const queries = [user, stats, quotas, movieStatus, showStatus, watchlist]
  const isReady =
    notFound ||
    (isSettled(user) &&
      isSettled(stats) &&
      isSettled(quotas) &&
      (!hasMovieQuota || isSettled(movieStatus)) &&
      (!hasShowQuota || isSettled(showStatus)) &&
      isSettled(watchlist) &&
      configReady)

  const data =
    user.data && stats.data && quotas.data && watchlist.data
      ? {
          id,
          user: user.data.user,
          stats: stats.data.stats,
          quotas: quotas.data.userQuotas,
          statuses: {
            movie: movieStatus.data?.quotaStatus ?? null,
            show: showStatus.data?.quotaStatus ?? null,
          },
          items: watchlist.data.data.items,
          quotaSettings: config?.quotaSettings ?? null,
        }
      : null

  return {
    isReady,
    notFound,
    errorMessage: notFound
      ? null
      : firstLoadError(queries, "Couldn't load this user."),
    retry: () => {
      for (const query of queries) {
        if (query.isError) void query.refetch()
      }
    },
    data,
  }
}

export type UserPageData = NonNullable<ReturnType<typeof useUserPage>['data']>
