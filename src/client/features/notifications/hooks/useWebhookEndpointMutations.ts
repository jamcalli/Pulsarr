import type {
  CreateWebhookEndpoint,
  TestWebhookEndpoint,
  UpdateWebhookEndpoint,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation } from '@/lib/useMinLoading'
import { webhookEndpointKeys } from './useWebhookEndpointsQuery'

function invalidateWebhookEndpointCaches() {
  queryClient.invalidateQueries({ queryKey: webhookEndpointKeys.all })
}

export function useCreateWebhookEndpoint() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: CreateWebhookEndpoint) => {
        const { data, error } = await apiFetch.POST('/v1/webhooks/endpoints', {
          body,
        })
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateWebhookEndpointCaches()
      },
    }),
  )
}

export function useUpdateWebhookEndpoint() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async ({
        id,
        data: body,
      }: {
        id: number
        data: UpdateWebhookEndpoint
      }) => {
        const { data, error } = await apiFetch.PUT(
          '/v1/webhooks/endpoints/{id}',
          { params: { path: { id } }, body },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateWebhookEndpointCaches()
      },
    }),
  )
}

export function useDeleteWebhookEndpoint() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await apiFetch.DELETE('/v1/webhooks/endpoints/{id}', {
          params: { path: { id } },
        })
        if (error) throw error
      },
      onSuccess: () => {
        invalidateWebhookEndpointCaches()
      },
    }),
  )
}

export function useTestWebhookEndpoint() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: TestWebhookEndpoint & { name?: string }) => {
        const { data, error } = await apiFetch.POST(
          '/v1/webhooks/endpoints/test',
          { body },
        )
        if (error) throw error
        return data
      },
    }),
  )
}

export function useTestExistingWebhookEndpoint() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { data, error } = await apiFetch.POST(
          '/v1/webhooks/endpoints/{id}/test',
          { params: { path: { id } } },
        )
        if (error) throw error
        return data
      },
    }),
  )
}
