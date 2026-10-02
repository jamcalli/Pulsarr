import type { WebhookEndpoint } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { useMinLoading } from '@/hooks/useMinLoading'
import { $api } from '@/lib/tanstackApi'

export const webhookEndpointKeys = {
  all: $api.queryOptions('get', '/v1/webhooks/endpoints').queryKey,
}

export function useWebhookEndpointsQuery() {
  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/webhooks/endpoints',
      {},
      { select: (data): WebhookEndpoint[] => data.data },
    ),
  )
}
