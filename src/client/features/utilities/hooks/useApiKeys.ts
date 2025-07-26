import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  CreateApiKeySchema,
  type CreateApiKey,
} from '@root/schemas/api-keys/api-keys.schema'
import { useApiKeysStore } from '@/features/utilities/stores/apiKeysStore'

type ApiKeyFormData = CreateApiKey

/**
 * Provides state and utility functions for managing API keys, including creation, revocation, visibility toggling, clipboard copying, and form handling.
 *
 * Returns form handlers, API key data, loading and error states, and actions for use in UI components.
 */
export function useApiKeys() {
  const {
    apiKeys,
    visibleKeys,
    showDeleteConfirmation,
    hasLoadedApiKeys,
    loading,
    error,
    fetchApiKeys,
    createApiKey,
    revokeApiKey,
    toggleKeyVisibility,
    setShowDeleteConfirmation,
    resetErrors,
  } = useApiKeysStore()

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(CreateApiKeySchema),
    defaultValues: {
      name: '',
    },
  })

  const handleCreateApiKey = async (data: ApiKeyFormData) => {
    try {
      const result = await createApiKey(data)
      if (result.success) {
        form.reset()
        toast.success('API key created successfully')
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create API key'
      toast.error(errorMessage)
    }
  }

  const handleRevokeApiKey = async (id: number) => {
    try {
      await revokeApiKey(id)
      toast.success('API key revoked successfully')
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to revoke API key'
      toast.error(errorMessage)
    }
  }

  const copyToClipboard = async (key: string, name: string) => {
    try {
      // Check if clipboard API is available
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(key)
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement('textarea')
        textArea.value = key
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      toast.success(`API key for "${name}" copied to clipboard`)
    } catch (err) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const initiateRevoke = (id: number) => {
    setShowDeleteConfirmation(id)
  }

  const onSubmit = form.handleSubmit(handleCreateApiKey)

  useEffect(() => {
    if (!hasLoadedApiKeys) {
      fetchApiKeys(false)
    }
  }, [fetchApiKeys, hasLoadedApiKeys])

  return {
    form,
    apiKeys,
    isLoading: loading.fetch,
    isCreating: loading.create,
    isRevoking: loading.revoke,
    isRefreshing: loading.fetch, // Use same loading state for refresh
    error: error.fetch || error.create || error.revoke,
    visibleKeys,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    onSubmit,
    revokeApiKey: handleRevokeApiKey,
    toggleKeyVisibility,
    copyToClipboard,
    initiateRevoke,
    fetchApiKeys,
    resetErrors,
  }
}
