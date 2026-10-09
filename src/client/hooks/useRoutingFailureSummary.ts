import { $api } from '@/lib/tanstackApi'

// Failures appear in the background as routing runs, so the badge polls slowly
const SUMMARY_REFRESH_MS = 60_000

export const routingFailureSummaryKey = $api.queryOptions(
  'get',
  '/v1/routing-failures/summary',
).queryKey

/**
 * Counts watchlist items that failed to reach Radarr or Sonarr, shared by the
 * sidebar badge and the users table.
 */
export function useRoutingFailureSummary() {
  return $api.useQuery(
    'get',
    '/v1/routing-failures/summary',
    {},
    { refetchInterval: SUMMARY_REFRESH_MS },
  )
}
