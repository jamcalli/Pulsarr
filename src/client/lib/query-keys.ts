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
