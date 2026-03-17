import {
  type CreateWebhookEndpoint,
  type TestWebhookEndpoint,
  type UpdateWebhookEndpoint,
  WebhookEndpointResponseSchema,
  WebhookTestResponseSchema,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { apiClient } from '@/lib/apiClient'
import { queryClient } from '@/lib/queryClient'
import { useAppMutation } from '@/lib/useAppQuery'
import { webhookEndpointKeys } from './useWebhookEndpointsQuery'

function invalidateWebhookEndpointCaches() {
  queryClient.invalidateQueries({ queryKey: webhookEndpointKeys.all })
}

export function useCreateWebhookEndpoint() {
  return useAppMutation({
    mutationFn: (data: CreateWebhookEndpoint) =>
      apiClient.post(
        '/v1/webhooks/endpoints',
        data,
        WebhookEndpointResponseSchema,
      ),
    onSuccess: () => {
      invalidateWebhookEndpointCaches()
    },
  })
}

export function useUpdateWebhookEndpoint() {
  return useAppMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateWebhookEndpoint }) =>
      apiClient.put(
        `/v1/webhooks/endpoints/${id}`,
        data,
        WebhookEndpointResponseSchema,
      ),
    onSuccess: () => {
      invalidateWebhookEndpointCaches()
    },
  })
}

export function useDeleteWebhookEndpoint() {
  return useAppMutation({
    mutationFn: (id: number) =>
      apiClient.delete<void>(`/v1/webhooks/endpoints/${id}`),
    onSuccess: () => {
      invalidateWebhookEndpointCaches()
    },
  })
}

export function useTestWebhookEndpoint() {
  return useAppMutation({
    mutationFn: (data: TestWebhookEndpoint & { name?: string }) =>
      apiClient.post(
        '/v1/webhooks/endpoints/test',
        data,
        WebhookTestResponseSchema,
      ),
  })
}

export function useTestExistingWebhookEndpoint() {
  return useAppMutation({
    mutationFn: (id: number) =>
      apiClient.post(
        `/v1/webhooks/endpoints/${id}/test`,
        {},
        WebhookTestResponseSchema,
      ),
  })
}
