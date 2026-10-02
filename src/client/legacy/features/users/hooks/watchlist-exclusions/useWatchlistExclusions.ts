import { useMinLoading } from '@/hooks/useMinLoading'
import { $api } from '@/lib/tanstackApi'

export const watchlistExclusionKeys = {
  all: $api.queryOptions('get', '/v1/watchlist-exclusions').queryKey,
}

/**
 * Fetches all watchlist exclusions.
 */
export function useWatchlistExclusions() {
  return useMinLoading($api.useQuery('get', '/v1/watchlist-exclusions'))
}
