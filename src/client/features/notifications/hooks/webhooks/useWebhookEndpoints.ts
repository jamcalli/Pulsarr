import { webhookEndpointsKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage, isSettled } from '@/lib/tanstackApi'

export function useWebhookEndpoints() {
  const query = $api.useQuery('get', '/v1/webhooks/endpoints')

  return {
    endpoints: query.data?.data ?? null,
    isReady: isSettled(query),
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? "Couldn't load the webhook endpoints.")
      : null,
    retry: () =>
      void queryClient.invalidateQueries({
        queryKey: webhookEndpointsKeys.all,
      }),
  }
}
