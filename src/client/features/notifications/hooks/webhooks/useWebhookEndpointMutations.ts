import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { webhookEndpointsKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type CreatePayload = components['schemas']['WebhookEndpointCreatePayload']
type UpdatePayload = components['schemas']['WebhookEndpointUpdatePayload']
type EndpointList = components['schemas']['WebhookEndpointList']

function setCachedEnabled(id: number, enabled: boolean) {
  queryClient.setQueryData<EndpointList>(webhookEndpointsKeys.all, (old) =>
    old
      ? {
          ...old,
          data: old.data.map((endpoint) =>
            endpoint.id === id ? { ...endpoint, enabled } : endpoint,
          ),
        }
      : old,
  )
}

function invalidateEndpoints() {
  return queryClient.invalidateQueries({ queryKey: webhookEndpointsKeys.all })
}

async function createEndpoint(body: CreatePayload) {
  const { data, error } = await apiFetch.POST('/v1/webhooks/endpoints', {
    body,
  })
  if (error) throw error
  return data.data
}

async function updateEndpoint({
  id,
  body,
}: {
  id: number
  body: UpdatePayload
}) {
  const { data, error } = await apiFetch.PUT('/v1/webhooks/endpoints/{id}', {
    params: { path: { id } },
    body,
  })
  if (error) throw error
  return data.data
}

async function deleteEndpoint(id: number) {
  const { error } = await apiFetch.DELETE('/v1/webhooks/endpoints/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
}

/** Creates the endpoint when `id` is null, otherwise sends the changes. */
export function useSaveWebhookEndpoint() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (
        save:
          | { id: null; body: CreatePayload }
          | { id: number; body: UpdatePayload },
      ) =>
        withMinDuration(
          save.id === null
            ? createEndpoint(save.body)
            : updateEndpoint({ id: save.id, body: save.body }),
        ),
      onSuccess: () => invalidateEndpoints(),
    }),
  )

  return {
    save: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The endpoint was not saved. Try again.',
        )
      : null,
  }
}

export function useToggleWebhookEndpoint() {
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map())
  const [toggling, setToggling] = useState<ReadonlySet<number>>(new Set())
  const inFlight = useRef(0)

  const setError = (id: number, message: string | null) =>
    setErrors((prev) => {
      const next = new Map(prev)
      if (message === null) next.delete(id)
      else next.set(id, message)
      return next
    })

  const setPending = (id: number, pending: boolean) =>
    setToggling((prev) => {
      const next = new Set(prev)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })

  const toggle = async (id: number, enabled: boolean) => {
    setError(id, null)
    setPending(id, true)
    inFlight.current += 1
    await queryClient.cancelQueries({ queryKey: webhookEndpointsKeys.all })
    setCachedEnabled(id, enabled)
    try {
      await withMinDuration(updateEndpoint({ id, body: { enabled } }))
    } catch (error) {
      setCachedEnabled(id, !enabled)
      setError(
        id,
        mutationErrorMessage(
          error,
          `The endpoint could not be turned ${enabled ? 'on' : 'off'}. Try again.`,
        ),
      )
    } finally {
      setPending(id, false)
      inFlight.current -= 1
      // A refetch while another switch is in flight would overwrite that switch's optimistic value.
      if (inFlight.current === 0) void invalidateEndpoints()
    }
  }

  return {
    toggle,
    isToggling: (id: number) => toggling.has(id),
    errorMessage: (id: number) => errors.get(id) ?? null,
  }
}

export function useDeleteWebhookEndpoint() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (id: number) => withMinDuration(deleteEndpoint(id)),
      onSuccess: () => invalidateEndpoints(),
    }),
  )

  return {
    remove: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The endpoint was not deleted. Try again.',
        )
      : null,
  }
}
