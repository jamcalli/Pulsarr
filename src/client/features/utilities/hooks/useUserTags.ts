import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
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

/**
 * Checks whether the provided action result represents a create tag response.
 *
 * @returns True if the response has a `mode` property equal to `'create'`; otherwise, false.
 */
export function isCreateTagResponse(
  response: ActionResult,
): response is z.infer<typeof CreateTaggingResponseSchema> {
  return (
    (response as z.infer<typeof CreateTaggingResponseSchema>).mode === 'create'
  )
}

/**
 * Checks if the provided action result represents a sync tagging response.
 *
 * @param response - The action result to evaluate.
 * @returns True if the response has a `mode` property equal to `'sync'`; otherwise, false.
 */
export function isSyncTagResponse(
  response: ActionResult,
): response is z.infer<typeof SyncTaggingResponseSchema> {
  return (response as z.infer<typeof SyncTaggingResponseSchema>).mode === 'sync'
}

/**
 * Checks if an action result represents a cleanup tag response.
 *
 * @returns True if the response has a `radarr` property with a `removed` field and does not have a `mode` property; otherwise, false.
 */
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

/**
 * Checks if the given action result is a remove tags response.
 *
 * @returns True if the response has a `mode` property equal to `'remove'`; otherwise, false.
 */
export function isRemoveTagsResponse(
  response: ActionResult,
): response is z.infer<typeof RemoveTagsResponseSchema> {
  return (
    (response as z.infer<typeof RemoveTagsResponseSchema>).mode === 'remove'
  )
}

/**
 * React hook for managing user tagging configuration and actions for Sonarr and Radarr.
 *
 * Provides form state and validation for user tagging settings, and exposes handlers for fetching, updating, creating, syncing, cleaning up, and removing user tags. Integrates with external stores for state management, synchronizes configuration, and displays toast notifications for operation results.
 *
 * The returned object includes the form instance, loading and error states, results of the latest operations, tag deletion flags, and handler functions for all user tag management operations.
 *
 * @returns An object with the form instance, operation state flags, last operation results, tag deletion status, and handler functions for user tag configuration and actions.
 */
export function useUserTags() {
  const [lastResults, setLastResults] = useState<z.infer<
    typeof TaggingStatusResponseSchema
  > | null>(null)
  const [lastActionResults, setLastActionResults] =
    useState<ActionResult | null>(null)
  const [localRemoveResults, setLocalRemoveResults] = useState<z.infer<
    typeof RemoveTagsResponseSchema
  > | null>(null)
  const [tagDefinitionsDeleted, setTagDefinitionsDeleted] = useState(false)
  // Track when tag deletion is complete
  const [isTagDeletionComplete, setIsTagDeletionComplete] = useState(false)
  // Add save status state to match DeleteSyncForm
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const hasInitializedRef = useRef(false)
  const initialLoadRef = useRef(true)

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
    setLoadingWithMinDuration, // Important - this is used in DeleteSyncForm
  } = useUtilitiesStore()
  const { fetchConfig } = useConfigStore()

  // Update local remove results when store results change
  useEffect(() => {
    if (removeTagsResults) {
      setLocalRemoveResults(removeTagsResults)
    }
  }, [removeTagsResults])

  // Initialize form with default values
  const form = useForm<UserTagsFormValues>({
    resolver: zodResolver(TaggingConfigSchema),
    defaultValues: {
      tagUsersInSonarr: false,
      tagUsersInRadarr: false,
      cleanupOrphanedTags: false,
      removedTagMode: 'remove',
      removedTagPrefix: 'pulsarr:removed',
      tagPrefix: 'pulsarr:user',
    },
  })

  // Update form values when config data is available
  const updateFormValues = useCallback(
    (data: z.infer<typeof TaggingStatusResponseSchema>) => {
      form.reset({
        tagUsersInSonarr: data.config.tagUsersInSonarr,
        tagUsersInRadarr: data.config.tagUsersInRadarr,
        cleanupOrphanedTags: data.config.cleanupOrphanedTags,
        removedTagMode: data.config.removedTagMode || 'remove',
        removedTagPrefix: data.config.removedTagPrefix || 'pulsarr:removed', // Note: Despite the name, this is the complete tag label, not just a prefix (kept for API consistency)
        tagPrefix: data.config.tagPrefix,
      })
    },
    [form],
  )

  // Fetch the configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      if (!initialLoadRef.current) return

      try {
        const data = await fetchUserTagsConfig()
        setLastResults(data)
        updateFormValues(data)
        initialLoadRef.current = false

        // Reset tag definitions deleted state if there are active tags
        if (
          data.success &&
          (data.config.tagUsersInSonarr || data.config.tagUsersInRadarr)
        ) {
          setTagDefinitionsDeleted(false)
          setIsTagDeletionComplete(false)
        }
      } catch (err) {
        // Error is already handled in the store
      }
    }

    fetchConfig()
  }, [fetchUserTagsConfig, updateFormValues])

  // Handle form submission - mimicking DeleteSyncForm exactly
  const onSubmit = useCallback(
    async (data: UserTagsFormValues) => {
      // Set both states to maintain consistency with DeleteSyncForm
      setSaveStatus('loading')
      setLoadingWithMinDuration(true)

      try {
        // Create a copy of the data
        const formDataCopy = { ...data }

        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Make the API call
        const updateConfigPromise = updateUserTagsConfig(formDataCopy)

        // Wait for both processes to complete (exactly like DeleteSyncForm)
        await Promise.all([
          updateConfigPromise.then((result) => {
            // Store the result for later use
            setLastResults(result)

            // If we enable tagging, we can no longer edit the tag prefix
            if (
              result.success &&
              (data.tagUsersInSonarr || data.tagUsersInRadarr)
            ) {
              setTagDefinitionsDeleted(false)
              setIsTagDeletionComplete(false)
            }

            return result
          }),
          minimumLoadingTime,
        ])

        // Set success state
        setSaveStatus('success')

        toast.success('Settings saved successfully')

        // Reset form with updated configuration
        form.reset(formDataCopy, { keepDirty: false })

        // Refresh the global config to ensure Delete Sync form gets the updated values
        await fetchConfig()

        // Wait before setting status back to idle (exactly like DeleteSyncForm)
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Only now reset the status to idle
        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to save configuration:', error)
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to save settings'

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSaveStatus('idle')
        }, 1000)
      } finally {
        setLoadingWithMinDuration(false)
      }
    },
    [form, updateUserTagsConfig, setLoadingWithMinDuration, fetchConfig],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (lastResults) {
      updateFormValues(lastResults)
    }
  }, [lastResults, updateFormValues])

  // Create tags operation
  const handleCreateTags = useCallback(async () => {
    try {
      // Reset tag definitions deleted state when creating new tags
      setTagDefinitionsDeleted(false)
      setIsTagDeletionComplete(false)
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await createUserTags()
      setLastActionResults(result)

      toast.success(result.message || 'User tags created successfully')
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [createUserTags])

  // Sync tags operation
  const handleSyncTags = useCallback(async () => {
    try {
      // Reset tag definitions deleted state when syncing tags (which may create new ones)
      setTagDefinitionsDeleted(false)
      setIsTagDeletionComplete(false)
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await syncUserTags()
      setLastActionResults(result)

      toast.success(result.message || 'User tags synced successfully')
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [syncUserTags])

  // Clean up orphaned tags operation
  const handleCleanupTags = useCallback(async () => {
    try {
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await cleanupUserTags()
      setLastActionResults(result)

      toast.success(result.message || 'Orphaned tags cleaned up successfully')
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [cleanupUserTags])

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
        // Reset completion state at the start of operation
        setIsTagDeletionComplete(false)

        const result = await removeUserTags(deleteTagDefinitions)

        // Set the local remove results
        setLocalRemoveResults(result)

        // Only if delete tag definitions was selected and operation is complete
        if (deleteTagDefinitions && !loading.removeUserTags) {
          setIsTagDeletionComplete(true)
          setTagDefinitionsDeleted(true)
        } else {
          setTagDefinitionsDeleted(false)
        }

        toast.success(result.message || 'User tags removed successfully')
      } catch (err) {
        // Reset states on error
        setIsTagDeletionComplete(false)
        setTagDefinitionsDeleted(false)

        toast.error(
          err instanceof Error ? err.message : 'Failed to remove user tags',
        )
      }
    },
    [removeUserTags, loading.removeUserTags],
  )

  return {
    form,
    // Use saveStatus instead of loading.userTags to match the DeleteSyncForm pattern
    isSaving: saveStatus === 'loading',
    isLoading,
    isCreatingTags: loading.createUserTags,
    isSyncingTags: loading.syncUserTags,
    isCleaningTags: loading.cleanupUserTags,
    error: error.userTags,
    lastResults,
    lastActionResults,
    lastRemoveResults: localRemoveResults,
    tagDefinitionsDeleted,
    isTagDeletionComplete,
    onSubmit,
    handleCancel,
    handleCreateTags,
    handleSyncTags,
    handleCleanupTags,
    isRemovingTags: loading.removeUserTags,
    showDeleteConfirmation: showDeleteTagsConfirmation,
    setShowDeleteConfirmation: setShowDeleteTagsConfirmation,
    initiateRemoveTags,
    handleRemoveTags,
  }
}
