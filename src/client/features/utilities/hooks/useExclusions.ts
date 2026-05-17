import {
  type GetExclusionsResponse,
  GetExclusionsResponseSchema,
} from '@root/schemas/exclusions/exclusions.schema'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

/**
 * Query key factory for watchlist exclusion queries.
 * Centralized key management enables targeted cache invalidation.
 */
export const exclusionKeys = {
  all: ['exclusions'] as const,
  lists: () => [...exclusionKeys.all, 'list'] as const,
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
 * const { data, isLoading, error } = useExclusions()
 * const exclusions = data?.exclusions ?? []
 * ```
 */
export function useExclusions() {
  return useAppQuery<GetExclusionsResponse>({
    queryKey: exclusionKeys.lists(),
    queryFn: () => apiClient.get('/v1/exclusions', GetExclusionsResponseSchema),
  })
}
