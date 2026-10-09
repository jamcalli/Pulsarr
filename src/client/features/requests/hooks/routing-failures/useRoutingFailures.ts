import type { RetryRoutingFailuresBody } from '@root/schemas/routing-failures/routing-failures.schema'
import { useMutation } from '@tanstack/react-query'
import { useMinLoading, useMinLoadingMutation } from '@/hooks/useMinLoading'
import { routingFailureSummaryKey } from '@/hooks/useRoutingFailureSummary'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'

export const routingFailureKeys = {
  all: $api.queryOptions('get', '/v1/routing-failures').queryKey,
}

function invalidateRoutingFailureCaches() {
  queryClient.invalidateQueries({ queryKey: routingFailureKeys.all })
  queryClient.invalidateQueries({ queryKey: routingFailureSummaryKey })
}

/**
 * Fetches every recorded routing failure; the table filters client side.
 */
export function useRoutingFailures() {
  return useMinLoading($api.useQuery('get', '/v1/routing-failures'))
}

/**
 * Retries one failed watchlist item.
 * For per-row state, compare `variables === row.watchlist_item_id` with `isPending`.
 */
export function useRetryRoutingFailure() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (watchlistItemId: number) => {
        const { data, error } = await apiFetch.POST(
          '/v1/routing-failures/{watchlistItemId}/retry',
          { params: { path: { watchlistItemId } } },
        )
        if (error) throw error
        return data
      },
      onSettled: () => {
        invalidateRoutingFailureCaches()
      },
    }),
  )
}

/**
 * Retries every failed watchlist item matching the filters.
 */
export function useRetryAllRoutingFailures() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: NonNullable<RetryRoutingFailuresBody>) => {
        const { data, error } = await apiFetch.POST(
          '/v1/routing-failures/retry',
          { body },
        )
        if (error) throw error
        return data
      },
      onSettled: () => {
        invalidateRoutingFailureCaches()
      },
    }),
  )
}
