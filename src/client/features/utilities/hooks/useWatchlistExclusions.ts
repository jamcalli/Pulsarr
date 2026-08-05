import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

export const watchlistExclusionKeys = {
  all: $api.queryOptions('get', '/v1/watchlist-exclusions').queryKey,
}

/**
 * Fetches all watchlist exclusions.
 */
export function useWatchlistExclusions() {
  return useMinLoading($api.useQuery('get', '/v1/watchlist-exclusions'))
}
