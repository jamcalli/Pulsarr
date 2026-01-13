import {
  type CreateWebhookEndpoint,
  type TestWebhookEndpoint,
  type UpdateWebhookEndpoint,
  WebhookEndpointResponseSchema,
  WebhookTestResponseSchema,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useAppMutation } from '@/lib/useAppQuery'
import { webhookEndpointKeys } from './useWebhookEndpointsQuery'

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient()

  return useAppMutation({
    mutationFn: (data: CreateWebhookEndpoint) =>
      apiClient.post(
        '/v1/webhooks/endpoints',
        data,
        WebhookEndpointResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookEndpointKeys.all })
    },
  })
}

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient()

  return useAppMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateWebhookEndpoint }) =>
      apiClient.put(
        `/v1/webhooks/endpoints/${id}`,
        data,
        WebhookEndpointResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookEndpointKeys.all })
    },
  })
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient()

  return useAppMutation({
    mutationFn: (id: number) =>
      apiClient.delete(`/v1/webhooks/endpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookEndpointKeys.all })
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
