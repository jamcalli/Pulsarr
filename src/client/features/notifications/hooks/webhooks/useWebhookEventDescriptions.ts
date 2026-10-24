import { $api } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type WebhookEventType = components['schemas']['WebhookEventType']

/** Empty until the server answers. */
export function useWebhookEventDescriptions(): ReadonlyMap<
  WebhookEventType,
  string
> {
  const query = $api.useQuery('get', '/v1/webhooks/event-types')
  return new Map(
    (query.data?.data ?? []).map((event) => [event.type, event.description]),
  )
}
