import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

/**
 * Key prefix for the watchlist exclusions list query. The trailing slash
 * matches the registered route path in the OpenAPI spec.
 */
export const watchlistExclusionKeys = {
  all: $api.queryOptions('get', '/v1/watchlist-exclusions/').queryKey,
}

/**
 * Fetches all watchlist exclusions.
 */
export function useWatchlistExclusions() {
  return useMinLoading($api.useQuery('get', '/v1/watchlist-exclusions/'))
}
