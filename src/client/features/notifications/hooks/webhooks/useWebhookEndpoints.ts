import { webhookEndpointsKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, isSettled, loadErrorMessage } from '@/lib/tanstackApi'

export function useWebhookEndpoints() {
  const query = $api.useQuery('get', '/v1/webhooks/endpoints')

  return {
    endpoints: query.data?.data ?? null,
    isReady: isSettled(query),
    errorMessage: loadErrorMessage(
      query,
      "Couldn't load the webhook endpoints.",
    ),
    retry: () =>
      void queryClient.invalidateQueries({
        queryKey: webhookEndpointsKeys.all,
      }),
  }
}
