import { useEffect } from 'react'
import { toast } from 'sonner'
import { useExclusionsStore } from '@/features/utilities/store/exclusionsStore'

/**
 * React hook that manages watchlist exclusion state and actions, including fetching, removal, and confirmation dialog handling.
 *
 * Returns exclusion data, loading and error states, and utility functions for use in exclusion management UI components.
 */
export function useExclusions() {
  const {
    exclusions,
    showDeleteConfirmation,
    hasLoadedExclusions,
    loading,
    error,
    fetchExclusions,
    createExclusion,
    removeExclusion,
    setShowDeleteConfirmation,
    resetErrors,
  } = useExclusionsStore()

  const handleCreateExclusion = async (key: string, userIds: number[]) => {
    try {
      await createExclusion(key, userIds)
      toast.success('Exclusion created successfully')
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create exclusion'
      toast.error(errorMessage)
    }
  }

  const handleRemoveExclusion = async (id: number) => {
    try {
      await removeExclusion(id)
      toast.success('Exclusion removed successfully')
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove exclusion'
      toast.error(errorMessage)
    }
  }

  const initiateRemove = (id: number) => {
    setShowDeleteConfirmation(id)
  }

  useEffect(() => {
    if (!hasLoadedExclusions) {
      fetchExclusions(false)
    }
  }, [fetchExclusions, hasLoadedExclusions])

  return {
    exclusions,
    isLoading: loading.fetch,
    isRemoving: loading.remove,
    isRefreshing: loading.fetch,
    error: error.fetch || error.create || error.remove,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    createExclusion: handleCreateExclusion,
    removeExclusion: handleRemoveExclusion,
    initiateRemove,
    fetchExclusions,
    hasLoadedExclusions,
    resetErrors,
  }
}
