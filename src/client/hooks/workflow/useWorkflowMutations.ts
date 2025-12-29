import {
  type StartWorkflowBody,
  type WatchlistWorkflowResponse,
  WatchlistWorkflowResponseSchema,
} from '@root/schemas/watchlist-workflow/watchlist-workflow.schema'
import { apiClient } from '@/lib/apiClient'
import { useAppMutation } from '@/lib/useAppQuery'

/**
 * Mutation hook for starting the watchlist workflow.
 *
 * @example
 * ```typescript
 * const { mutate: startWorkflow, isPending } = useStartWorkflow()
 *
 * startWorkflow({ autoStart: true }, {
 *   onSuccess: (data) => toast.success(data.message),
 *   onError: (error) => toast.error(error.message),
 * })
 * ```
 */
export function useStartWorkflow() {
  return useAppMutation<WatchlistWorkflowResponse, Error, StartWorkflowBody>({
    mutationFn: (body) =>
      apiClient.post(
        '/v1/watchlist-workflow/start',
        body ?? {},
        WatchlistWorkflowResponseSchema,
      ),
  })
}

/**
 * Mutation hook for stopping the watchlist workflow.
 *
 * @example
 * ```typescript
 * const { mutate: stopWorkflow, isPending } = useStopWorkflow()
 *
 * stopWorkflow(undefined, {
 *   onSuccess: () => toast.success('Workflow stopped'),
 *   onError: (error) => toast.error(error.message),
 * })
 * ```
 */
export function useStopWorkflow() {
  return useAppMutation<WatchlistWorkflowResponse, Error, void>({
    mutationFn: () =>
      apiClient.post(
        '/v1/watchlist-workflow/stop',
        {},
        WatchlistWorkflowResponseSchema,
      ),
  })
}
