import type { WebhookEndpoint } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

export const webhookEndpointKeys = {
  all: ['get', '/v1/webhooks/endpoints'] as const,
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
