import {
  type GetWatchlistExclusionsResponse,
  GetWatchlistExclusionsResponseSchema,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

/**
 * Query key factory for watchlist exclusion queries.
 * Centralized key management enables targeted cache invalidation.
 */
export const watchlistExclusionKeys = {
  all: ['watchlist-exclusions'] as const,
  lists: () => [...watchlistExclusionKeys.all, 'list'] as const,
}

/**
 * React Query hook for fetching all watchlist exclusions.
 *
 * Uses `useAppQuery` wrapper which enforces minimum loading duration
 * for consistent skeleton loader behavior.
 *
 * @returns Query result with the list of exclusions, loading state, and error
 *
 * @example
 * ```typescript
 * const { data, isLoading, error } = useWatchlistExclusions()
 * const exclusions = data?.exclusions ?? []
 * ```
 */
export function useWatchlistExclusions() {
  return useAppQuery<GetWatchlistExclusionsResponse>({
    queryKey: watchlistExclusionKeys.lists(),
    queryFn: () =>
      apiClient.get(
        '/v1/watchlist-exclusions',
        GetWatchlistExclusionsResponseSchema,
      ),
  })
}
