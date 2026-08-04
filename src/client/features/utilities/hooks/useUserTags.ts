import { zodResolver } from '@hookform/resolvers/zod'
import type {
  CleanupResponse,
  CreateTaggingResponse,
  RemoveTagsResponse,
  SyncTaggingResponse,
} from '@root/schemas/tags/user-tags.schema'
import { TaggingConfigSchema } from '@root/schemas/tags/user-tags.schema'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { invalidateConfig, updateConfig, useConfig } from '@/hooks/useConfig'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation, withMinDuration } from '@/lib/useMinLoading'

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
 * Provides form state, validation, and handler functions for configuring user tagging, as well as operations to create, sync, clean up, and remove user tags. Synchronizes form values with the global configuration and manages UI state for tag deletion confirmation. Displays toast notifications for operation results and tracks the status of tag deletion operations.
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
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [showDeleteTagsConfirmation, setShowDeleteTagsConfirmation] =
    useState(false)

  const createTagsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/tags/create'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const syncTagsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/tags/sync'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const cleanupTagsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/tags/cleanup'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const removeTagsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async (deleteTagDefinitions: boolean) => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/tags/remove', {
            body: { deleteTagDefinitions },
          }),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const { config, error: configError } = useConfig()

  // Initialize form with default values
  const form = useForm<z.input<typeof TaggingConfigSchema>>({
    resolver: zodResolver(TaggingConfigSchema),
    defaultValues: {
      tagUsersInSonarr: false,
      tagUsersInRadarr: false,
      cleanupOrphanedTags: false,
      removedTagMode: 'remove',
      removedTagPrefix: 'pulsarr-removed',
      tagPrefix: 'pulsarr-user',
      tagNamingSource: 'username',
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
        removedTagPrefix: config.removedTagPrefix || 'pulsarr-removed',
        tagPrefix: config.tagPrefix || 'pulsarr-user',
        tagNamingSource: config.tagNamingSource || 'username',
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

        setIsInitialLoading(false)
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
      setIsInitialLoading(false)
    }
  }, [configError])

  // Handle form submission - mimicking DeleteSyncForm exactly
  const onSubmit = useCallback(
    async (data: z.input<typeof TaggingConfigSchema>) => {
      setSaveStatus('loading')

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
          tagNamingSource: formDataCopy.tagNamingSource,
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
        await invalidateConfig()

        // Wait before setting status back to idle (exactly like DeleteSyncForm)
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Only now reset the status to idle
        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to save configuration:', error)
        const errorMessage = apiErrorMessage(error) ?? 'Failed to save settings'

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSaveStatus('idle')
        }, 1000)
      }
    },
    [form],
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

      const result = await createTagsMutation.mutateAsync()
      setLastActionResults(result)

      toast.success(result.message || 'User tags created successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to create user tags')
    }
  }, [createTagsMutation.mutateAsync])

  // Sync tags operation
  const handleSyncTags = useCallback(async () => {
    try {
      // Reset tag definitions deleted state when syncing tags (which may create new ones)
      setTagDefinitionsDeleted(false)
      setIsTagDeletionComplete(false)
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await syncTagsMutation.mutateAsync()
      setLastActionResults(result)

      toast.success(result.message || 'User tags synced successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to sync user tags')
    }
  }, [syncTagsMutation.mutateAsync])

  // Clean up orphaned tags operation
  const handleCleanupTags = useCallback(async () => {
    try {
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await cleanupTagsMutation.mutateAsync()
      setLastActionResults(result)

      toast.success(result.message || 'Orphaned tags cleaned up successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to clean up orphaned tags')
    }
  }, [cleanupTagsMutation.mutateAsync])

  // Show loading until config has loaded, with a consistent 500ms minimum
  const isLoading = isInitialLoading

  const initiateRemoveTags = useCallback(() => {
    setShowDeleteTagsConfirmation(true)
  }, [])

  const handleRemoveTags = useCallback(
    async (deleteTagDefinitions: boolean) => {
      try {
        // Reset completion state at the start of operation
        setIsTagDeletionComplete(false)

        const result =
          await removeTagsMutation.mutateAsync(deleteTagDefinitions)

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

        toast.error(apiErrorMessage(err) ?? 'Failed to remove user tags')
      }
    },
    [removeTagsMutation.mutateAsync],
  )

  return {
    form,
    // Use saveStatus instead of loading.userTags to match the DeleteSyncForm pattern
    isSaving: saveStatus === 'loading',
    isLoading,
    isCreatingTags: createTagsMutation.isPending,
    isSyncingTags: syncTagsMutation.isPending,
    isCleaningTags: cleanupTagsMutation.isPending,
    error:
      apiErrorMessage(createTagsMutation.error) ??
      apiErrorMessage(syncTagsMutation.error) ??
      apiErrorMessage(cleanupTagsMutation.error) ??
      apiErrorMessage(removeTagsMutation.error),
    lastActionResults,
    lastRemoveResults: localRemoveResults,
    tagDefinitionsDeleted,
    isTagDeletionComplete,
    onSubmit,
    handleCancel,
    handleCreateTags,
    handleSyncTags,
    handleCleanupTags,
    isRemovingTags: removeTagsMutation.isPending,
    showDeleteConfirmation: showDeleteTagsConfirmation,
    setShowDeleteConfirmation: setShowDeleteTagsConfirmation,
    initiateRemoveTags,
    handleRemoveTags,
  }
}
