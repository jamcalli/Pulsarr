import { useMutation } from '@tanstack/react-query'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { apiKeysKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import {
  $api,
  apiErrorMessage,
  apiFetch,
  isSettled,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

function invalidateApiKeys() {
  return queryClient.invalidateQueries({ queryKey: apiKeysKeys.all })
}

async function createKey(name: string) {
  const { data, error } = await apiFetch.POST('/v1/api-keys/', {
    body: { name },
  })
  if (error) throw error
  return requireSuccess(data)
}

async function revokeKey(id: number) {
  const { error } = await apiFetch.DELETE('/v1/api-keys/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
}

export function useApiKeys() {
  const query = $api.useQuery('get', '/v1/api-keys/')

  return {
    apiKeys: query.data?.apiKeys ?? null,
    isReady: isSettled(query),
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? "Couldn't load the API keys.")
      : null,
    retry: () => void invalidateApiKeys(),
  }
}

export function useCreateApiKey() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (name: string) => withMinDuration(createKey(name)),
      onSuccess: () => invalidateApiKeys(),
    }),
  )

  return {
    create: mutation.mutateAsync,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The key was not created. Try again.',
        )
      : null,
  }
}

export function useRevokeApiKey() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (id: number) => withMinDuration(revokeKey(id)),
      onSuccess: () => invalidateApiKeys(),
    }),
  )

  return {
    revoke: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The key was not revoked. Try again.',
        )
      : null,
  }
}
