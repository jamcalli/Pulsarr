import {
  type WebhookEndpoint,
  WebhookEndpointsListResponseSchema,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

export const webhookEndpointKeys = {
  all: ['webhook-endpoints'] as const,
  list: () => [...webhookEndpointKeys.all, 'list'] as const,
}

export function useWebhookEndpointsQuery() {
  return useAppQuery({
    queryKey: webhookEndpointKeys.list(),
    queryFn: () =>
      apiClient.get(
        '/v1/webhooks/endpoints',
        WebhookEndpointsListResponseSchema,
      ),
    select: (data): WebhookEndpoint[] => data.data,
  })
}
