import {
  type CreateWatchlistExclusion,
  type CreateWatchlistExclusionResponse,
  CreateWatchlistExclusionResponseSchema,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { apiClient } from '@/lib/apiClient'
import { queryClient } from '@/lib/queryClient'
import { useAppMutation } from '@/lib/useAppQuery'
import { watchlistExclusionKeys } from './useWatchlistExclusions'

/**
 * Invalidates watchlist exclusion caches.
 * Called after mutations that change exclusion state.
 */
function invalidateWatchlistExclusionCaches() {
  queryClient.invalidateQueries({ queryKey: watchlistExclusionKeys.all })
}

/**
 * Mutation hook for creating a watchlist exclusion for one or more users.
 *
 * @example
 * ```typescript
 * const { mutateAsync, isPending } = useCreateWatchlistExclusion()
 * await mutateAsync({ key: 'tt0111161', userIds: [1, 2] })
 * ```
 */
export function useCreateWatchlistExclusion() {
  return useAppMutation<
    CreateWatchlistExclusionResponse,
    Error,
    CreateWatchlistExclusion
  >({
    mutationFn: (body) =>
      apiClient.post(
        '/v1/watchlist-exclusions',
        body,
        CreateWatchlistExclusionResponseSchema,
      ),
    onSuccess: () => {
      invalidateWatchlistExclusionCaches()
    },
  })
}

/**
 * Mutation hook for removing a single watchlist exclusion by ID.
 *
 * @example
 * ```typescript
 * const { mutateAsync, isPending, variables } = useRemoveWatchlistExclusion()
 * await mutateAsync(42)
 * // For per-row state, compare `variables === row.id` with `isPending`.
 * ```
 */
export function useRemoveWatchlistExclusion() {
  return useAppMutation<void, Error, number>({
    mutationFn: (id) =>
      apiClient.delete<void>(`/v1/watchlist-exclusions/${id}`),
    onSuccess: () => {
      invalidateWatchlistExclusionCaches()
    },
  })
}
