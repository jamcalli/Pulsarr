import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import {
  PlexLabelingConfigSchema,
  type PlexLabelingStatusResponseSchema,
  type SyncPlexLabelsResponseSchema,
  type CleanupPlexLabelsResponseSchema,
  type RemovePlexLabelsResponseSchema,
} from '@root/schemas/labels/plex-labels.schema'
import type { z } from 'zod'

export type PlexLabelsFormValues = z.infer<typeof PlexLabelingConfigSchema>

// Union type for action results
type ActionResult =
  | z.infer<typeof SyncPlexLabelsResponseSchema>
  | z.infer<typeof CleanupPlexLabelsResponseSchema>
  | z.infer<typeof RemovePlexLabelsResponseSchema>

/**
 * Checks whether the provided action result represents a sync labels response.
 *
 * @returns True if the response has a `mode` property equal to `'sync'`; otherwise, false.
 */
export function isSyncLabelsResponse(
  response: ActionResult,
): response is z.infer<typeof SyncPlexLabelsResponseSchema> {
  return (
    (response as z.infer<typeof SyncPlexLabelsResponseSchema>).mode === 'sync'
  )
}

/**
 * Checks if an action result represents a cleanup labels response.
 *
 * @returns True if the response has a `pending` property and does not have a `mode` property; otherwise, false.
 */
export function isCleanupLabelsResponse(
  response: ActionResult,
): response is z.infer<typeof CleanupPlexLabelsResponseSchema> {
  // CleanupLabelsResponse doesn't have a mode property, but it has specific structure
  return (
    'pending' in response && 'orphaned' in response && !('mode' in response)
  )
}

/**
 * Checks if the given action result is a remove labels response.
 *
 * @returns True if the response has a `mode` property equal to `'remove'`; otherwise, false.
 */
export function isRemoveLabelsResponse(
  response: ActionResult,
): response is z.infer<typeof RemovePlexLabelsResponseSchema> {
  return (
    (response as z.infer<typeof RemovePlexLabelsResponseSchema>).mode ===
    'remove'
  )
}

/**
 * React hook for managing Plex labeling configuration and actions.
 *
 * Provides form state and validation for Plex labeling settings, and exposes handlers for fetching, updating, syncing, cleaning up, and removing Plex labels. Integrates with external stores for state management, synchronizes configuration, and displays toast notifications for operation results.
 *
 * The returned object includes the form instance, loading and error states, results of the latest operations, label deletion flags, and handler functions for all Plex label management operations.
 *
 * @returns An object with the form instance, operation state flags, last operation results, label deletion status, and handler functions for Plex label configuration and actions.
 */
export function usePlexLabels() {
  const [lastResults, setLastResults] = useState<z.infer<
    typeof PlexLabelingStatusResponseSchema
  > | null>(null)
  const [lastActionResults, setLastActionResults] =
    useState<ActionResult | null>(null)
  const [localRemoveResults, setLocalRemoveResults] = useState<z.infer<
    typeof RemovePlexLabelsResponseSchema
  > | null>(null)
  const [labelDefinitionsDeleted, setLabelDefinitionsDeleted] = useState(false)
  // Track when label deletion is complete
  const [isLabelDeletionComplete, setIsLabelDeletionComplete] = useState(false)
  // Add save status state to match DeleteSyncForm
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const hasInitializedRef = useRef(false)
  const initialLoadRef = useRef(true)

  const {
    loading,
    error,
    fetchPlexLabelsConfig,
    updatePlexLabelsConfig,
    syncPlexLabels,
    cleanupPlexLabels,
    removePlexLabelsResults,
    showDeletePlexLabelsConfirmation,
    setShowDeletePlexLabelsConfirmation,
    removePlexLabels,
    setLoadingWithMinDuration, // Important - this is used in DeleteSyncForm
  } = useUtilitiesStore()
  const { fetchConfig } = useConfigStore()

  // Update local remove results when store results change
  useEffect(() => {
    if (removePlexLabelsResults) {
      setLocalRemoveResults(removePlexLabelsResults)
    }
  }, [removePlexLabelsResults])

  // Initialize form with default values
  const form = useForm<PlexLabelsFormValues>({
    resolver: zodResolver(PlexLabelingConfigSchema),
    defaultValues: {
      enabled: false,
      labelFormat: 'pulsarr:{username}',
      concurrencyLimit: 5,
    },
  })

  // Update form values when config data is available
  const updateFormValues = useCallback(
    (data: z.infer<typeof PlexLabelingStatusResponseSchema>) => {
      form.reset({
        enabled: data.config.enabled,
        labelFormat: data.config.labelFormat,
        concurrencyLimit: data.config.concurrencyLimit || 5,
      })
    },
    [form],
  )

  // Fetch the configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      if (!initialLoadRef.current) return

      try {
        const data = await fetchPlexLabelsConfig()
        setLastResults(data)
        updateFormValues(data)
        initialLoadRef.current = false

        // Reset label definitions deleted state if labeling is enabled
        if (data.success && data.config.enabled) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }
      } catch (err) {
        // Error is already handled in the store
      }
    }

    fetchConfig()
  }, [fetchPlexLabelsConfig, updateFormValues])

  // Handle form submission - mimicking DeleteSyncForm exactly
  const onSubmit = useCallback(
    async (data: PlexLabelsFormValues) => {
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
        const updateConfigPromise = updatePlexLabelsConfig(formDataCopy)

        // Wait for both processes to complete (exactly like DeleteSyncForm)
        await Promise.all([
          updateConfigPromise.then((result) => {
            // Store the result for later use
            setLastResults(result)

            // If we enable labeling, we can no longer edit the label format
            if (result.success && data.enabled) {
              setLabelDefinitionsDeleted(false)
              setIsLabelDeletionComplete(false)
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
    [form, updatePlexLabelsConfig, setLoadingWithMinDuration, fetchConfig],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (lastResults) {
      updateFormValues(lastResults)
    }
  }, [lastResults, updateFormValues])

  // Sync labels operation
  const handleSyncLabels = useCallback(async () => {
    try {
      // Reset label definitions deleted state when syncing labels (which may create new ones)
      setLabelDefinitionsDeleted(false)
      setIsLabelDeletionComplete(false)
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await syncPlexLabels()
      setLastActionResults(result)

      toast.success(result.message || 'Pulsarr labels synced successfully')
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [syncPlexLabels])

  // Clean up orphaned labels operation
  const handleCleanupLabels = useCallback(async () => {
    try {
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await cleanupPlexLabels()
      setLastActionResults(result)

      toast.success(
        result.message || 'Orphaned Pulsarr labels cleaned up successfully',
      )
    } catch (err) {
      // Error is already handled in the store and displayed via toast
    }
  }, [cleanupPlexLabels])

  // Check if on initial loading - don't show loading on navigation
  if (!hasInitializedRef.current && !loading.plexLabels) {
    hasInitializedRef.current = true
  }

  // Only show loading skeleton on initial load, not on navigation
  const isLoading = !hasInitializedRef.current && loading.plexLabels

  const initiateRemoveLabels = useCallback(() => {
    setShowDeletePlexLabelsConfirmation(true)
  }, [setShowDeletePlexLabelsConfirmation])

  const handleRemoveLabels = useCallback(async () => {
    try {
      // Reset completion state at the start of operation
      setIsLabelDeletionComplete(false)

      const result = await removePlexLabels()

      // Set the local remove results
      setLocalRemoveResults(result)

      // Mark operation as complete
      if (!loading.removePlexLabels) {
        setIsLabelDeletionComplete(true)
      }

      setLabelDefinitionsDeleted(true)

      toast.success(result.message || 'Pulsarr labels removed successfully')
    } catch (err) {
      // Reset states on error
      setIsLabelDeletionComplete(false)
      setLabelDefinitionsDeleted(false)

      toast.error(
        err instanceof Error ? err.message : 'Failed to remove Pulsarr labels',
      )
    }
  }, [removePlexLabels, loading.removePlexLabels])

  // Handle toggle enable/disable with consistent loading patterns
  const handleToggle = useCallback(
    async (newEnabledState: boolean) => {
      setSaveStatus('loading')
      setLoadingWithMinDuration(true)

      try {
        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Get current form values and update enabled state
        const currentValues = form.getValues()
        const formData = { ...currentValues, enabled: newEnabledState }

        await Promise.all([
          updatePlexLabelsConfig(formData).then((result) => {
            // Store the result for later use
            setLastResults(result)

            // If we enable labeling, we can no longer edit the label format
            if (result.success && newEnabledState) {
              setLabelDefinitionsDeleted(false)
              setIsLabelDeletionComplete(false)
            }

            return result
          }),
          minimumLoadingTime,
        ])

        // Only update form state if the API call succeeds
        form.setValue('enabled', newEnabledState, { shouldDirty: false })

        // Refresh the global config to ensure other components get the updated values
        await fetchConfig()

        toast.success(
          `Plex labeling ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        )

        setSaveStatus('success')

        // Wait before setting status back to idle
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to toggle Plex labeling:', error)
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Failed to ${newEnabledState ? 'enable' : 'disable'} Plex labeling`

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSaveStatus('idle')
        }, 1000)

        // Re-throw the error for the component to handle
        throw error
      } finally {
        setLoadingWithMinDuration(false)
      }
    },
    [form, updatePlexLabelsConfig, setLoadingWithMinDuration, fetchConfig],
  )

  return {
    form,
    // Use saveStatus instead of loading.plexLabels to match the DeleteSyncForm pattern
    isSaving: saveStatus === 'loading',
    isToggling: saveStatus === 'loading',
    isLoading,
    isSyncingLabels: loading.syncPlexLabels,
    isCleaningLabels: loading.cleanupPlexLabels,
    error: error.plexLabels,
    lastResults,
    lastActionResults,
    lastRemoveResults: localRemoveResults,
    labelDefinitionsDeleted,
    isLabelDeletionComplete,
    onSubmit,
    handleCancel,
    handleToggle,
    handleSyncLabels,
    handleCleanupLabels,
    isRemovingLabels: loading.removePlexLabels,
    showDeleteConfirmation: showDeletePlexLabelsConfirmation,
    setShowDeleteConfirmation: setShowDeletePlexLabelsConfirmation,
    initiateRemoveLabels,
    handleRemoveLabels,
  }
}
