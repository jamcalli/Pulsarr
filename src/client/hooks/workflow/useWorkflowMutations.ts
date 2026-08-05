import type { StartWorkflowBody } from '@root/schemas/watchlist-workflow/watchlist-workflow.schema'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation } from '@/lib/useMinLoading'

/**
 * Mutation hook for starting the watchlist workflow.
 */
export function useStartWorkflow() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: StartWorkflowBody) => {
        const { data, error } = await apiFetch.POST(
          '/v1/watchlist-workflow/start',
          { body: body ?? {} },
        )
        if (error) throw error
        return data
      },
    }),
  )
}

/**
 * Mutation hook for stopping the watchlist workflow.
 */
export function useStopWorkflow() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await apiFetch.POST(
          '/v1/watchlist-workflow/stop',
        )
        if (error) throw error
        return data
      },
    }),
  )
}
