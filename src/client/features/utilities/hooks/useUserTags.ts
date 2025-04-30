import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import {
  TaggingConfigSchema,
  type TaggingStatusResponseSchema,
  type CreateTaggingResponseSchema,
  type SyncTaggingResponseSchema,
  type CleanupResponseSchema,
  type RemoveTagsResponseSchema,
} from '@root/schemas/tags/user-tags.schema'
import type { z } from 'zod'

export type UserTagsFormValues = z.infer<typeof TaggingConfigSchema>

// Union type for action results
type ActionResult =
  | z.infer<typeof CreateTaggingResponseSchema>
  | z.infer<typeof SyncTaggingResponseSchema>
  | z.infer<typeof CleanupResponseSchema>
  | z.infer<typeof RemoveTagsResponseSchema>

// Type guard functions
export function isCreateTagResponse(
  response: ActionResult,
): response is z.infer<typeof CreateTaggingResponseSchema> {
  return (
    (response as z.infer<typeof CreateTaggingResponseSchema>).mode === 'create'
  )
}

export function isSyncTagResponse(
  response: ActionResult,
): response is z.infer<typeof SyncTaggingResponseSchema> {
  return (response as z.infer<typeof SyncTaggingResponseSchema>).mode === 'sync'
}

export function isCleanupTagResponse(
  response: ActionResult,
): response is z.infer<typeof CleanupResponseSchema> {
  // CleanupTagResponse doesn't have a mode property, but it has specific structure
  return (
    'radarr' in response &&
    'removed' in response.radarr &&
    !('mode' in response)
  )
}

export function isRemoveTagsResponse(
  response: ActionResult,
): response is z.infer<typeof RemoveTagsResponseSchema> {
  return (
    (response as z.infer<typeof RemoveTagsResponseSchema>).mode === 'remove'
  )
}

/**
 * Custom React hook for managing user tagging configuration and operations.
 *
 * This hook integrates with the utilities store to manage state and API calls
 * for user tag operations across Sonarr and Radarr instances.
 */
export function useUserTags() {
  const { toast } = useToast()
  const [lastResults, setLastResults] = useState<z.infer<
    typeof TaggingStatusResponseSchema
  > | null>(null)
  const [lastActionResults, setLastActionResults] =
    useState<ActionResult | null>(null)
  const hasInitializedRef = useRef(false)

  const {
    loading,
    error,
    fetchUserTagsConfig,
    updateUserTagsConfig,
    createUserTags,
    syncUserTags,
    cleanupUserTags,
    removeTagsResults,
    showDeleteTagsConfirmation,
    setShowDeleteTagsConfirmation,
    removeUserTags,
  } = useUtilitiesStore()

  // Initialize form with default values
  const form = useForm<UserTagsFormValues>({
    resolver: zodResolver(TaggingConfigSchema),
    defaultValues: {
      tagUsersInSonarr: false,
      tagUsersInRadarr: false,
      cleanupOrphanedTags: false,
      persistHistoricalTags: false,
      tagPrefix: 'pulsarr:user',
    },
  })

  // Fetch the configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await fetchUserTagsConfig()
        setLastResults(data)

        // Update form with the configuration
        form.reset({
          tagUsersInSonarr: data.config.tagUsersInSonarr,
          tagUsersInRadarr: data.config.tagUsersInRadarr,
          cleanupOrphanedTags: data.config.cleanupOrphanedTags,
          persistHistoricalTags: data.config.persistHistoricalTags,
          tagPrefix: data.config.tagPrefix,
        })
      } catch (err) {
        // Error is already handled in the store
      }
    }

    fetchConfig()
  }, [fetchUserTagsConfig, form.reset])

  // Handle form submission
  const onSubmit = useCallback(
    async (data: UserTagsFormValues) => {
      try {
        // Store the current data to use for the actual update
        const formDataCopy = { ...data }

        // Reset form with current values to clear dirty state
        form.reset(data, { keepValues: true })

        // Now start the saving process after form is no longer dirty
        const result = await updateUserTagsConfig(formDataCopy)
        setLastResults(result)

        toast({
          description:
            result.message || 'Tagging configuration updated successfully',
          variant: 'default',
        })

        form.reset(formDataCopy)
      } catch (err) {
        // In case of error, we should restore the form's dirty state
        form.reset(data, { keepDirty: true })
      }
    },
    [form, toast, updateUserTagsConfig],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    form.reset()
  }, [form])

  // Create tags operation
  const handleCreateTags = useCallback(async () => {
    try {
      const result = await createUserTags()
      setLastActionResults(result)

      toast({
        description: result.message || 'User tags created successfully',
        variant: 'default',
      })
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [createUserTags, toast])

  // Sync tags operation
  const handleSyncTags = useCallback(async () => {
    try {
      const result = await syncUserTags()
      setLastActionResults(result)

      toast({
        description: result.message || 'User tags synced successfully',
        variant: 'default',
      })
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [syncUserTags, toast])

  // Clean up orphaned tags operation
  const handleCleanupTags = useCallback(async () => {
    try {
      const result = await cleanupUserTags()
      setLastActionResults(result)

      toast({
        description: result.message || 'Orphaned tags cleaned up successfully',
        variant: 'default',
      })
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [cleanupUserTags, toast])

  // Check if on initial loading - don't show loading on navigation
  if (!hasInitializedRef.current && !loading.userTags) {
    hasInitializedRef.current = true
  }

  // Only show loading skeleton on initial load, not on navigation
  const isLoading = !hasInitializedRef.current && loading.userTags

  const initiateRemoveTags = useCallback(() => {
    setShowDeleteTagsConfirmation(true)
  }, [setShowDeleteTagsConfirmation])

  const handleRemoveTags = useCallback(
    async (deleteTagDefinitions: boolean) => {
      try {
        const result = await removeUserTags(deleteTagDefinitions)

        toast({
          description: result.message || 'User tags removed successfully',
          variant: 'default',
        })
      } catch (err) {
        // Error already handled in store, just for user notification
        toast({
          title: 'Error',
          description:
            err instanceof Error ? err.message : 'Failed to remove user tags',
          variant: 'destructive',
        })
      }
    },
    [removeUserTags, toast],
  )

  return {
    form,
    isSaving: loading.userTags,
    isLoading,
    isCreatingTags: loading.createUserTags,
    isSyncingTags: loading.syncUserTags,
    isCleaningTags: loading.cleanupUserTags,
    error: error.userTags,
    lastResults,
    lastActionResults,
    onSubmit,
    handleCancel,
    handleCreateTags,
    handleSyncTags,
    handleCleanupTags,
    isRemovingTags: loading.removeUserTags,
    showDeleteConfirmation: showDeleteTagsConfirmation,
    setShowDeleteConfirmation: setShowDeleteTagsConfirmation,
    lastRemoveResults: removeTagsResults,
    initiateRemoveTags,
    handleRemoveTags,
  }
}
