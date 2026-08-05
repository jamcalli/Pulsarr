import type { CreateWatchlistExclusion } from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation } from '@/lib/useMinLoading'
import { watchlistExclusionKeys } from './useWatchlistExclusions'

function invalidateWatchlistExclusionCaches() {
  queryClient.invalidateQueries({ queryKey: watchlistExclusionKeys.all })
}

/**
 * Mutation hook for creating a watchlist exclusion for one or more users.
 */
export function useCreateWatchlistExclusion() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: CreateWatchlistExclusion) => {
        const { data, error } = await apiFetch.POST(
          '/v1/watchlist-exclusions',
          { body },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateWatchlistExclusionCaches()
      },
    }),
  )
}

/**
 * Mutation hook for removing a single watchlist exclusion by ID.
 * For per-row state, compare `variables === row.id` with `isPending`.
 */
export function useRemoveWatchlistExclusion() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await apiFetch.DELETE(
          '/v1/watchlist-exclusions/{id}',
          { params: { path: { id } } },
        )
        if (error) throw error
      },
      onSuccess: () => {
        invalidateWatchlistExclusionCaches()
      },
    }),
  )
}
