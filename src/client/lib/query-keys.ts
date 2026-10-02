import { $api } from '@/lib/tanstackApi'

/** Prefix matching every params variant of the dashboard stats query */
export const dashboardStatsKeys = {
  all: $api.queryOptions('get', '/v1/stats/all').queryKey,
}

/** Prefix matching every params variant of the recent requests query */
export const recentRequestsKeys = {
  all: $api.queryOptions('get', '/v1/stats/recent-requests').queryKey,
}
