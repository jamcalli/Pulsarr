import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import type {
  SyncPlexLabelsResponseSchema,
  CleanupPlexLabelsResponseSchema,
  RemovePlexLabelsResponseSchema,
} from '@root/schemas/labels/plex-labels.schema'
import {
  PlexLabelSyncConfigSchema,
  type PlexLabelSyncConfig,
} from '@root/schemas/plex/label-sync-config.schema'
import type { z } from 'zod'
import { parseCronExpression } from '@/lib/utils'

export type PlexLabelsFormValues = z.infer<typeof PlexLabelSyncConfigSchema>

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
  return 'mode' in response && response.mode === 'sync'
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
  return 'mode' in response && response.mode === 'remove'
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

  const initialLoadRef = useRef(true)

  const {
    loading,
    error,
    syncPlexLabels,
    cleanupPlexLabels,
    removePlexLabelsResults,
    showDeletePlexLabelsConfirmation,
    setShowDeletePlexLabelsConfirmation,
    removePlexLabels,
    toggleScheduleStatus,
    updateSchedule,
    fetchSchedules,
    schedules,
    setLoadingWithMinDuration, // Important - this is used in DeleteSyncForm
  } = useUtilitiesStore()

  // Manually set loading state during initial load
  useEffect(() => {
    if (initialLoadRef.current) {
      useUtilitiesStore.setState((state) => ({
        ...state,
        loading: { ...state.loading, plexLabels: true },
      }))
    }
  }, [])
  const { config, updateConfig } = useConfigStore()

  // Update local remove results when store results change
  useEffect(() => {
    if (removePlexLabelsResults) {
      setLocalRemoveResults(removePlexLabelsResults)
    }
  }, [removePlexLabelsResults])

  // Get the plex-label-full-sync job from schedules
  const fullSyncJob = useMemo(() => {
    return schedules?.find((job) => job.name === 'plex-label-full-sync') || null
  }, [schedules])

  // Extract schedule time and day of week from cron expression
  const [scheduleTime, dayOfWeek] = useMemo(() => {
    if (fullSyncJob?.type === 'cron' && fullSyncJob.config?.expression) {
      return parseCronExpression(fullSyncJob.config.expression)
    }
    return [undefined, '*']
  }, [fullSyncJob])

  // Initialize form with default values
  const form = useForm<PlexLabelsFormValues>({
    resolver: zodResolver(PlexLabelSyncConfigSchema),
    defaultValues: {
      enabled: false,
      labelPrefix: 'pulsarr',
      concurrencyLimit: 5,
      cleanupOrphanedLabels: false,
      removedLabelMode: 'remove',
      removedLabelPrefix: 'pulsarr:removed',
      autoResetOnScheduledSync: false,
      scheduleTime: undefined,
      dayOfWeek: '*',
      tagSync: {
        enabled: false,
        syncRadarrTags: true,
        syncSonarrTags: true,
      },
    },
  })

  // Update form values when config data is available
  const updateFormValues = useCallback(
    (plexLabelSyncConfig: PlexLabelSyncConfig) => {
      form.reset({
        enabled: plexLabelSyncConfig.enabled,
        labelPrefix: plexLabelSyncConfig.labelPrefix,
        concurrencyLimit: plexLabelSyncConfig.concurrencyLimit || 5,
        cleanupOrphanedLabels:
          plexLabelSyncConfig.cleanupOrphanedLabels || false,
        removedLabelMode: plexLabelSyncConfig.removedLabelMode || 'remove',
        removedLabelPrefix:
          plexLabelSyncConfig.removedLabelPrefix || 'pulsarr:removed',
        autoResetOnScheduledSync:
          plexLabelSyncConfig.autoResetOnScheduledSync || false,
        scheduleTime: scheduleTime,
        dayOfWeek: dayOfWeek,
        tagSync: {
          enabled: plexLabelSyncConfig.tagSync?.enabled || false,
          syncRadarrTags: plexLabelSyncConfig.tagSync?.syncRadarrTags !== false,
          syncSonarrTags: plexLabelSyncConfig.tagSync?.syncSonarrTags !== false,
        },
      })
    },
    [form, scheduleTime, dayOfWeek],
  )

  // Initialize form values from config when available
  useEffect(() => {
    if (config?.plexLabelSync && initialLoadRef.current) {
      // Add minimum 500ms display time for initial loading
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      Promise.all([
        updateFormValues(config.plexLabelSync), // Existing logic
        minimumLoadingTime, // New timing enforcement
      ]).then(() => {
        initialLoadRef.current = false

        // Reset label definitions deleted state if labeling is enabled
        if (config?.plexLabelSync?.enabled) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        // Clear loading state
        useUtilitiesStore.setState((state) => ({
          ...state,
          loading: { ...state.loading, plexLabels: false },
        }))

        // WORKAROUND: Reset form to clear dirty state caused by Date object recreation
        // This matches the pattern used in Delete Sync form to prevent dirty state on load
        setTimeout(() => {
          form.reset(form.getValues(), { keepDirty: false })
        }, 0)
      })
    }
  }, [config?.plexLabelSync, updateFormValues, form])

  // Full sync schedule state
  const [isTogglingFullSyncStatus, setIsTogglingFullSyncStatus] =
    useState(false)

  // Format last run time
  const formatLastRun = useCallback(
    (lastRun: JobStatus['last_run'] | null | undefined) => {
      if (!lastRun?.time) return 'Never'
      try {
        return formatDistanceToNow(parseISO(lastRun.time), { addSuffix: true })
      } catch (e) {
        return lastRun.time
      }
    },
    [],
  )

  // Format next run time
  const formatNextRun = useCallback(
    (nextRun: JobStatus['next_run'] | null | undefined) => {
      if (!nextRun?.time) return 'Not scheduled'
      try {
        return formatDistanceToNow(parseISO(nextRun.time), { addSuffix: true })
      } catch (e) {
        return nextRun.time
      }
    },
    [],
  )

  // Load schedules on mount if not already loaded
  useEffect(() => {
    if (!schedules && !loading.schedules) {
      fetchSchedules().catch((err) => {
        console.error('Failed to fetch schedules:', err)
      })
    }
  }, [schedules, loading.schedules, fetchSchedules])

  // Handle time change for form integration (like Delete Sync)
  const handleTimeChange = useCallback(
    (newTime: Date, newDay?: string) => {
      form.setValue('scheduleTime', newTime, { shouldDirty: true })
      if (newDay !== undefined) {
        form.setValue('dayOfWeek', newDay, { shouldDirty: true })
      }
    },
    [form],
  )

  // Toggle full sync status directly (no confirmation)
  const handleToggleFullSyncStatus = useCallback(
    async (enabled: boolean) => {
      setIsTogglingFullSyncStatus(true)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Run operations in parallel and wait for both
        const [success] = await Promise.all([
          toggleScheduleStatus('plex-label-full-sync', !enabled),
          minimumLoadingTime,
        ])

        if (success) {
          toast.success(
            `Plex label full sync ${enabled ? 'disabled' : 'enabled'} successfully`,
          )
        } else {
          throw new Error('Failed to toggle full sync status')
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to toggle full sync status'
        toast.error(errorMessage)
      } finally {
        // Refresh schedules to update UI state regardless of success/failure
        await fetchSchedules().catch((fetchErr) => {
          console.error('Failed to refresh schedules after toggle:', fetchErr)
        })
        setIsTogglingFullSyncStatus(false)
      }
    },
    [toggleScheduleStatus, fetchSchedules],
  )

  // Handle form submission - using main config system
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

        // Update config through main config system
        const updateConfigPromise = updateConfig({
          plexLabelSync: formDataCopy,
        })

        // Handle schedule update if scheduleTime is provided
        let scheduleUpdatePromise = Promise.resolve()
        if (data.scheduleTime) {
          const hours = data.scheduleTime.getHours()
          const minutes = data.scheduleTime.getMinutes()
          const dayOfWeek = data.dayOfWeek || '*'

          // Create cron expression (seconds minutes hours day month weekday)
          const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`

          scheduleUpdatePromise = updateSchedule('plex-label-full-sync', {
            type: 'cron',
            config: {
              expression: cronExpression,
            },
          }).then((success) => {
            if (!success) {
              throw new Error(
                'Failed to update sync schedule. Configuration was saved but schedule was not updated.',
              )
            }
          })
        }

        // Wait for all processes to complete (exactly like DeleteSyncForm)
        await Promise.all([
          updateConfigPromise,
          scheduleUpdatePromise,
          minimumLoadingTime,
        ])

        // Refresh schedules to get updated data
        await fetchSchedules()

        // If we enable labeling, we can no longer edit the label format
        if (data.enabled) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        // Set success state
        setSaveStatus('success')

        toast.success('Settings saved successfully')

        // Reset form with updated configuration
        form.reset(formDataCopy, { keepDirty: false })

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
    [
      form,
      updateConfig,
      updateSchedule,
      setLoadingWithMinDuration,
      fetchSchedules,
    ],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (config?.plexLabelSync) {
      updateFormValues(config.plexLabelSync)
    }
  }, [config?.plexLabelSync, updateFormValues])

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

  // Show loading until we have initial data - use utilities store loading state for consistent 500ms minimum
  const isLoading = initialLoadRef.current && loading.plexLabels

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

        // Update config through main config system
        await Promise.all([
          updateConfig({ plexLabelSync: formData }),
          minimumLoadingTime,
        ])

        // If we enable labeling, we can no longer edit the label format
        if (newEnabledState) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        // Only update form state if the API call succeeds
        form.setValue('enabled', newEnabledState, { shouldDirty: false })

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
    [form, updateConfig, setLoadingWithMinDuration],
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
    lastResults: config?.plexLabelSync
      ? {
          success: true,
          message: 'Configuration loaded',
          config: config.plexLabelSync,
        }
      : null,
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

    // Full sync schedule functionality
    scheduleTime,
    dayOfWeek,
    fullSyncJob,
    formatLastRun,
    formatNextRun,
    isTogglingFullSyncStatus,
    handleToggleFullSyncStatus: () => {
      if (!fullSyncJob) return
      return handleToggleFullSyncStatus(fullSyncJob.enabled)
    },
    handleTimeChange,
  }
}
