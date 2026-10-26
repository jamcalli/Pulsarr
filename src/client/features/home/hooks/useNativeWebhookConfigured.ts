import { $api } from '@/lib/tanstackApi'

/** Undefined until known. A failed lookup counts as configured so rows are never hidden on a guess. */
export function useNativeWebhookConfigured(): boolean | undefined {
  const query = $api.useQuery('get', '/v1/webhooks/endpoints')
  if (query.isError) return true
  return query.data?.data.some((endpoint) => endpoint.enabled)
}
