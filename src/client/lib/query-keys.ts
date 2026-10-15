import { $api } from '@/lib/tanstackApi'

/** Prefix matching every params variant of the dashboard stats query */
export const dashboardStatsKeys = {
  all: $api.queryOptions('get', '/v1/stats/all').queryKey,
}

/** Prefix matching every params variant of the top users query */
export const topUsersKeys = {
  all: $api.queryOptions('get', '/v1/stats/users').queryKey,
}

/** Prefix matching every params variant of the top genres query */
export const topGenresKeys = {
  all: $api.queryOptions('get', '/v1/stats/genres').queryKey,
}

/** Prefix matching every params variant of the recent requests query */
export const recentRequestsKeys = {
  all: $api.queryOptions('get', '/v1/stats/recent-requests').queryKey,
}

/** Prefix matching every params variant of the approval requests query */
export const approvalRequestsKeys = {
  all: $api.queryOptions('get', '/v1/approval/requests').queryKey,
}

export const approvalStatsKeys = {
  all: $api.queryOptions('get', '/v1/approval/stats').queryKey,
}

export const approvalRequestKeys = {
  byId: (id: number) =>
    $api.queryOptions('get', '/v1/approval/requests/{id}', {
      params: { path: { id } },
    }).queryKey,
}

export const scheduleKeys = {
  byName: (name: string) =>
    $api.queryOptions('get', '/v1/scheduler/schedules/{name}', {
      params: { path: { name } },
    }).queryKey,
}

export const usersKeys = {
  list: $api.queryOptions('get', '/v1/users/list').queryKey,
  withCounts: $api.queryOptions('get', '/v1/users/list/with-counts').queryKey,
  detail: (id: number) =>
    $api.queryOptions('get', '/v1/users/{id}', { params: { path: { id } } })
      .queryKey,
}

export const userStatsKeys = {
  byId: (id: number) =>
    $api.queryOptions('get', '/v1/users/{id}/stats', {
      params: { path: { id } },
    }).queryKey,
}

/** Prefixes matching every query of one user's quotas, their usage and the requests they hold */
export const userQuotaKeys = {
  quotas: (userId: number) =>
    $api.queryOptions('get', '/v1/quota/users/{userId}', {
      params: { path: { userId } },
    }).queryKey,
  status: ['get', '/v1/quota/users/{userId}/status'] as const,
  held: (userId: number) =>
    $api.queryOptions('get', '/v1/quota/users/{userId}/pending-held-count', {
      params: { path: { userId } },
    }).queryKey,
}

export const userWatchlistKeys = {
  byUser: (userId: number) =>
    $api.queryOptions('get', '/v1/users/{userId}/watchlist', {
      params: { path: { userId } },
    }).queryKey,
}

/** Prefix matching every body variant of the bulk quota status query */
export const quotaStatusKeys = {
  all: ['post', '/v1/quota/users/status/bulk'] as const,
}

export const plexUserStatusKeys = {
  all: $api.queryOptions('get', '/v1/plex/user-status').queryKey,
}

export const apiKeysKeys = {
  all: $api.queryOptions('get', '/v1/api-keys/').queryKey,
}

/** `inactive` matches every inactivity period. */
export const sessionMonitoringKeys = {
  rolling: $api.queryOptions('get', '/v1/session-monitoring/rolling-monitored')
    .queryKey,
  inactive: $api.queryOptions(
    'get',
    '/v1/session-monitoring/rolling-monitored/inactive',
  ).queryKey,
  enrollable: $api.queryOptions('get', '/v1/session-monitoring/sonarr-shows')
    .queryKey,
}

/** `syncRun` is client state, the last watchlist sync kept so its steps survive leaving the page. */
export const plexConnectionKeys = {
  passStatus: $api.queryOptions('get', '/v1/plex/plex-pass-status').queryKey,
  notificationStatus: $api.queryOptions('get', '/v1/plex/notification-status')
    .queryKey,
  syncRun: ['plex-connection', 'sync-run'] as const,
}
