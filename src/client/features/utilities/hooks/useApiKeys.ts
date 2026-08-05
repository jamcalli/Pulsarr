import { zodResolver } from '@hookform/resolvers/zod'
import {
  type CreateApiKey,
  CreateApiKeySchema,
} from '@root/schemas/api-keys/api-keys.schema'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import {
  useMinDuration,
  useMinLoading,
  useMinLoadingMutation,
  withMinDuration,
} from '@/lib/useMinLoading'

export const apiKeyKeys = {
  all: $api.queryOptions('get', '/v1/api-keys/api-keys').queryKey,
}

function invalidateApiKeyCaches() {
  queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
}

/**
 * Manages API key data and actions, including creation, revocation,
 * visibility toggling, and form handling for the API keys page.
 */
export function useApiKeys() {
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({})
  // per-key state so concurrent revokes each show in-flight
  const [isRevoking, setIsRevoking] = useState<Record<number, boolean>>({})
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState<
    number | null
  >(null)

  const query = useMinLoading($api.useQuery('get', '/v1/api-keys/api-keys'))
  const isRefreshing = useMinDuration(query.isRefetching)

  const createMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: CreateApiKey) => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/api-keys/api-keys', { body }),
        )
        if (error) throw error
        return data
      },
      onSuccess: (data) => {
        // Show the newly created key by default
        setVisibleKeys((prev) => ({ ...prev, [data.apiKey.id]: true }))
        invalidateApiKeyCaches()
      },
    }),
  )

  const revokeMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await withMinDuration(
          apiFetch.DELETE('/v1/api-keys/api-keys/{id}', {
            params: { path: { id } },
          }),
        )
        if (error) throw error
      },
      onSuccess: (_data, id) => {
        setVisibleKeys((prev) => {
          const { [id]: _removed, ...rest } = prev
          return rest
        })
        setShowDeleteConfirmation((current) =>
          current === id ? null : current,
        )
        invalidateApiKeyCaches()
      },
    }),
  )

  const form = useForm<CreateApiKey>({
    resolver: zodResolver(CreateApiKeySchema),
    defaultValues: {
      name: '',
    },
  })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await createMutation.mutateAsync(data)
      form.reset()
      toast.success('API key created successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to create API key')
    }
  })

  const revokeApiKey = async (id: number) => {
    setIsRevoking((prev) => ({ ...prev, [id]: true }))
    try {
      await revokeMutation.mutateAsync(id)
      toast.success('API key revoked successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to revoke API key')
    } finally {
      setIsRevoking(({ [id]: _removed, ...rest }) => rest)
    }
  }

  const toggleKeyVisibility = (id: number) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const initiateRevoke = (id: number) => {
    setShowDeleteConfirmation(id)
  }

  return {
    form,
    apiKeys: query.data?.apiKeys ?? [],
    isLoading: query.isLoading,
    isCreating: createMutation.isPending,
    isRevoking,
    isRefreshing,
    error:
      apiErrorMessage(query.error) ??
      apiErrorMessage(createMutation.error) ??
      apiErrorMessage(revokeMutation.error),
    visibleKeys,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    onSubmit,
    revokeApiKey,
    toggleKeyVisibility,
    initiateRevoke,
    refreshApiKeys: () => query.refetch(),
  }
}
