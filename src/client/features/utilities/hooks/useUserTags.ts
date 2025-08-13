import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import type {
  CreateTaggingResponse,
  SyncTaggingResponse,
  CleanupResponse,
  RemoveTagsResponse,
} from '@root/schemas/tags/user-tags.schema'
import { TaggingConfigSchema } from '@root/schemas/tags/user-tags.schema'
import type { z } from 'zod'

export type UserTagsFormValues = z.infer<typeof TaggingConfigSchema>

// Union type for action results
type ActionResult =
  | CreateTaggingResponse
  | SyncTaggingResponse
  | CleanupResponse
  | RemoveTagsResponse

/**
 * Checks whether the provided action result represents a create tag response.
 *
 * @returns True if the response has a `mode` property equal to `'create'`; otherwise, false.
 */
export function isCreateTagResponse(
  response: ActionResult,
): response is CreateTaggingResponse {
  return 'mode' in response && response.mode === 'create'
}

/**
 * Checks if the provided action result represents a sync tagging response.
 *
 * Returns true if the response object has a `mode` property equal to `'sync'`.
 *
 * @param response - The action result to evaluate
 * @returns True if the response is a sync tagging response; otherwise, false
 */
export function isSyncTagResponse(
  response: ActionResult,
): response is SyncTaggingResponse {
  return 'mode' in response && response.mode === 'sync'
}

/**
 * Checks if the provided action result is a cleanup tag response.
 *
 * Returns true if the response object contains a `radarr` property with a nested `removed` field and does not have a `mode` property, indicating it matches the structure of a cleanup operation result.
 */
export function isCleanupTagResponse(
  response: ActionResult,
): response is CleanupResponse {
  // CleanupTagResponse doesn't have a mode property, but it has specific structure
  return (
    'radarr' in response &&
    'removed' in response.radarr &&
    !('mode' in response)
  )
}

/**
 * Determines whether the provided action result represents a remove tags response.
 *
 * @returns True if the response has a `mode` property set to `'remove'`; otherwise, false.
 */
export function isRemoveTagsResponse(
  response: ActionResult,
): response is RemoveTagsResponse {
  return 'mode' in response && response.mode === 'remove'
}

/**
 * React hook for managing user tagging configuration and actions for Sonarr and Radarr.
 *
 * Provides form state, validation, and handler functions for configuring user tagging, as well as operations to create, sync, clean up, and remove user tags. Integrates with external stores for configuration and utility state management, synchronizes form values with the global configuration, and manages UI state for tag deletion confirmation. Displays toast notifications for operation results and tracks the status of tag deletion operations.
 *
 * @returns An object containing the form instance, flags for operation states, results of the latest actions, tag deletion status, and handler functions for all user tag management operations.
 */
export function useUserTags() {
  const [lastActionResults, setLastActionResults] =
    useState<ActionResult | null>(null)
  const [localRemoveResults, setLocalRemoveResults] =
    useState<RemoveTagsResponse | null>(null)
  const [tagDefinitionsDeleted, setTagDefinitionsDeleted] = useState(false)
  // Track when tag deletion is complete
  const [isTagDeletionComplete, setIsTagDeletionComplete] = useState(false)
  // Add save status state to match DeleteSyncForm
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const initialLoadRef = useRef(true)

  const {
    loading,
    error,
    createUserTags,
    syncUserTags,
    cleanupUserTags,
    removeTagsResults,
    showDeleteTagsConfirmation,
    setShowDeleteTagsConfirmation,
    removeUserTags,
    setLoadingWithMinDuration, // Important - this is used in DeleteSyncForm
  } = useUtilitiesStore()

  // Manually set loading state during initial load
  useEffect(() => {
    if (initialLoadRef.current) {
      useUtilitiesStore.setState((state) => ({
        ...state,
        loading: { ...state.loading, userTags: true },
      }))
    }
  }, [])
  const {
    config,
    updateConfig,
    fetchConfig,
    error: configError,
  } = useConfigStore()

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
  const updateFormValues = useCallback(() => {
    if (config) {
      form.reset({
        tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
        tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
        cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
        removedTagMode: config.removedTagMode || 'remove',
        removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed', // Note: Despite the name, this is the complete tag label, not just a prefix (kept for API consistency)
        tagPrefix: config.tagPrefix || 'pulsarr:user',
      })
    }
  }, [form, config])

  // Update form when config changes
  useEffect(() => {
    if (config && initialLoadRef.current) {
      // Add minimum 500ms display time for initial loading
      let timer: ReturnType<typeof setTimeout> | null = null

      updateFormValues()
      timer = setTimeout(() => {
        initialLoadRef.current = false

        // Reset tag definitions deleted state if there are active tags
        if (config.tagUsersInSonarr || config.tagUsersInRadarr) {
          setTagDefinitionsDeleted(false)
          setIsTagDeletionComplete(false)
        }

        // Clear loading state
        useUtilitiesStore.setState((state) => ({
          ...state,
          loading: { ...state.loading, userTags: false },
        }))
      }, 500)

      return () => {
        if (timer) clearTimeout(timer)
      }
    }

    if (config) {
      updateFormValues()
    }
  }, [config, updateFormValues])

  // Handle config loading errors - clear loading state if config fetch fails
  useEffect(() => {
    if (configError && initialLoadRef.current) {
      console.warn('Config fetch failed, clearing loading state:', configError)
      initialLoadRef.current = false
      useUtilitiesStore.setState((state) => ({
        ...state,
        loading: { ...state.loading, userTags: false },
      }))
    }
  }, [configError])

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

        // Make the API call using main config system
        const updateConfigPromise = updateConfig({
          tagUsersInSonarr: formDataCopy.tagUsersInSonarr,
          tagUsersInRadarr: formDataCopy.tagUsersInRadarr,
          cleanupOrphanedTags: formDataCopy.cleanupOrphanedTags,
          removedTagMode: formDataCopy.removedTagMode,
          removedTagPrefix: formDataCopy.removedTagPrefix,
          tagPrefix: formDataCopy.tagPrefix,
        })

        // Wait for both processes to complete (exactly like DeleteSyncForm)
        await Promise.all([updateConfigPromise, minimumLoadingTime])

        // If we enable tagging, we can no longer edit the tag prefix
        if (data.tagUsersInSonarr || data.tagUsersInRadarr) {
          setTagDefinitionsDeleted(false)
          setIsTagDeletionComplete(false)
        }

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
    [form, updateConfig, setLoadingWithMinDuration, fetchConfig],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    updateFormValues()
  }, [updateFormValues])

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
    } catch (_err) {
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
    } catch (_err) {
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
    } catch (_err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [cleanupUserTags])

  // Show loading until we have config loaded - use utilities store loading state for consistent 500ms minimum
  const isLoading = initialLoadRef.current && loading.userTags

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
        if (deleteTagDefinitions) {
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
    [removeUserTags],
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
